-- Arini Imóveis Brasil — migration 0051: biomas oficiais e municípios do IBGE.
--
-- Itens 4 e 8 do levantamento de fontes do Carlos (22/10/2026):
--   · bioma oficial (IBGE, Biomas do Brasil 1:250.000) no relatório da área e
--     no mapa; o MapBiomas fica como complemento, não substitui o limite oficial;
--   · malha, código e indicadores de cada município (Censo 2022, população
--     estimada, PIB dos Municípios).
--
-- Os dados vêm do IBGE e são carregados por `node scripts/ibge-importa.mjs`
-- (uma vez, e de novo quando o IBGE publicar ano novo). O sistema não pergunta
-- ao IBGE na hora da consulta: lê o banco. Tudo só pelo servidor (service_role).

-- ---------------------------------------------------------------------------
-- Biomas
-- ---------------------------------------------------------------------------

create table if not exists ibge_biomas (
  cd_bioma integer primary key,
  nome text not null,
  geom geometry(MultiPolygon, 4326) not null,
  -- versão simplificada (~900 m) para desenhar no mapa
  geom_mapa geometry(MultiPolygon, 4326),
  area_km2 numeric,
  fonte text not null,
  importado_em timestamptz not null default now()
);

/** O mesmo bioma em pedaços de até 256 vértices: o cruzamento com uma área pequena fica rápido. */
create table if not exists ibge_biomas_partes (
  id bigserial primary key,
  cd_bioma integer not null references ibge_biomas (cd_bioma) on delete cascade,
  nome text not null,
  geom geometry(Polygon, 4326) not null
);
create index if not exists idx_ibge_biomas_partes_geom on ibge_biomas_partes using gist (geom);

-- ---------------------------------------------------------------------------
-- Municípios
-- ---------------------------------------------------------------------------

/**
 * Os 5.570 municípios com a malha do IBGE (qualidade intermediária) e os
 * indicadores. `indicadores` = { chave: { valor, ano, unidade, fonte } }, para
 * entrar indicador novo sem mudar a tabela.
 */
create table if not exists ibge_municipios (
  cod_ibge integer primary key,
  nome text not null,
  uf text not null,
  geom geometry(MultiPolygon, 4326),
  indicadores jsonb not null default '{}'::jsonb,
  malha_em timestamptz,
  indicadores_em timestamptz
);
create index if not exists idx_ibge_municipios_geom on ibge_municipios using gist (geom);
create index if not exists idx_ibge_municipios_uf on ibge_municipios (uf);

alter table ibge_biomas enable row level security;
alter table ibge_biomas_partes enable row level security;
alter table ibge_municipios enable row level security;

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------

/**
 * Biomas numa área: hectares de cada bioma dentro do envelope e a porcentagem
 * sobre a parte em terra (mar e lagoa costeira não contam). Fonte `ibge_biomas`
 * do relatório.
 */
create or replace function fn_biomas_envelope(p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8)
returns jsonb language sql stable security definer set search_path = public as $$
  with env as (select st_makeenvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) as g),
  por as (
    select p.cd_bioma, p.nome, sum(st_area(st_intersection(p.geom, env.g)::geography)) / 10000 as ha
    from ibge_biomas_partes p, env
    where st_intersects(p.geom, env.g)
    group by p.cd_bioma, p.nome
  ),
  tot as (select sum(ha) as ha from por)
  select jsonb_build_object(
    'total_ha', round(coalesce((select ha from tot), 0)::numeric, 1),
    'biomas', coalesce((select jsonb_agg(jsonb_build_object(
        'cd_bioma', cd_bioma, 'bioma', nome, 'area_ha', round(ha::numeric, 1),
        'pct', round((100 * ha / nullif((select ha from tot), 0))::numeric, 1)
      ) order by ha desc) from por), '[]'::jsonb),
    'fonte', (select fonte from ibge_biomas limit 1),
    'importado_em', (select max(importado_em) from ibge_biomas)
  )
$$;

/**
 * Biomas recortados numa célula do mapa, já simplificados (src/lib/geo/camadasMapa.ts).
 * O id leva a célula: a mesma feição em células vizinhas são pedaços diferentes.
 */
create or replace function fn_biomas_mapa(p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8)
returns jsonb language sql stable security definer set search_path = public as $$
  with env as (select st_makeenvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) as g)
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(x.g, 5)::jsonb,
    'properties', jsonb_build_object('id', x.cd_bioma || ':' || round(p_xmin::numeric, 3) || ':' || round(p_ymax::numeric, 3),
                                     'cd_bioma', x.cd_bioma, 'nome', x.nome)
  )), '[]'::jsonb)
  from (
    select b.cd_bioma, b.nome, st_collectionextract(st_intersection(b.geom_mapa, env.g), 3) as g
    from ibge_biomas b, env
    where b.geom_mapa && env.g and st_intersects(b.geom_mapa, env.g)
  ) x
  where not st_isempty(x.g)
$$;

/** Município do IBGE que contém o ponto, com os indicadores. */
create or replace function fn_municipio_no_ponto(p_lng float8, p_lat float8)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('cod_ibge', cod_ibge, 'nome', nome, 'uf', uf,
                            'indicadores', indicadores, 'indicadores_em', indicadores_em)
  from ibge_municipios
  where geom && st_setsrid(st_makepoint(p_lng, p_lat), 4326)
    and st_intersects(geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
  limit 1
$$;

/** Município pelo código do IBGE, com os indicadores. */
create or replace function fn_ibge_municipio(p_cod integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('cod_ibge', cod_ibge, 'nome', nome, 'uf', uf,
                            'indicadores', indicadores, 'indicadores_em', indicadores_em)
  from ibge_municipios where cod_ibge = p_cod
$$;

revoke execute on function fn_biomas_envelope(float8, float8, float8, float8) from public, anon, authenticated;
revoke execute on function fn_biomas_mapa(float8, float8, float8, float8) from public, anon, authenticated;
revoke execute on function fn_municipio_no_ponto(float8, float8) from public, anon, authenticated;
revoke execute on function fn_ibge_municipio(integer) from public, anon, authenticated;
grant execute on function fn_biomas_envelope(float8, float8, float8, float8) to service_role;
grant execute on function fn_biomas_mapa(float8, float8, float8, float8) to service_role;
grant execute on function fn_municipio_no_ponto(float8, float8) to service_role;
grant execute on function fn_ibge_municipio(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Fonte do relatório
-- ---------------------------------------------------------------------------

insert into fontes_externas (id, nome, orgao, tipo, endpoint, camada, prioridade, ativa, mecanismo, classificacao, observacao, ficha)
values ('ibge_biomas', 'Bioma (limite oficial)', 'IBGE', 'importada',
  'https://geoservicos.ibge.gov.br/geoserver/ows', 'CREN:lm_bioma_250', 2, true, 'importacao', 'oficial',
  'Limite oficial dos biomas do IBGE (1:250.000), copiado para o banco por scripts/ibge-importa.mjs. '
    || 'Mostra a porcentagem de cada bioma na área consultada. O MapBiomas é complemento (uso do solo), não substitui este limite.',
  jsonb_build_object(
    'endereco_oficial', 'https://www.ibge.gov.br/geociencias/informacoes-ambientais/vegetacao/15842-biomas.html',
    'documentacao', 'https://geoservicos.ibge.gov.br/geoserver/ows?service=WFS&request=GetCapabilities',
    'acesso', 'WFS do GeoServer do IBGE, camada CREN:lm_bioma_250 (6 biomas, 33 MB), importada para o banco',
    'autenticacao', 'nenhuma', 'custo', 'gratuito',
    'limites', 'a consulta por envelope devolve o bioma inteiro; por isso a importação',
    'licenca', 'dados públicos do IBGE (citar a fonte)',
    'atualizacao', 'por edição do IBGE (rara)',
    'campos', 'bioma, cd_bioma, area_km', 'crs', 'EPSG:4674 (SIRGAS 2000)',
    'consulta_por_geometria', 'sim, no banco (envelope)',
    'cache', 'banco (ibge_biomas, ibge_biomas_partes)',
    'situacao_sondagem', '200 em 22/10/2026: 6 biomas; envelope de Iturama cai em Cerrado e Mata Atlântica',
    'sondado_em', '2026-10-22'))
on conflict (id) do update set
  nome = excluded.nome, orgao = excluded.orgao, tipo = excluded.tipo, endpoint = excluded.endpoint,
  camada = excluded.camada, prioridade = excluded.prioridade, ativa = excluded.ativa,
  mecanismo = excluded.mecanismo, classificacao = excluded.classificacao,
  observacao = excluded.observacao, ficha = excluded.ficha;

update fontes_externas set
  observacao = 'Localidades, malha dos municípios e indicadores (Censo 2022, população estimada, PIB dos Municípios), '
    || 'copiados para o banco (ibge_municipios) por scripts/ibge-importa.mjs.',
  ficha = coalesce(ficha, '{}'::jsonb) || jsonb_build_object(
    'acesso', 'API de localidades e malhas (servicodados.ibge.gov.br) e SIDRA (apisidra.ibge.gov.br): tabelas 4714, 6579 e 5938',
    'atualizacao', 'anual (estimativa de população e PIB); Censo a cada 10 anos',
    'cache', 'banco (ibge_municipios)',
    'sondado_em', '2026-10-22')
where id = 'ibge';
