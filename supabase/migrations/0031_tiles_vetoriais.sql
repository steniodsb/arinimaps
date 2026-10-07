-- Arini Maps — migration 0031: tiles vetoriais (MVT) para a malha do CAR e os
-- lotes urbanos.
--
-- Queixa do Stenio (07/10/2026): o mapa demora para acompanhar o zoom e a
-- marcação some ao afastar. Causa: CAR e lotes chegavam como GeoJSON inteiro a
-- cada movimento (até 9 mil lotes por pedido), o MapLibre refatiava tudo na
-- thread principal e as metragens dos lados eram recalculadas no navegador a
-- cada parada. E, para não travar, a malha do CAR era escondida abaixo do zoom
-- 12 — daí "some ao afastar".
--
-- Agora o banco gera o tile pronto (ST_AsMVT): cada tile pesa poucos KB, o
-- navegador guarda em cache e desenha sem reprocessar. A malha pode aparecer
-- desde a visão regional, afinando o traço conforme afasta.

-- ---------------------------------------------------------------------------
-- Geometrias em 3857 já calculadas: o tile não refaz a projeção de 10 mil
-- polígonos a cada pedido.
-- ---------------------------------------------------------------------------
alter table car_imoveis add column if not exists geom_3857 geometry(MultiPolygon, 3857);
update car_imoveis set geom_3857 = st_transform(geom, 3857) where geom_3857 is null;
create index if not exists idx_car_geom_3857 on car_imoveis using gist (geom_3857);
alter table urban_lots add column if not exists geom_3857 geometry(Polygon, 3857);
update urban_lots set geom_3857 = st_transform(geom, 3857) where geom_3857 is null;
create index if not exists idx_urban_lots_geom_3857 on urban_lots using gist (geom_3857);

-- quem importa de novo (CAR, lotes) mantém a coluna em dia sem precisar lembrar
create or replace function fn_geom_3857_sync() returns trigger language plpgsql as $$
begin
  new.geom_3857 := st_transform(new.geom, 3857);
  return new;
end $$;
drop trigger if exists trg_car_geom_3857 on car_imoveis;
create trigger trg_car_geom_3857 before insert or update of geom on car_imoveis for each row execute function fn_geom_3857_sync();
drop trigger if exists trg_lots_geom_3857 on urban_lots;
create trigger trg_lots_geom_3857 before insert or update of geom on urban_lots for each row execute function fn_geom_3857_sync();

-- ---------------------------------------------------------------------------
-- CAR. Abaixo do zoom 10 só entram as áreas maiores (quem olha a região inteira
-- não distingue um sítio de 5 ha; e são 10 mil polígonos).
-- Lotes urbanos: camada `lotes` (divisa + id) a partir do zoom 15 e, a partir
-- do 17, a camada `medidas` com uma etiqueta por lado (metros e ângulo do
-- texto), 1,5 m para dentro do lote para não cair em cima da do vizinho. As
-- duas camadas vão no mesmo tile: protobuf concatena campos repetidos.
-- ---------------------------------------------------------------------------
create or replace function fn_mvt_car(z integer, x integer, y integer) returns bytea
language plpgsql stable security definer set search_path = public as $$
declare
  env geometry := st_tileenvelope(z, x, y);
  mvt bytea;
  -- afastado, só as áreas grandes: ninguém distingue um sítio de 5 ha na visão regional
  area_min numeric := case when z <= 8 then 200 when z = 9 then 100 when z = 10 then 10 else 0 end;
  -- simplifica a divisa para a resolução do tile (2 unidades da grade de 4096)
  tol double precision := (st_xmax(env) - st_xmin(env)) / 4096 * 2;
begin
  if z < 7 then return null; end if;
  select st_asmvt(q, 'car', 4096, 'geom') into mvt from (
    select
      c.cod_imovel as cod,
      round(c.area_ha::numeric, 2) as area_ha,
      c.condicao, c.status, c.tipo_imovel as tipo, c.municipio,
      st_asmvtgeom(st_simplify(c.geom_3857, tol, true), env, 4096, 64, true) as geom
    from car_imoveis c
    where c.geom_3857 && env and coalesce(c.area_ha, 0) >= area_min
  ) q where q.geom is not null;
  return mvt;
end $$;

create or replace function fn_mvt_lotes(z integer, x integer, y integer) returns bytea
language plpgsql stable security definer set search_path = public as $$
declare
  env geometry := st_tileenvelope(z, x, y);
  lotes bytea;
  medidas bytea;
begin
  if z < 15 then return null; end if;

  select st_asmvt(q, 'lotes', 4096, 'geom') into lotes from (
    select l.id::text as id, round(l.area_m2, 1) as area_m2,
      st_asmvtgeom(st_simplify(l.geom_3857, (st_xmax(env) - st_xmin(env)) / 4096 * 1.5, true), env, 4096, 64, true) as geom
    from urban_lots l
    where l.geom_3857 && env
  ) q where q.geom is not null;

  if z >= 17 then
    select st_asmvt(q, 'medidas', 4096, 'geom') into medidas from (
      with l as (
        select geom_3857 as g from urban_lots where geom_3857 && env
      ), seg as (
        select st_centroid(l.g) as c, (d).geom as s from l, lateral st_dumpsegments(st_exteriorring(l.g)) d
      ), calc as (
        select c, s, st_lineinterpolatepoint(s, 0.5) as mid,
          st_length(st_transform(s, 4326)::geography) as len,
          degrees(st_azimuth(st_startpoint(s), st_endpoint(s))) - 90 as a
        from seg
      ), pt as (
        select len, a,
          st_setsrid(st_makepoint(
            st_x(mid) + (st_x(c) - st_x(mid)) / nullif(st_distance(c, mid), 0) * 1.5,
            st_y(mid) + (st_y(c) - st_y(mid)) / nullif(st_distance(c, mid), 0) * 1.5
          ), 3857) as p
        from calc where len >= 3 and a is not null
      )
      select
        replace(round(len::numeric, 2)::text, '.', ',') as m,
        case when a > 90 then a - 180 when a < -90 then a + 180 else a end as ang,
        st_asmvtgeom(p, env, 4096, 64, true) as geom
      from pt
    ) q where q.geom is not null;
  end if;

  if lotes is null and medidas is null then return null; end if;
  return coalesce(lotes, ''::bytea) || coalesce(medidas, ''::bytea);
end $$;

-- só o servidor pede tiles (service_role); nascem fechadas pela 0026

-- O PostgREST do Supabase não devolve bytea cru (406 para application/octet-
-- stream), então o servidor pede o tile em base64 e decodifica — ~33% a mais
-- entre o banco e o servidor, nada para o navegador.
create or replace function fn_tile_car(z integer, x integer, y integer) returns text
language sql stable security definer set search_path = public as $$
  select encode(fn_mvt_car(z, x, y), 'base64')
$$;
create or replace function fn_tile_lotes(z integer, x integer, y integer) returns text
language sql stable security definer set search_path = public as $$
  select encode(fn_mvt_lotes(z, x, y), 'base64')
$$;
