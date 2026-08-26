-- Arini Imóveis Brasil — migration 0013: módulo de Consulta Rural
--
-- Cruza a geometria do imóvel com fontes oficiais (mineração, terras
-- indígenas, desmatamento, hidrografia, POIs) guardando SEMPRE a origem e a
-- data da consulta. Regra do documento técnico: dado oficial, dado derivado e
-- estimativa geoespacial não se misturam.

create table fontes_externas (
  id text primary key,                    -- 'anm', 'funai', 'prodes'…
  nome text not null,
  orgao text not null,
  tipo text not null,                     -- arcgis | wfs | overpass | ibge | importada
  endpoint text,
  camada text,
  prioridade int not null default 99,
  ativa boolean not null default true,
  observacao text,                        -- limitação conhecida (ex.: exige download)
  ultima_consulta timestamptz,
  created_at timestamptz not null default now()
);

insert into fontes_externas (id, nome, orgao, tipo, endpoint, camada, prioridade, ativa, observacao) values
  ('anm', 'Processos minerários', 'ANM / SIGMINE', 'arcgis',
   'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0', 'Processos minerários ativos', 7, true,
   'Consulta ao vivo por envelope. O serviço não aceita paginação.'),
  ('funai', 'Terras indígenas', 'FUNAI', 'wfs',
   'https://geoserver.funai.gov.br/geoserver/Funai/ows', 'Funai:tis_poligonais', 8, true,
   'Consulta ao vivo por bbox.'),
  ('prodes_cerrado', 'Desmatamento (PRODES)', 'INPE / TerraBrasilis', 'wfs',
   'http://terrabrasilis.dpi.inpe.br/geoserver/ows', 'prodes-cerrado-nb:yearly_deforestation', 6, true,
   'Bioma Cerrado — que cobre o Pontal do Triângulo.'),
  ('pois_osm', 'Pontos de interesse e acessos', 'OpenStreetMap', 'overpass',
   'https://overpass-api.de/api/interpreter', null, 10, true,
   'Já alimenta a página do imóvel; cache local em pois.'),
  ('ibge', 'Município e limites', 'IBGE', 'ibge',
   'https://servicodados.ibge.gov.br/api/v1/localidades', null, 9, true,
   'Malhas municipais importadas para o banco.'),
  ('car', 'CAR — Cadastro Ambiental Rural', 'SICAR', 'importada', null, null, 1, false,
   'Sem API pública: o SICAR distribui shapefile por município com CAPTCHA. Precisa importar o arquivo.'),
  ('sigef', 'Parcelas certificadas', 'INCRA / SIGEF', 'importada', null, null, 2, false,
   'Sem endpoint público estável: baixar malha certificada do INCRA e importar.'),
  ('ibama_embargos', 'Embargos ambientais', 'IBAMA', 'importada', null, null, 4, false,
   'Serviço público fora do ar na sondagem de 26/08/2026; usar planilha/shapefile de dados abertos.');

-- resultado por imóvel e fonte, com proveniência
create table consultas_rurais (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  fonte_id text not null references fontes_externas(id),
  raio_m int not null default 0,          -- 0 = interseção com o próprio imóvel
  resultado jsonb not null default '{}',  -- lista normalizada pelo adaptador
  quantidade int not null default 0,
  incide boolean not null default false,  -- toca o imóvel?
  erro text,
  consultado_em timestamptz not null default now(),
  unique (property_id, fonte_id, raio_m)
);
create index idx_consultas_property on consultas_rurais (property_id);

alter table fontes_externas enable row level security;
alter table consultas_rurais enable row level security;

-- leitura pública do que já foi consultado (a página do imóvel mostra);
-- escrita só por service role (as rotas de API).
create policy p_fontes_read on fontes_externas for select using (true);
create policy p_consultas_read on consultas_rurais for select using (true);

-- bbox do imóvel (as APIs externas consultam por envelope)
create or replace function fn_property_bbox(p_property_id uuid, p_buffer_m numeric default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'xmin', st_xmin(e), 'ymin', st_ymin(e), 'xmax', st_xmax(e), 'ymax', st_ymax(e),
    'lng', st_x(st_centroid(e)), 'lat', st_y(st_centroid(e))
  )
  from (
    select st_envelope(
      case when p_buffer_m > 0
        then st_buffer(g.geom::geography, p_buffer_m)::geometry
        else g.geom
      end
    ) as e
    from property_geometries g where g.property_id = p_property_id
  ) t
$$;

-- resumo territorial pronto para a tela
create or replace function fn_consulta_rural(p_property_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'imovel', (
      select jsonb_build_object(
        'codigo', p.codigo, 'titulo', p.titulo, 'tipo', p.tipo,
        'area_ha', round((g.area_m2 / 10000)::numeric, 2),
        'perimetro_km', round((g.perimeter_m / 1000)::numeric, 2),
        'municipio', (select m.nome from municipalities m where m.id = p.municipality_id)
      )
      from properties p join property_geometries g on g.property_id = p.id
      where p.id = p_property_id
    ),
    'fontes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'orgao', f.orgao, 'prioridade', f.prioridade,
        'ativa', f.ativa, 'observacao', f.observacao,
        'consulta', (
          select jsonb_build_object(
            'quantidade', c.quantidade, 'incide', c.incide, 'raio_m', c.raio_m,
            'resultado', c.resultado, 'erro', c.erro, 'consultado_em', c.consultado_em
          )
          from consultas_rurais c
          where c.property_id = p_property_id and c.fonte_id = f.id
          order by c.consultado_em desc limit 1
        )
      ) order by f.prioridade)
      from fontes_externas f
    ), '[]'::jsonb)
  )
$$;
