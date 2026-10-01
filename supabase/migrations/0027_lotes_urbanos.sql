-- Arini Maps — migration 0027: lotes urbanos clicáveis.
--
-- Pedido do Carlos (call e especificação de 01/10/2026, item 6): "a cartografia
-- urbana deve ser clicável lote a lote", com as metragens, e o clique deve
-- abrir o mesmo caminho do rural — "esta área é minha" / consultar.
--
-- A planta do CAD é um desenho de LINHAS: não existe "o lote" no arquivo, só os
-- traços que o cercam. Os lotes são obtidos fechando as linhas em polígonos
-- (ST_Polygonize) e ficando com as faces que têm tamanho e forma de lote.
-- Medido em 01/10/2026 na planta de Iturama (207.603 linhas, 122 mil visíveis):
-- 39.711 faces, das quais 12.120 entre 120 e 2.500 m² e compactas; 75 s de
-- processamento. Por esse tempo, a geração roda fora da requisição web
-- (scripts/gera-lotes.mjs ou o worker, tipo de job `gerar_lotes`).

create table if not exists urban_lots (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid not null references cartography_layers(id) on delete cascade,
  municipality_id uuid references municipalities(id) on delete set null,
  geom geometry(Polygon, 4326) not null,
  area_m2 numeric not null,
  perimetro_m numeric not null,
  -- medidas dos lados, em metros, na ordem do contorno: [{"m": 12.0}, ...]
  lados jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists idx_urban_lots_geom on urban_lots using gist (geom);
create index if not exists idx_urban_lots_layer on urban_lots (layer_id);
alter table urban_lots enable row level security;   -- só o servidor lê (rotas /api/geo/lotes)

alter table cartography_layers
  add column if not exists lotes_total integer,
  add column if not exists lotes_gerados_em timestamptz,
  -- calibração e camadas ocultas usadas na geração: se mudarem, os lotes ficam defasados
  add column if not exists lotes_assinatura text;

-- a divisa do anúncio pode vir de um lote da planta
alter type geometry_source add value if not exists 'lote';

/** Lotes no retângulo da tela, para o mapa (a partir do zoom de quadra). */
create or replace function fn_lotes_bbox(
  p_x0 double precision, p_y0 double precision, p_x1 double precision, p_y1 double precision,
  p_limite integer default 4000
) returns json language sql stable security definer set search_path = public as $$
  with env as (select st_makeenvelope(p_x0, p_y0, p_x1, p_y1, 4326) g),
  sel as (select l.* from urban_lots l, env where l.geom && env.g limit p_limite + 1)
  select json_build_object(
    'type', 'FeatureCollection',
    'truncado', (select count(*) from sel) > p_limite,
    'features', coalesce((select json_agg(json_build_object(
      'type', 'Feature',
      'geometry', st_asgeojson(geom, 7)::json,
      'properties', json_build_object('id', id, 'area_m2', round(area_m2, 1))
    )) from (select * from sel limit p_limite) s), '[]'::json)
  )
$$;

/** Um lote com tudo: divisa, área, perímetro, medidas dos lados e município. */
create or replace function fn_lote(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(l.geom, 7)::json,
    'properties', json_build_object(
      'id', l.id, 'area_m2', round(l.area_m2, 2), 'perimetro_m', round(l.perimetro_m, 2), 'lados', l.lados,
      'municipio', m.nome, 'municipality_id', l.municipality_id,
      'anuncio', (select p.codigo from properties p join property_geometries g on g.property_id = p.id
                  where p.status in ('publicado', 'em_negociacao')
                    and st_intersects(g.geom, st_pointonsurface(l.geom)) limit 1)
    )
  ) from urban_lots l left join municipalities m on m.id = l.municipality_id where l.id = p_id
$$;

-- só o servidor executa (a 0026 já fechou o padrão; reforço explícito)
revoke execute on function fn_lotes_bbox(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function fn_lote(uuid) from public, anon, authenticated;
grant execute on function fn_lotes_bbox(double precision, double precision, double precision, double precision, integer) to service_role;
grant execute on function fn_lote(uuid) to service_role;
