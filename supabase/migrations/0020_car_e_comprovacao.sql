-- Arini Imóveis Brasil — migration 0020: malha do CAR no mapa + comprovação de propriedade.
--
-- Pedido do Carlos (24/09/2026): toda área rural já está mapeada no CAR; o
-- proprietário clica na área dele no mapa e cadastra para venda, enviando os
-- documentos que comprovam a propriedade, que a Arini confere antes de publicar.
--
-- Em 28/08 o WFS do SICAR publicava zero camadas. Sondado de novo em 24/09:
-- `sicar:sicar_imoveis_<uf>` responde com geometria e atributos (código do
-- CAR, área, situação, município). Os 6 municípios do piloto somam ~10.200
-- imóveis; Iturama inteira veio em 0,6 s e 1,8 MB. Por isso a malha é
-- importada para cá (mapa não depende do SICAR estar no ar) e atualizada por
-- botão/script.
--
-- CAR NÃO É PROVA DE PROPRIEDADE: é autodeclarado e tem sobreposição. Ele dá a
-- divisa pronta; a prova é o documento enviado e conferido (abaixo).

create table if not exists car_imoveis (
  cod_imovel text primary key,              -- ex.: MG-3134400-9F0B6712386C4AB5835C371A868EA05C
  geom geometry(MultiPolygon, 4326) not null,
  area_ha numeric,
  status text,                              -- AT (ativo), PE (pendente), SU (suspenso), CA (cancelado)
  condicao text,                            -- "Aguardando análise", "Analisado"...
  tipo_imovel text,                         -- IRU (rural), AST (assentamento), PCT (povos tradicionais)
  municipio text,
  cod_ibge integer,
  uf text,
  modulos_fiscais numeric,
  criado_sicar timestamptz,
  atualizado_sicar timestamptz,
  importado_em timestamptz not null default now()
);
create index if not exists idx_car_geom on car_imoveis using gist (geom);
create index if not exists idx_car_ibge on car_imoveis (cod_ibge);
-- dado público, mas só o servidor lê (rotas /api/geo/car)
alter table car_imoveis enable row level security;

/** Upsert de uma FeatureCollection do WFS do SICAR. Devolve quantos gravou. */
create or replace function fn_car_upsert(p_fc jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into car_imoveis (cod_imovel, geom, area_ha, status, condicao, tipo_imovel, municipio,
                           cod_ibge, uf, modulos_fiscais, criado_sicar, atualizado_sicar, importado_em)
  select f->'properties'->>'cod_imovel',
         st_multi(st_makevalid(st_setsrid(st_geomfromgeojson(f->>'geometry'), 4326)))::geometry(MultiPolygon, 4326),
         nullif(f->'properties'->>'area', '')::numeric,
         f->'properties'->>'status_imovel',
         f->'properties'->>'condicao',
         f->'properties'->>'tipo_imovel',
         f->'properties'->>'municipio',
         nullif(f->'properties'->>'cod_municipio_ibge', '')::integer,
         f->'properties'->>'uf',
         nullif(f->'properties'->>'m_fiscal', '')::numeric,
         nullif(f->'properties'->>'dat_criacao', '')::timestamptz,
         nullif(f->'properties'->>'data_atualizacao', '')::timestamptz,
         now()
  from jsonb_array_elements(p_fc->'features') f
  where f->'properties'->>'cod_imovel' is not null
    and f->'geometry' is not null
    and st_geometrytype(st_geomfromgeojson(f->>'geometry')) in ('ST_Polygon', 'ST_MultiPolygon')
  on conflict (cod_imovel) do update set
    geom = excluded.geom, area_ha = excluded.area_ha, status = excluded.status,
    condicao = excluded.condicao, tipo_imovel = excluded.tipo_imovel, municipio = excluded.municipio,
    cod_ibge = excluded.cod_ibge, uf = excluded.uf, modulos_fiscais = excluded.modulos_fiscais,
    criado_sicar = excluded.criado_sicar, atualizado_sicar = excluded.atualizado_sicar,
    importado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;

/**
 * Imóveis do CAR num retângulo, para o mapa. Simplificado a ~1 m (a divisa
 * continua fiel no zoom de lote e o JSON cai pela metade) e com teto: acima
 * do teto o mapa pede para aproximar, em vez de travar o navegador.
 */
create or replace function fn_car_bbox(
  p_x0 double precision, p_y0 double precision, p_x1 double precision, p_y1 double precision,
  p_limite integer default 2500
) returns json language sql stable security definer set search_path = public as $$
  with env as (select st_makeenvelope(p_x0, p_y0, p_x1, p_y1, 4326) g),
  sel as (
    select c.* from car_imoveis c, env
    where c.geom && env.g and c.status is distinct from 'CA'
    limit p_limite + 1
  )
  select json_build_object(
    'type', 'FeatureCollection',
    'truncado', (select count(*) from sel) > p_limite,
    'features', coalesce((select json_agg(json_build_object(
      'type', 'Feature',
      'geometry', st_asgeojson(st_simplifypreservetopology(geom, 0.00001), 6)::json,
      'properties', json_build_object(
        'cod', cod_imovel, 'area_ha', round(area_ha, 2), 'condicao', condicao,
        'status', status, 'tipo', tipo_imovel, 'municipio', municipio)
    )) from (select * from sel limit p_limite) s), '[]'::json)
  )
$$;

/** Um imóvel do CAR com a geometria inteira (sem simplificar) — vira a divisa do anúncio. */
create or replace function fn_car_imovel(p_cod text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(geom, 7)::json,
    'properties', json_build_object(
      'cod', cod_imovel, 'area_ha', area_ha, 'condicao', condicao, 'status', status,
      'tipo', tipo_imovel, 'municipio', municipio, 'cod_ibge', cod_ibge,
      'atualizado_sicar', atualizado_sicar, 'importado_em', importado_em)
  ) from car_imoveis where cod_imovel = p_cod
$$;

-- a divisa do anúncio pode vir do CAR
alter type geometry_source add value if not exists 'car';

alter table properties add column if not exists car_codigo text;
create index if not exists idx_properties_car on properties (car_codigo);

-- comprovação: quem da Arini conferiu cada documento, e quando
alter table property_documents
  add column if not exists nome_arquivo text,
  add column if not exists verificado_por uuid references profiles(user_id),
  add column if not exists verificado_em timestamptz;

-- o CAR deixa de "depender de importação": a malha vem do WFS do SICAR
update fontes_externas set
  tipo = 'wfs', ativa = true, mecanismo = 'wfs',
  endpoint = 'https://geoserver.car.gov.br/geoserver/sicar/ows',
  camada = 'sicar:sicar_imoveis_<uf>',
  observacao = 'Sondado de novo em 24/09/2026: o WFS passou a publicar sicar_imoveis_<uf> com geometria, código, área e situação (em 28/08 publicava zero camadas). A malha dos municípios do piloto é importada para car_imoveis; a consulta territorial pergunta ao vivo.'
where id = 'car';
