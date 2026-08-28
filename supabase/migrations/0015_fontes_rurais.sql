-- Arini Imóveis Brasil — migration 0015: catálogo completo das fontes do
-- documento técnico de Consulta Rural.
--
-- Sondagem feita em 28/08/2026 (scripts/sonda-fontes*.mjs). Cada fonte entra
-- com o mecanismo REAL que o órgão oferece. O documento é explícito: "não
-- assumir que a existência de um portal implica existência de API pública" —
-- então o que não tem consulta por polígono entra desativado, com o motivo.

-- 'tipo' ganha os mecanismos que apareceram na sondagem
alter table fontes_externas add column if not exists mecanismo text;
comment on column fontes_externas.mecanismo is
  'Como o órgão publica: wfs, arcgis, overpass, download, sem_api. Verificado por sondagem.';

-- ---------------------------------------------------------------------------
-- Fontes novas que responderam com dado real na sondagem
-- ---------------------------------------------------------------------------
insert into fontes_externas (id, nome, orgao, tipo, endpoint, camada, prioridade, ativa, mecanismo, observacao) values
  ('inpe_queimadas', 'Focos de calor', 'INPE / Programa Queimadas', 'wfs',
   'https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows', 'bdqueimadas2:focos', 5, true, 'wfs',
   'Histórico completo de focos por bbox. O relatório destaca os últimos 12 meses e agrega por ano.'),

  ('deter_cerrado', 'Alertas de desmatamento (DETER)', 'INPE / TerraBrasilis', 'wfs',
   'https://terrabrasilis.dpi.inpe.br/geoserver/ows', 'deter-cerrado-nb:deter_cerrado', 6, true, 'wfs',
   'Alertas recentes de alteração da cobertura vegetal no Cerrado. Complementa o PRODES, que é anual e consolidado.'),

  ('ucs', 'Unidades de conservação', 'CNUC / MMA (compilado pelo INPE)', 'wfs',
   'https://terrabrasilis.dpi.inpe.br/geoserver/ows', 'prodes-cerrado-nb:conservation_units_cerrado_biome', 11, true, 'wfs',
   'Os geoserviços do ICMBio e do MMA não resolveram DNS na sondagem de 28/08/2026. Usamos a compilação do INPE para o bioma Cerrado — a proveniência exibida é essa, não o CNUC direto.'),

  ('hidrografia', 'Corpos d''água e represas', 'INPE / TerraBrasilis', 'wfs',
   'https://terrabrasilis.dpi.inpe.br/geoserver/ows', 'prodes-cerrado-nb:hydrography', 12, true, 'wfs',
   'Corpos d''água mapeados sobre Sentinel-2 no bioma Cerrado.'),

  ('ana', 'Cursos d''água', 'ANA / SNIRH', 'arcgis',
   'https://www.snirh.gov.br/arcgis/rest/services/DADOSABERTOS/Curso_dÁgua/MapServer', '0', 13, true, 'arcgis',
   'Base hidrográfica oficial da ANA, consultada por envelope.'),

  ('aneel', 'Empreendimentos de energia', 'ANEEL / SIGEL', 'arcgis',
   'https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Camadas/MapServer', '0,1,2,3,5,7,8', 14, true, 'arcgis',
   'Usinas (UHE, PCH, CGH, UTE, EOL, UFV) e reservatórios. O SIGEL NÃO expõe serviço público de linhas de transmissão nem de subestações — essa parte do documento segue descoberta.')
on conflict (id) do update set
  nome = excluded.nome, orgao = excluded.orgao, tipo = excluded.tipo,
  endpoint = excluded.endpoint, camada = excluded.camada,
  prioridade = excluded.prioridade, ativa = excluded.ativa,
  mecanismo = excluded.mecanismo, observacao = excluded.observacao;

-- ---------------------------------------------------------------------------
-- Mecanismo das fontes que já estavam ativas
-- ---------------------------------------------------------------------------
update fontes_externas set mecanismo = 'arcgis'   where id = 'anm';
update fontes_externas set mecanismo = 'wfs'      where id in ('funai', 'prodes_cerrado');
update fontes_externas set mecanismo = 'overpass' where id = 'pois_osm';
update fontes_externas set mecanismo = 'api'      where id = 'ibge';

-- ---------------------------------------------------------------------------
-- Fontes do documento SEM consulta pública por polígono.
--
-- Ficam catalogadas e desativadas com o motivo medido. Aparecem no relatório
-- como "dependem de importação": num relatório de terra, silêncio lido como
-- ausência de restrição é o erro caro.
-- ---------------------------------------------------------------------------
insert into fontes_externas (id, nome, orgao, tipo, endpoint, camada, prioridade, ativa, mecanismo, observacao) values
  ('sncr', 'Cadastro rural (SNCR)', 'INCRA / SNCR', 'importada', null, null, 3, false, 'sem_api',
   'Base cadastral, não geoespacial. Consulta por CCIR exige acesso autorizado.'),
  ('quilombolas', 'Territórios quilombolas', 'INCRA', 'importada', null, null, 15, false, 'download',
   'O acervo fundiário do INCRA não respondeu na sondagem (timeout). Baixar a malha e importar.'),
  ('iphan', 'Patrimônio e sítios arqueológicos', 'IPHAN', 'importada', null, null, 16, false, 'sem_api',
   'O geoserver do IPHAN devolve a página do portal, não capabilities WFS. Dados saem pelo SICG mediante download.'),
  ('mapbiomas', 'Uso e cobertura do solo', 'MapBiomas', 'importada', null, null, 6, false, 'download',
   'A API de estatísticas exige token e aceite de termos; a coleção também sai como raster anual. Definir com o Carlos se entra por token ou por importação do raster da região.'),
  ('dnit', 'Rodovias federais', 'DNIT', 'importada', null, null, 17, false, 'sem_api',
   'Nenhum endpoint ArcGIS/WFS público respondeu. Hoje as rodovias vêm do OpenStreetMap, que cobre a região.'),
  ('sentinel', 'Imagem multiespectral', 'Copernicus / Sentinel-2', 'importada', null, null, 18, false, 'sem_api',
   'Exige conta no Copernicus Data Space. Serve para análise derivada (NDVI), não para incidência.')
on conflict (id) do update set
  nome = excluded.nome, orgao = excluded.orgao, prioridade = excluded.prioridade,
  ativa = excluded.ativa, mecanismo = excluded.mecanismo, observacao = excluded.observacao;

-- motivos remedidos na sondagem de 28/08/2026
update fontes_externas set mecanismo = 'sem_api', observacao =
  'O WFS de geoserver.car.gov.br responde mas publica ZERO camadas (medido em 28/08/2026). O SICAR distribui shapefile por município com CAPTCHA. Precisa importar o arquivo.'
  where id = 'car';
update fontes_externas set mecanismo = 'download', observacao =
  'Sem endpoint público estável: acervofundiario.incra.gov.br deu timeout e certificacao.incra.gov.br exige login. Baixar a malha certificada e importar.'
  where id = 'sigef';
update fontes_externas set mecanismo = 'download', observacao =
  'Nenhum host do IBAMA respondeu na sondagem de 28/08/2026 (404/403/DNS). Usar a planilha/shapefile de embargos dos dados abertos.'
  where id = 'ibama_embargos';

notify pgrst, 'reload schema';
