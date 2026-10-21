-- Arini Imóveis Brasil — migration 0049: o INPE mudou o serviço de focos de
-- calor (21/10/2026). O GeoServer antigo (terrabrasilis.dpi.inpe.br/queimadas)
-- passou a responder 404; a mesma camada, com os mesmos campos, está em
-- data.inpe.br com o espaço de nomes "bdqueimadas" (antes "bdqueimadas2").
-- A camada não aparece no GetCapabilities, mas responde a GetFeature.

update fontes_externas
   set endpoint = 'https://data.inpe.br/queimadas/geoserver/ows',
       camada = 'bdqueimadas:focos',
       sonda_url = 'https://data.inpe.br/queimadas/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=bdqueimadas:focos&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326',
       ficha = ficha || jsonb_build_object(
         'endereco_oficial', 'https://terrabrasilis.dpi.inpe.br/queimadas/portal/',
         'acesso', 'WFS (GeoServer) bdqueimadas:focos em data.inpe.br (fora do GetCapabilities)',
         'limites', 'o endereço antigo (terrabrasilis…/queimadas/geoserver) saiu do ar em out/2026',
         'situacao_sondagem', '200 em 21/10/2026: 2.586 focos no histórico de um quadrado de ~30 km em Iturama',
         'sondado_em', '2026-10-21')
 where id = 'inpe_queimadas';
