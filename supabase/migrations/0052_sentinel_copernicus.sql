-- Arini Imóveis Brasil — migration 0052: vegetação (NDVI) do Sentinel-2 pelo Copernicus Data Space.
--
-- Item 5 do levantamento do Carlos (22/10/2026) e roadmap 3.8. A fonte
-- `sentinel` deixa de ser "sem API": o catálogo do Copernicus é aberto e a
-- imagem/estatística vem do Sentinel Hub do CDSE com a conta da Arini
-- (COPERNICUS_CLIENT_ID/SECRET). Sem a conta, o relatório não mostra a fonte
-- (src/lib/geo/consultaArea.ts) em vez de mostrar "indisponível".

update fontes_externas set
  nome = 'Vegetação (NDVI do Sentinel-2)',
  orgao = 'Copernicus (ESA/União Europeia)',
  tipo = 'api',
  endpoint = 'https://sh.dataspace.copernicus.eu/api/v1/statistics',
  camada = 'sentinel-2-l2a',
  ativa = true,
  mecanismo = 'api',
  classificacao = 'derivado',
  observacao = 'NDVI calculado pela Arini sobre a passagem do Sentinel-2 L2A com menos nuvem nos últimos 120 dias, '
    || 'sem os pixels de nuvem e sombra (SCL), e a mesma época do ano anterior para comparar.',
  ficha = jsonb_build_object(
    'endereco_oficial', 'https://dataspace.copernicus.eu',
    'documentacao', 'https://documentation.dataspace.copernicus.eu/APIs/SentinelHub.html',
    'acesso', 'catálogo STAC aberto (stac.dataspace.copernicus.eu) para achar a cena; Sentinel Hub (Process e Statistical API) para imagem e NDVI',
    'autenticacao', 'conta gratuita no CDSE + cliente OAuth (client_credentials) para o Sentinel Hub; o catálogo não pede conta',
    'custo', 'gratuito na cota: 10.000 unidades de processamento por mês e 300 pedidos por minuto',
    'limites', 'cota mensal da conta; a nuvem do catálogo é da quadrícula inteira (~110 km)',
    'licenca', 'dados Copernicus Sentinel: livres, inclusive para uso comercial, com atribuição',
    'atualizacao', 'nova passagem a cada ~5 dias (Sentinel-2A, 2B e 2C)',
    'campos', 'NDVI médio e faixas (água, solo exposto, vegetação baixa, moderada, densa); % sem leitura por nuvem',
    'crs', 'EPSG:4326 (consulta) e EPSG:3857 (tiles do mapa)',
    'consulta_por_geometria', 'sim (envelope)',
    'cache', 'resultado guardado por consulta; tiles do mapa em memória e no navegador por 7 dias',
    'situacao_sondagem', '22/10/2026: catálogo aberto respondeu (28 cenas em Iturama de jul a out/2026); Sentinel Hub responde 401 sem conta',
    'sondado_em', '2026-10-22')
where id = 'sentinel';
