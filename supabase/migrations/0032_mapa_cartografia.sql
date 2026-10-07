-- Arini Maps — migration 0032: mapa e cartografia (roadmap 2.10, 2.11, 2.12, 5.6).
--
-- 2.11  Número do lote e da quadra, lidos dos textos da planta CAD
--       (scripts/numera-lotes.mjs) — colunas em urban_lots, no cartão do lote,
--       no tile vetorial (camada `rotulos`).
-- 2.10  "Consultar informações" no lote urbano: envelope do lote para as fontes
--       ao vivo (mesmo caminho da consulta do CAR, chave `lote:<id>`).
-- 5.6   Consulta de uma área desenhada em qualquer ponto do Brasil
--       (chave `geo:<sha1>`): a geometria fica guardada para a página da consulta.
-- 2.12  Pontos de interesse: data da última atualização por imóvel e a fila de
--       atualização periódica (job `refresh_pois`).
--
-- Tudo idempotente: pode rodar de novo sem efeito colateral.

-- ---------------------------------------------------------------------------
-- 2.11 — número e quadra do lote
-- ---------------------------------------------------------------------------
alter table urban_lots
  add column if not exists numero text,
  add column if not exists quadra text;
create index if not exists idx_urban_lots_numero on urban_lots (layer_id, quadra, numero);

/** Um lote com tudo: divisa, área, perímetro, lados, número, quadra e município. */
create or replace function fn_lote(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(l.geom, 7)::json,
    'properties', json_build_object(
      'id', l.id, 'area_m2', round(l.area_m2, 2), 'perimetro_m', round(l.perimetro_m, 2), 'lados', l.lados,
      'numero', l.numero, 'quadra', l.quadra,
      'municipio', m.nome, 'uf', m.uf, 'municipality_id', l.municipality_id,
      'lng', st_x(st_pointonsurface(l.geom)), 'lat', st_y(st_pointonsurface(l.geom)),
      'anuncio', (select p.codigo from properties p join property_geometries g on g.property_id = p.id
                  where p.status in ('publicado', 'em_negociacao')
                    and st_intersects(g.geom, st_pointonsurface(l.geom)) limit 1)
    )
  ) from urban_lots l left join municipalities m on m.id = l.municipality_id where l.id = p_id
$$;

-- Tile dos lotes: igual ao da 0031, mais número/quadra nas propriedades e a
-- camada `rotulos` (um ponto por lote numerado, a partir do zoom 17). O ponto
-- só entra no tile em que cai (sem a margem de 64): com margem, o mesmo número
-- apareceria duas vezes na emenda de dois tiles.
create or replace function fn_mvt_lotes(z integer, x integer, y integer) returns bytea
language plpgsql stable security definer set search_path = public as $$
declare
  env geometry := st_tileenvelope(z, x, y);
  lotes bytea;
  medidas bytea;
  rotulos bytea;
begin
  if z < 15 then return null; end if;

  select st_asmvt(q, 'lotes', 4096, 'geom') into lotes from (
    select l.id::text as id, round(l.area_m2, 1) as area_m2, l.numero, l.quadra,
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

    select st_asmvt(q, 'rotulos', 4096, 'geom') into rotulos from (
      select l.numero, l.quadra,
        st_asmvtgeom(st_pointonsurface(l.geom_3857), env, 4096, 0, true) as geom
      from urban_lots l
      where l.geom_3857 && env and (l.numero is not null or l.quadra is not null)
        and st_intersects(st_pointonsurface(l.geom_3857), env)
    ) q where q.geom is not null;
  end if;

  if lotes is null and medidas is null and rotulos is null then return null; end if;
  return coalesce(lotes, ''::bytea) || coalesce(medidas, ''::bytea) || coalesce(rotulos, ''::bytea);
end $$;

-- ---------------------------------------------------------------------------
-- 2.10 — envelope do lote para a consulta às fontes ao vivo
-- ---------------------------------------------------------------------------
/** Envelope de um lote urbano, com folga em metros, no formato dos adaptadores. */
create or replace function fn_lote_bbox(p_id uuid, p_buffer_m numeric default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'xmin', st_xmin(e), 'ymin', st_ymin(e), 'xmax', st_xmax(e), 'ymax', st_ymax(e),
    'lng', st_x(st_centroid(e)), 'lat', st_y(st_centroid(e))
  )
  from (
    select st_envelope(
      case when p_buffer_m > 0 then st_buffer(l.geom::geography, p_buffer_m)::geometry else l.geom end
    ) as e
    from urban_lots l where l.id = p_id
  ) t
$$;

-- ---------------------------------------------------------------------------
-- 5.6 — área desenhada em qualquer ponto do Brasil
-- ---------------------------------------------------------------------------
create table if not exists consultas_area_geom (
  chave text primary key,                     -- 'geo:<sha1 da geometria normalizada>'
  geom geometry(MultiPolygon, 4326) not null,
  area_ha numeric not null,
  user_id uuid references profiles(user_id) on delete set null,   -- quem desenhou primeiro
  created_at timestamptz not null default now()
);
create index if not exists idx_consultas_area_geom on consultas_area_geom using gist (geom);
alter table consultas_area_geom enable row level security;   -- só o servidor lê e grava

/**
 * Registra (ou reaproveita) a área desenhada e devolve área, envelope com folga
 * e se a geometria é válida. A chave é calculada no servidor a partir da
 * geometria normalizada: a mesma área desenhada duas vezes cai no mesmo cache.
 */
create or replace function fn_area_consulta_registrar(p_chave text, p_geojson jsonb, p_user uuid, p_buffer_m numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g geometry;
  e geometry;
  area numeric;
begin
  g := st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(p_geojson::text), 4326)), 3));
  if g is null or st_isempty(g) then
    return jsonb_build_object('valida', false, 'motivo', 'A área desenhada não forma um polígono.');
  end if;
  area := st_area(g::geography) / 10000;
  insert into consultas_area_geom (chave, geom, area_ha, user_id)
  values (p_chave, g, area, p_user)
  on conflict (chave) do nothing;
  e := st_envelope(case when p_buffer_m > 0 then st_buffer(g::geography, p_buffer_m)::geometry else g end);
  return jsonb_build_object(
    'valida', true, 'area_ha', round(area, 4),
    'bbox', jsonb_build_object(
      'xmin', st_xmin(e), 'ymin', st_ymin(e), 'xmax', st_xmax(e), 'ymax', st_ymax(e),
      'lng', st_x(st_centroid(e)), 'lat', st_y(st_centroid(e)))
  );
end $$;

/** A área guardada, para a página da consulta (geometria + município da região, se houver). */
create or replace function fn_area_consulta(p_chave text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'chave', a.chave, 'area_ha', round(a.area_ha, 4), 'created_at', a.created_at,
    'geometry', st_asgeojson(a.geom, 7)::jsonb,
    'lng', st_x(st_pointonsurface(a.geom)), 'lat', st_y(st_pointonsurface(a.geom)),
    'municipio', (select m.nome || ' — ' || m.uf from municipalities m
                  where m.geom is not null and st_intersects(m.geom, st_pointonsurface(a.geom)) limit 1)
  )
  from consultas_area_geom a where a.chave = p_chave
$$;

-- ---------------------------------------------------------------------------
-- 2.12 — pontos de interesse: distância e atualização periódica
-- ---------------------------------------------------------------------------
alter table properties add column if not exists pois_atualizados_em timestamptz;

-- o vínculo passa a carimbar a data: é ela que decide quem entra na fila de atualização
create or replace function fn_vincular_pois(p_property_id uuid, p_raio_m numeric default 10000)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from property_pois where property_id = p_property_id;
  insert into property_pois (property_id, poi_id, distancia_m, destaque)
  select p_property_id, t.id, round(t.dist), t.rn = 1
  from (
    select po.id,
           st_distance(po.geom::geography, g.centroid::geography) as dist,
           row_number() over (
             partition by po.categoria
             order by st_distance(po.geom::geography, g.centroid::geography)
           ) as rn
    from pois po
    join property_geometries g on g.property_id = p_property_id
    where st_dwithin(po.geom::geography, g.centroid::geography, p_raio_m)
  ) t
  where t.rn <= 3;
  get diagnostics n = row_count;
  update properties set pois_atualizados_em = now() where id = p_property_id;
  return n;
end $$;

/**
 * Enfileira `refresh_pois` para os imóveis publicados cujos pontos de interesse
 * têm mais de `p_dias` dias (ou nunca foram buscados). Não duplica: quem já tem
 * job de POI pendente fica de fora. Devolve quantos entraram na fila.
 */
create or replace function fn_enfileirar_refresh_pois(p_dias integer default 90, p_limite integer default 200)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into jobs (tipo, payload)
  select 'refresh_pois', jsonb_build_object('property_id', p.id, 'motivo', 'periodico')
  from properties p
  join property_geometries g on g.property_id = p.id
  where p.status in ('publicado', 'em_negociacao')
    and (p.pois_atualizados_em is null or p.pois_atualizados_em < now() - make_interval(days => p_dias))
    and not exists (
      select 1 from jobs j
      where j.tipo in ('refresh_pois', 'fetch_pois') and j.status in ('pendente', 'processando')
        and j.payload->>'property_id' = p.id::text
    )
  order by p.pois_atualizados_em nulls first
  limit p_limite;
  get diagnostics n = row_count;
  return n;
end $$;

/** POIs do cache ao redor de um ponto, os mais próximos de cada categoria (consulta do lote). */
create or replace function fn_pois_proximos(p_lng double precision, p_lat double precision, p_raio_m numeric default 4000, p_por_categoria integer default 2)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', t.nome, 'categoria', t.categoria, 'distancia_m', round(t.dist), 'lng', t.lng, 'lat', t.lat
  ) order by t.dist), '[]'::jsonb)
  from (
    select po.nome, po.categoria, st_x(po.geom) lng, st_y(po.geom) lat,
      st_distance(po.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) dist,
      row_number() over (partition by po.categoria
        order by st_distance(po.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)) rn
    from pois po
    where st_dwithin(po.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raio_m)
  ) t where t.rn <= p_por_categoria
$$;

-- só o servidor executa (padrão desde a 0026)
revoke execute on function fn_lote(uuid) from public, anon, authenticated;
revoke execute on function fn_mvt_lotes(integer, integer, integer) from public, anon, authenticated;
revoke execute on function fn_lote_bbox(uuid, numeric) from public, anon, authenticated;
revoke execute on function fn_area_consulta_registrar(text, jsonb, uuid, numeric) from public, anon, authenticated;
revoke execute on function fn_area_consulta(text) from public, anon, authenticated;
revoke execute on function fn_vincular_pois(uuid, numeric) from public, anon, authenticated;
revoke execute on function fn_enfileirar_refresh_pois(integer, integer) from public, anon, authenticated;
revoke execute on function fn_pois_proximos(double precision, double precision, numeric, integer) from public, anon, authenticated;
grant execute on function fn_lote(uuid) to service_role;
grant execute on function fn_mvt_lotes(integer, integer, integer) to service_role;
grant execute on function fn_lote_bbox(uuid, numeric) to service_role;
grant execute on function fn_area_consulta_registrar(text, jsonb, uuid, numeric) to service_role;
grant execute on function fn_area_consulta(text) to service_role;
grant execute on function fn_vincular_pois(uuid, numeric) to service_role;
grant execute on function fn_enfileirar_refresh_pois(integer, integer) to service_role;
grant execute on function fn_pois_proximos(double precision, double precision, numeric, integer) to service_role;
