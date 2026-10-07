-- Arini Maps — migration 0033: fontes oficiais (PENDENCIAS 3.4, 3.5, 3.9, 3.10, 3.14, 3.15, 3.16).
--
-- Sondagem de 07/10/2026 (scripts/sonda-fontes4.mjs), região de Iturama
-- (-50.6,-20.0,-49.8,-19.4):
--   · SIGEF e SNCI: o i3geo do INCRA voltou a responder POR TEMA
--     (ogc.php?tema=certificada_sigef_particular_mg) — 135 parcelas num quadrado
--     de 10 km. A lista geral de temas (ogc.php?lista=temas) dá 504 em 120 s.
--   · Embargos IBAMA: o geoserver antigo do SISCOM sumiu (404), mas o ArcGIS
--     do IBAMA (pamgia.ibama.gov.br) publica SISCOM/publico, camada 3 — 21
--     embargos na região, atualizado até 06/10/2026.
--   · Quilombolas: tema do INCRA não localizável sem a lista; o ArcGIS do IBAMA
--     republica a base do INCRA (BasesSincronizadas/lim_quilombos_incra_a, 440
--     territórios no país, 0 na região).
--   · IPHAN: geoserver.iphan.gov.br publica o SICG em WFS (19 bens na região).
--   · DNIT: servicos.dnit.gov.br/dnitgeo/geoserver publica o SNV (federais) e a
--     base CIDE de rodovias estaduais (35 trechos na região, inclusive MG-255).
--   · ANEEL: PORTAL/Transmissão publica linhas e subestações (base ONS) — 7 LT.
--   · ANM: SIGMINE respondeu (127 processos) — o erro de agosto passou.
--   · CAR ambiental (APP/RL): o WFS do SICAR só publica sicar_imoveis_<uf>; a
--     base de downloads tem reCAPTCHA e redireciona em laço https→http→https.

-- ---------------------------------------------------------------------------
-- Colunas novas do catálogo
-- ---------------------------------------------------------------------------
alter table fontes_externas add column if not exists classificacao text not null default 'oficial';
alter table fontes_externas add column if not exists situacao text not null default 'sem_verificacao';
alter table fontes_externas add column if not exists situacao_desde timestamptz;
alter table fontes_externas add column if not exists ultima_verificacao timestamptz;
alter table fontes_externas add column if not exists sonda_url text;
alter table fontes_externas add column if not exists ficha jsonb not null default '{}'::jsonb;

do $$ begin
  alter table fontes_externas add constraint ck_fontes_classificacao
    check (classificacao in ('oficial', 'terceiro', 'derivado'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table fontes_externas add constraint ck_fontes_situacao
    check (situacao in ('ok', 'instavel', 'sem_verificacao'));
exception when duplicate_object then null; end $$;

comment on column fontes_externas.classificacao is
  'oficial = órgão responsável (ou republicação de órgão público); terceiro = base não governamental (OSM, MapBiomas); derivado = cálculo do Arini sobre outra base.';
comment on column fontes_externas.situacao is
  'Saúde medida pela verificação periódica: ok, instavel (3 falhas seguidas) ou sem_verificacao.';
comment on column fontes_externas.sonda_url is
  'Requisição mínima (envelope de ~2 km em Iturama) usada no teste de queda e lentidão.';
comment on column fontes_externas.ficha is
  'Matriz técnica (PENDENCIAS 3.14): endereco_oficial, documentacao, acesso, autenticacao, custo, limites, licenca, atualizacao, campos, crs, consulta_por_geometria, cache, situacao_sondagem, sondado_em.';

-- ---------------------------------------------------------------------------
-- Histórico de disponibilidade e latência (3.16)
-- ---------------------------------------------------------------------------
create table if not exists fontes_saude (
  id bigint generated always as identity primary key,
  fonte_id text not null references fontes_externas(id) on delete cascade,
  ok boolean not null,
  status_http int,
  ms int,
  erro text,
  origem text not null default 'manual',      -- manual | worker | script
  verificado_em timestamptz not null default now()
);
create index if not exists idx_fontes_saude_fonte on fontes_saude (fonte_id, verificado_em desc);
alter table fontes_saude enable row level security;
-- sem policy: só o servidor (service role) lê e escreve

/**
 * Registra uma verificação e recalcula a situação da fonte.
 * Três falhas seguidas → 'instavel'; uma resposta boa → 'ok'.
 */
create or replace function fn_fonte_saude_registrar(
  p_fonte text, p_ok boolean, p_status int, p_ms int, p_erro text, p_origem text default 'manual'
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_falhas int;
  v_nova text;
  v_atual text;
begin
  insert into fontes_saude (fonte_id, ok, status_http, ms, erro, origem)
  values (p_fonte, p_ok, p_status, p_ms, left(p_erro, 500), coalesce(p_origem, 'manual'));

  select count(*) into v_falhas from (
    select ok from fontes_saude where fonte_id = p_fonte order by verificado_em desc, id desc limit 3
  ) u where not u.ok;

  select situacao into v_atual from fontes_externas where id = p_fonte;
  -- uma ou duas falhas isoladas mantêm a situação anterior: lentidão pontual
  -- de um servidor público não pode virar alarme no relatório
  v_nova := case when p_ok then 'ok' when v_falhas >= 3 then 'instavel' else coalesce(v_atual, 'sem_verificacao') end;

  update fontes_externas set
    ultima_verificacao = now(),
    situacao = v_nova,
    situacao_desde = case when situacao is distinct from v_nova then now() else situacao_desde end
  where id = p_fonte;
  return v_nova;
end $$;
revoke execute on function fn_fonte_saude_registrar(text, boolean, int, int, text, text) from public, anon, authenticated;
grant execute on function fn_fonte_saude_registrar(text, boolean, int, int, text, text) to service_role;

/** Painel /admin/fontes: catálogo + disponibilidade e latência dos últimos 7 dias. */
create or replace function fn_fontes_painel()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'nome', f.nome, 'orgao', f.orgao, 'tipo', f.tipo, 'mecanismo', f.mecanismo,
    'endpoint', f.endpoint, 'camada', f.camada, 'prioridade', f.prioridade, 'ativa', f.ativa,
    'observacao', f.observacao, 'classificacao', f.classificacao, 'situacao', f.situacao,
    'situacao_desde', f.situacao_desde, 'ultima_verificacao', f.ultima_verificacao,
    'ultima_consulta', f.ultima_consulta, 'sonda_url', f.sonda_url, 'ficha', f.ficha,
    'verificacoes_7d', s.n, 'disponibilidade_7d', s.disp, 'latencia_media_7d', s.media,
    'ultimo_erro', s.ultimo_erro, 'ultimo_ok', s.ultimo_ok
  ) order by f.ativa desc, f.prioridade, f.id), '[]'::jsonb)
  from fontes_externas f
  left join lateral (
    select count(*) as n,
           round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 1) as disp,
           round(avg(ms) filter (where ok))::int as media,
           (select erro from fontes_saude x where x.fonte_id = f.id and not x.ok order by verificado_em desc limit 1) as ultimo_erro,
           (select ok from fontes_saude x where x.fonte_id = f.id order by verificado_em desc limit 1) as ultimo_ok
    from fontes_saude h
    where h.fonte_id = f.id and h.verificado_em > now() - interval '7 days'
  ) s on true
$$;
revoke execute on function fn_fontes_painel() from public, anon, authenticated;
grant execute on function fn_fontes_painel() to service_role;

-- ---------------------------------------------------------------------------
-- Fontes novas e reativadas (3.4, 3.9, 3.10)
-- ---------------------------------------------------------------------------
insert into fontes_externas (id, nome, orgao, tipo, endpoint, camada, prioridade, ativa, mecanismo, classificacao, observacao) values
  ('sigef', 'Parcelas certificadas (SIGEF)', 'INCRA / SIGEF', 'wfs',
   'https://acervofundiario.incra.gov.br/i3geo/ogc.php', 'certificada_sigef_particular_<uf>, certificada_sigef_publico_<uf>', 2, true, 'wfs', 'oficial',
   'Consulta ao vivo no i3geo do INCRA, um tema por UF (MG, SP, GO, MS). O serviço declara "vedado o uso comercial" — ver ficha.'),
  ('snci', 'Imóveis certificados (SNCI)', 'INCRA / SNCI', 'wfs',
   'https://acervofundiario.incra.gov.br/i3geo/ogc.php', 'imoveiscertificados_privado_<uf>, imoveiscertificados_publico_<uf>', 3, true, 'wfs', 'oficial',
   'Certificações anteriores ao SIGEF (Lei 10.267, até 2013). Mesmo serviço e mesma restrição do SIGEF.'),
  ('ibama_embargos', 'Áreas embargadas', 'IBAMA / SISCOM', 'arcgis',
   'https://pamgia.ibama.gov.br/server/rest/services/SISCOM/publico/MapServer', '3', 4, true, 'arcgis', 'oficial',
   'Polígonos de embargo do IBAMA (termo, data, infração, área). O CPF/CNPJ do autuado não é exibido no relatório.'),
  ('quilombolas', 'Territórios quilombolas', 'INCRA (republicado pelo IBAMA)', 'arcgis',
   'https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_quilombos_incra_a/MapServer', '0', 15, true, 'arcgis', 'oficial',
   'Base do INCRA sincronizada no ArcGIS do IBAMA (o tema do INCRA não é localizável: a lista de temas dá 504).'),
  ('iphan', 'Patrimônio e sítios arqueológicos', 'IPHAN / SICG', 'wfs',
   'https://geoserver.iphan.gov.br/geoserver/ows', 'SICG:tg_bem_classificacao, SICG:bem_poligono, SICG:Bem_Protecao', 16, true, 'wfs', 'oficial',
   'Bens cadastrados no SICG (pontos e polígonos) com o tipo de proteção (tombamento, registro de sítio).'),
  ('dnit', 'Rodovias federais e estaduais', 'DNIT (SNV e CIDE)', 'wfs',
   'https://servicos.dnit.gov.br/dnitgeo/geoserver/ows', 'vgeo:vw_snv_rod, vgeo:vw_cide_rod_2021', 17, true, 'wfs', 'oficial',
   'Federais pelo SNV vigente; estaduais pela base CIDE que o DNIT publica (inclui as rodovias do DER/MG).'),
  ('der_mg', 'Rodovias estaduais (DER/MG)', 'DER/MG', 'importada', null, null, 18, false, 'sem_api', 'oficial',
   'O DER/MG não publica serviço geográfico; a IDE-Sisema (idesisema.meioambiente.mg.gov.br) respondeu 503 em 07/10/2026. As estaduais entram pela base CIDE do DNIT.'),
  ('car_ambiental', 'Camadas ambientais do CAR (APP, reserva legal, vegetação nativa, área consolidada)', 'SICAR', 'importada', null, null, 1, false, 'download', 'oficial',
   'Sem consulta pública: o WFS do SICAR só publica o perímetro (sicar_imoveis_<uf>); APP/RL saem da base de downloads, que exige reCAPTCHA por município.')
on conflict (id) do update set
  nome = excluded.nome, orgao = excluded.orgao, tipo = excluded.tipo,
  endpoint = excluded.endpoint, camada = excluded.camada, prioridade = excluded.prioridade,
  ativa = excluded.ativa, mecanismo = excluded.mecanismo, classificacao = excluded.classificacao,
  observacao = excluded.observacao;

update fontes_externas set
  nome = 'Energia: usinas, linhas de transmissão e subestações',
  camada = 'Camadas 0,1,2,3,5,7,8 · Transmissão 1 (LT) e 3 (SE)',
  observacao = 'Usinas e reservatórios (PORTAL/Camadas) e, desde 07/10/2026, linhas de transmissão e subestações da base ONS (PORTAL/Transmissão).'
where id = 'aneel';
update fontes_externas set observacao = 'Consulta ao vivo por envelope. O serviço não aceita paginação. Respondeu normalmente em 07/10/2026.' where id = 'anm';

-- classificação das que não são do órgão responsável
update fontes_externas set classificacao = 'terceiro' where id in ('pois_osm', 'mapbiomas');
update fontes_externas set classificacao = 'derivado' where id = 'sentinel';

-- ---------------------------------------------------------------------------
-- Sonda mínima de cada fonte ativa (envelope ~2 km em Iturama)
-- ---------------------------------------------------------------------------
update fontes_externas f set sonda_url = v.url from (values
  ('car', 'https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=sicar:sicar_imoveis_mg&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('sigef', 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_mg&service=WFS&version=1.1.0&request=GetFeature&typeName=certificada_sigef_particular_mg&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72'),
  ('snci', 'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=imoveiscertificados_privado_mg&service=WFS&version=1.1.0&request=GetFeature&typeName=imoveiscertificados_privado_mg&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72'),
  ('ibama_embargos', 'https://pamgia.ibama.gov.br/server/rest/services/SISCOM/publico/MapServer/3/query?f=json&geometry=-50.21,-19.74,-50.19,-19.72&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true'),
  ('inpe_queimadas', 'https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=bdqueimadas2:focos&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('deter_cerrado', 'https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=deter-cerrado-nb:deter_cerrado&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('prodes_cerrado', 'https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=prodes-cerrado-nb:yearly_deforestation&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('anm', 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query?f=json&geometry=-50.21,-19.74,-50.19,-19.72&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true'),
  ('funai', 'https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=Funai:tis_poligonais&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('ibge', 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/3134400'),
  ('pois_osm', 'https://overpass-api.de/api/status'),
  ('ucs', 'https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=prodes-cerrado-nb:conservation_units_cerrado_biome&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('hidrografia', 'https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=prodes-cerrado-nb:hydrography&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('ana', 'https://www.snirh.gov.br/arcgis/rest/services/DADOSABERTOS/Curso_d%C3%81gua/MapServer/0/query?f=json&geometry=-50.21,-19.74,-50.19,-19.72&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true'),
  ('aneel', 'https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Transmiss%C3%A3o/MapServer/1/query?f=json&geometry=-50.21,-19.74,-50.19,-19.72&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true'),
  ('quilombolas', 'https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_quilombos_incra_a/MapServer/0/query?f=json&geometry=-50.21,-19.74,-50.19,-19.72&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true'),
  ('iphan', 'https://geoserver.iphan.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=SICG:tg_bem_classificacao&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326'),
  ('dnit', 'https://servicos.dnit.gov.br/dnitgeo/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=vgeo:vw_cide_rod_2021&resultType=hits&bbox=-50.21,-19.74,-50.19,-19.72,EPSG:4326')
) as v(id, url) where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Matriz técnica (3.14) — o mesmo conteúdo de docs/FONTES.md
-- ---------------------------------------------------------------------------
update fontes_externas f set ficha = v.ficha::jsonb from (values
  ('car', '{"endereco_oficial":"https://www.car.gov.br","documentacao":"https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&request=GetCapabilities","acesso":"WFS (GeoServer) por UF + cópia local da malha (car_imoveis)","autenticacao":"nenhuma","custo":"gratuito","limites":"sem limite publicado; respostas lentas acima de ~500 feições","licenca":"dado público (Lei 12.651/2012, art. 29); sem licença declarada no serviço","atualizacao":"contínua (declarações dos proprietários)","campos":"cod_imovel, municipio, area, condicao, status_imovel, tipo_imovel, m_fiscal, dat_atualizacao","crs":"EPSG:4674 (SIRGAS 2000), aceita bbox em 4326","consulta_por_geometria":"sim (bbox)","cache":"malha copiada para o banco e atualizada pela tela Regiões; consulta ao vivo no relatório","situacao_sondagem":"200 em 07/10/2026; publica só sicar_imoveis_<uf> (27 camadas)","sondado_em":"2026-10-07"}'),
  ('car_ambiental', '{"endereco_oficial":"https://consultapublica.car.gov.br/publico/estados/downloads","documentacao":"—","acesso":"download de shapefile por município (APP, RESERVA_LEGAL, VEGETACAO_NATIVA, AREA_CONSOLIDADA...)","autenticacao":"reCAPTCHA por download","custo":"gratuito","limites":"um município por vez, com CAPTCHA","licenca":"dado público","atualizacao":"contínua","campos":"cod_imovel, tema, area_ha","crs":"EPSG:4674","consulta_por_geometria":"não","cache":"exigiria importação manual por município","situacao_sondagem":"07/10/2026: WFS sem camadas temáticas (testados sicar:sicar_app_mg, sicar_reserva_legal_mg, sicar_vegetacao_nativa_mg, sicar_area_consolidada_mg → exceção); consultapublica.car.gov.br redireciona https→http (302) e http→https (301) em laço; car.gov.br carrega angular-recaptcha","sondado_em":"2026-10-07"}'),
  ('sigef', '{"endereco_oficial":"https://sigef.incra.gov.br","documentacao":"https://acervofundiario.incra.gov.br/i3geo/ogc.php?ajuda=","acesso":"WFS (MapServer/i3geo), um tema por UF: certificada_sigef_particular_<uf> e certificada_sigef_publico_<uf>","autenticacao":"nenhuma","custo":"gratuito","limites":"saída só em GML; a lista geral de temas dá 504","licenca":"o serviço declara AccessConstraints: \"vedado o uso comercial\" — validar com o jurídico antes de vender relatório com este dado","atualizacao":"diária (parcelas certificadas até a véspera)","campos":"parcela_codigo, nome_area, status, situacao_informada, codigo_imovel, data_aprovacao, registro_matricula, codigo_municipio","crs":"EPSG:4326","consulta_por_geometria":"sim (bbox; resultType=hits devolve o total)","cache":"resultado guardado por consulta","situacao_sondagem":"200 em 07/10/2026: 135 parcelas num quadrado de ~10 km em Iturama; registro mais recente 01/09/2026. O espelho do IBAMA está parado em abr/2022 (não usar)","sondado_em":"2026-10-07"}'),
  ('snci', '{"endereco_oficial":"https://acervofundiario.incra.gov.br","documentacao":"https://acervofundiario.incra.gov.br/i3geo/ogc.php?ajuda=","acesso":"WFS (i3geo), temas imoveiscertificados_privado_<uf> e imoveiscertificados_publico_<uf>","autenticacao":"nenhuma","custo":"gratuito","limites":"saída só em GML","licenca":"\"vedado o uso comercial\" declarado no serviço — validar com o jurídico","atualizacao":"base histórica (certificações até 2013)","campos":"num_certificacao, data_certificacao, nome_imovel, cod_imovel_rural, qtd_area_peca_tecnica, num_processo","crs":"EPSG:4326","consulta_por_geometria":"sim (bbox)","cache":"resultado guardado por consulta","situacao_sondagem":"200 em 07/10/2026: 5 imóveis no quadrado de teste","sondado_em":"2026-10-07"}'),
  ('sncr', '{"endereco_oficial":"https://sncr.serpro.gov.br","acesso":"consulta por CCIR, sem geometria","autenticacao":"acesso autorizado pelo INCRA","custo":"—","licenca":"restrito","situacao_sondagem":"sem API pública (3.7)","sondado_em":"2026-08-28"}'),
  ('ibama_embargos', '{"endereco_oficial":"https://servicos.ibama.gov.br/ctf/publico/areasembargadas/ConsultaPublicaAreasEmbargadas.php","documentacao":"https://pamgia.ibama.gov.br/server/rest/services/SISCOM/publico/MapServer","acesso":"ArcGIS REST (MapServer), camada 3 ibama_embargos_a","autenticacao":"nenhuma","custo":"gratuito","limites":"maxRecordCount 2000; paginação suportada","licenca":"dado público (lista de áreas embargadas, Decreto 6.514/2008 art. 18)","atualizacao":"diária (dat_ult_alteracao mais recente: 06/10/2026)","campos":"num_tad, serie_tad, dat_embargo, municipio, uf, nome_imovel, des_infracao, des_tad, qtd_area_embargada, num_processo, unid_controle, dat_ult_alteracao","crs":"EPSG:4674","consulta_por_geometria":"sim (envelope/polígono)","cache":"resultado guardado por consulta","situacao_sondagem":"200 em 07/10/2026: 21 embargos na região de Iturama. siscom.ibama.gov.br/geoserver → 404","sondado_em":"2026-10-07"}'),
  ('inpe_queimadas', '{"endereco_oficial":"https://terrabrasilis.dpi.inpe.br/queimadas/portal/","acesso":"WFS (GeoServer) bdqueimadas2:focos","autenticacao":"nenhuma","custo":"gratuito","limites":"cluster: parte dos nós devolve 404 (tratado com nova tentativa)","licenca":"dados abertos INPE (CC-BY)","atualizacao":"várias vezes ao dia","campos":"data_hora_gmt, satelite, municipio, bioma","crs":"EPSG:4326","consulta_por_geometria":"sim (bbox, hits)","cache":"7 dias na consulta de área","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('deter_cerrado', '{"endereco_oficial":"https://terrabrasilis.dpi.inpe.br","acesso":"WFS deter-cerrado-nb:deter_cerrado","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados abertos INPE (CC-BY-SA)","atualizacao":"diária","campos":"classname, view_date, areatotalkm, satellite, sensor","crs":"EPSG:4674","consulta_por_geometria":"sim (bbox)","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('prodes_cerrado', '{"endereco_oficial":"https://terrabrasilis.dpi.inpe.br","acesso":"WFS prodes-cerrado-nb:yearly_deforestation","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados abertos INPE (CC-BY-SA)","atualizacao":"anual","campos":"year, area_km","crs":"EPSG:4674","consulta_por_geometria":"sim (bbox)","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('mapbiomas', '{"endereco_oficial":"https://brasil.mapbiomas.org","acesso":"API com token ou raster anual","autenticacao":"token + aceite de termos","custo":"gratuito com termos","licenca":"CC-BY-SA; uso comercial conforme termos","atualizacao":"anual (coleções)","situacao_sondagem":"bloqueado em 8.7","sondado_em":"2026-08-28"}'),
  ('anm', '{"endereco_oficial":"https://www.gov.br/anm","documentacao":"https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer","acesso":"ArcGIS REST camada 0 (processos ativos) + shapefile em app.anm.gov.br/dadosabertos","autenticacao":"nenhuma","custo":"gratuito","limites":"maxRecordCount 2000; NÃO aceita paginação","licenca":"dados abertos ANM","atualizacao":"diária (declarado nos metadados)","campos":"PROCESSO, FASE, NOME, SUBS, USO, AREA_HA, ULT_EVENTO","crs":"EPSG:4674","consulta_por_geometria":"sim","situacao_sondagem":"200 em 07/10/2026: 127 processos na região (o erro 500 de agosto passou)","sondado_em":"2026-10-07"}'),
  ('funai', '{"endereco_oficial":"https://www.gov.br/funai","acesso":"WFS Funai:tis_poligonais","autenticacao":"nenhuma","custo":"gratuito (Fees NONE)","licenca":"AccessConstraints NONE","atualizacao":"conforme atos de demarcação","campos":"terrai_nom, fase_ti, etnia_nome, uf_sigla","crs":"EPSG:4674","consulta_por_geometria":"sim (bbox)","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('ibge', '{"endereco_oficial":"https://servicodados.ibge.gov.br","acesso":"API REST de localidades + malhas importadas","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados públicos IBGE","atualizacao":"anual (malhas)","crs":"EPSG:4674","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('pois_osm', '{"endereco_oficial":"https://www.openstreetmap.org","acesso":"Overpass API","autenticacao":"nenhuma (User-Agent obrigatório)","custo":"gratuito","limites":"política de uso justo do overpass-api.de (2 consultas simultâneas)","licenca":"ODbL — atribuição obrigatória","atualizacao":"contínua (colaborativa)","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('ucs', '{"endereco_oficial":"https://cnuc.mma.gov.br","acesso":"WFS do INPE (compilação do CNUC para o Cerrado)","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados abertos INPE","atualizacao":"irregular (compilação)","situacao_sondagem":"200; ICMBio/MMA sem DNS em 28/08","sondado_em":"2026-10-07"}'),
  ('hidrografia', '{"endereco_oficial":"https://terrabrasilis.dpi.inpe.br","acesso":"WFS prodes-cerrado-nb:hydrography","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados abertos INPE","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('ana', '{"endereco_oficial":"https://www.snirh.gov.br","acesso":"ArcGIS REST DADOSABERTOS/Curso_dÁgua","autenticacao":"nenhuma","custo":"gratuito","licenca":"dados abertos ANA","campos":"BHB_NM_NORIOCOMP, BHB_CD_NORIO","crs":"EPSG:4674","consulta_por_geometria":"sim","situacao_sondagem":"200","sondado_em":"2026-10-07"}'),
  ('aneel', '{"endereco_oficial":"https://sigel.aneel.gov.br","documentacao":"https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL","acesso":"ArcGIS REST: PORTAL/Camadas (usinas, reservatórios) e PORTAL/Transmissão (camada 1 LT, 3 SE — base ONS)","autenticacao":"nenhuma (pastas STD e SRD exigem token)","custo":"gratuito","limites":"Camadas responde em até ~10 s","licenca":"dados abertos ANEEL","atualizacao":"mensal (usinas); base ONS sem data no serviço","campos":"NOME, PROPRIETAR, POT_KW, FASE; LT/SE: Name (código ONS)","crs":"EPSG:4674","consulta_por_geometria":"sim","situacao_sondagem":"200 em 07/10/2026: 1 UHE (Água Vermelha) e 7 linhas de transmissão na região; subestações 0","sondado_em":"2026-10-07"}'),
  ('quilombolas', '{"endereco_oficial":"https://www.gov.br/incra/pt-br/assuntos/governanca-fundiaria/quilombolas","documentacao":"https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_quilombos_incra_a/MapServer","acesso":"ArcGIS REST (republicação do IBAMA da base do INCRA)","autenticacao":"nenhuma","custo":"gratuito","licenca":"dado público; créditos à Coordenação-Geral de Regularização de Territórios Quilombolas/INCRA","atualizacao":"conforme publicação de RTID/portaria (dt_publica mais recente no espelho: 2015 — base a conferir)","campos":"nm_comunid, nm_municip, fase, nr_familia, dt_publica, dt_decreto, dt_titulac, esfera, responsave","crs":"EPSG:4674","consulta_por_geometria":"sim","situacao_sondagem":"200 em 07/10/2026: 440 territórios no país, 0 na região; também em servicos.dnit.gov.br (vgeo:vw_incra_quilombolas, 453)","sondado_em":"2026-10-07"}'),
  ('iphan', '{"endereco_oficial":"https://sicg.iphan.gov.br","documentacao":"https://geoserver.iphan.gov.br/geoserver/ows?service=WFS&request=GetCapabilities","acesso":"WFS (GeoServer) SICG:tg_bem_classificacao (pontos), SICG:bem_poligono, SICG:Bem_Protecao","autenticacao":"nenhuma","custo":"gratuito","licenca":"dado público; sem licença declarada","atualizacao":"contínua (cadastro no SICG)","campos":"identificacao_bem, co_iphan, ds_natureza, ds_tipo_bem, ds_classificacao, dt_cadastro, ds_tipo_protecao","crs":"EPSG:4674","consulta_por_geometria":"sim (bbox, hits)","situacao_sondagem":"200 em 07/10/2026: 19 bens na região (sítios arqueológicos em Ouroeste/Iturama)","sondado_em":"2026-10-07"}'),
  ('dnit', '{"endereco_oficial":"https://servicos.dnit.gov.br/vgeo/","documentacao":"https://servicos.dnit.gov.br/dnitgeo/geoserver/ows?service=WFS&request=GetCapabilities","acesso":"WFS vgeo:vw_snv_rod (federais, filtro de vigência dt_fim) e vgeo:vw_cide_rod_2021 (estaduais)","autenticacao":"nenhuma","custo":"gratuito (Fees NONE)","licenca":"AccessConstraints NONE","atualizacao":"SNV semestral (versão 202607A); CIDE 2021","campos":"Codigo_BR, Codigo_SNV, Superficie_Federal, Local_Inicio, Local_Fim, Extensao, Versao_SNV; CIDE: Codigo_Rodovia, Unidade_Federacao, Superficie_Estadual, Jurisdicao","crs":"EPSG:4674","consulta_por_geometria":"sim (bbox; CQL para a vigência)","situacao_sondagem":"200 em 07/10/2026: 12 trechos federais vigentes e 35 estaduais na região","sondado_em":"2026-10-07"}'),
  ('der_mg', '{"endereco_oficial":"http://www.der.mg.gov.br","acesso":"nenhum serviço geográfico publicado","autenticacao":"—","licenca":"—","situacao_sondagem":"07/10/2026: IDE-Sisema (idesisema.meioambiente.mg.gov.br/geoserver) 503; DER sem endpoint. Estaduais cobertas pela base CIDE do DNIT","sondado_em":"2026-10-07"}'),
  ('sentinel', '{"endereco_oficial":"https://dataspace.copernicus.eu","acesso":"API com conta","autenticacao":"conta Copernicus","custo":"gratuito com cota","licenca":"Copernicus (uso livre com atribuição)","situacao_sondagem":"pendente de conta (3.8)","sondado_em":"2026-08-28"}')
) as v(id, ficha) where f.id = v.id;

-- ---------------------------------------------------------------------------
-- Relatório do imóvel passa a levar classificação e saúde da fonte (3.15/3.16)
-- ---------------------------------------------------------------------------
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
        'classificacao', f.classificacao, 'situacao', f.situacao,
        'atualizacao', f.ficha->>'atualizacao',
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

notify pgrst, 'reload schema';
