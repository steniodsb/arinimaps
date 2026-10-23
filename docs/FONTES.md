# Arini Imóveis Brasil — matriz técnica das fontes oficiais

Entrega do item 6 do documento "Levantamento de APIs, serviços geoespaciais e
fontes de dados" e das pendências 3.4, 3.5, 3.9, 3.10, 3.14, 3.15 e 3.16.
Sondagem refeita em **07/10/2026** na região de Iturama (`-50.6,-20.0,-49.8,-19.4`).

- O mesmo conteúdo está no banco (`fontes_externas.ficha`) e aparece em
  **/admin/fontes** (setor Cartografia e dados), com a situação medida ao vivo.
- Reproduzir a sondagem: `node scripts/sonda-fontes4.mjs`.
- Rodar os adaptadores reais: `node scripts/testa-apis-rurais.mjs` (`DETALHE=1` mostra itens).
- Teste de queda e lentidão: `node scripts/verifica-fontes.mjs` (o worker roda a cada 6 h).

Regra que vale para todas: o documento do cliente pede "não assumir que a
existência de um portal implica existência de API pública". Fonte sem consulta
por área entra **inativa**, com o motivo medido, e aparece no relatório como
"depende de importação" — nunca como "nada encontrado".

---

## 1. Resumo

| Fonte | Órgão | Acesso | Autenticação | Custo | Situação 07/10 | Na região de Iturama |
|---|---|---|---|---|---|---|
| CAR — perímetro dos imóveis | SFB / SICAR | WFS por UF | não | grátis | **ativa** | 6.034 imóveis |
| CAR — APP, reserva legal, vegetação, consolidada | SFB / SICAR | download com reCAPTCHA + **importação manual** | reCAPTCHA | grátis | **ativa por importação** (22/10) | depende dos municípios importados |
| SIGEF (parcelas certificadas) | INCRA | WFS i3geo por UF | não | grátis | **ativa** (licença a validar) | 4.170 parcelas |
| SNCI (certificações até 2013) | INCRA | WFS i3geo por UF | não | grátis | **ativa** (licença a validar) | 279 imóveis |
| SNCR | INCRA | sem API | acesso autorizado | — | inativa (3.7) | — |
| Embargos | IBAMA | ArcGIS REST | não | grátis | **ativa** | 21 embargos |
| Territórios quilombolas | INCRA (via IBAMA) | ArcGIS REST | não | grátis | **ativa** | 0 |
| Patrimônio / sítios arqueológicos | IPHAN | WFS (SICG) | não | grátis | **ativa** | 19 bens |
| Processos minerários | ANM | ArcGIS REST | não | grátis | **ativa** | 127 processos |
| Terras indígenas | FUNAI | WFS | não | grátis | ativa | 0 |
| PRODES Cerrado | INPE | WFS | não | grátis | ativa | 1.234 polígonos |
| DETER Cerrado | INPE | WFS | não | grátis | ativa | 6 alertas |
| Focos de calor | INPE | WFS (`data.inpe.br`, desde 21/10) | não | grátis | ativa | 11.734 focos (374 em 12 meses) |
| Unidades de conservação | MMA/CNUC (via INPE) | WFS | não | grátis | ativa | 0 |
| Corpos d'água | INPE | WFS | não | grátis | ativa | 1.103 feições |
| Cursos d'água | ANA | ArcGIS REST | não | grátis | ativa | 30 trechos |
| Usinas, LT e subestações | ANEEL / ONS | ArcGIS REST | não | grátis | **ativa** (LT/SE novas) | 29 (1 UHE, 7 LT) |
| Rodovias federais e estaduais | DNIT (SNV + CIDE) | WFS | não | grátis | **ativa** | 15 rodovias |
| Rodovias estaduais (DER/MG) | DER/MG | sem serviço | — | — | inativa (coberto pelo DNIT/CIDE) | — |
| Pontos de interesse | OpenStreetMap | Overpass | não (User-Agent) | grátis | ativa (terceiro) | — |
| Municípios: malha, códigos e indicadores | IBGE | API REST + SIDRA, **copiados para o banco** (22/10) | não | grátis | ativa | Iturama: 38.295 hab. (Censo 2022) |
| Biomas (limite oficial 1:250.000) | IBGE | WFS, **copiado para o banco** (22/10) | não | grátis | **ativa** | 97,8% Cerrado, 2,2% Mata Atlântica |
| MapBiomas | MapBiomas | API com token | token + termos | grátis com termos | inativa (8.7) | — |
| Sentinel-2 (cenas e NDVI) | Copernicus Data Space | catálogo STAC aberto + Sentinel Hub com conta | conta + cliente OAuth (só para imagem e NDVI) | grátis: 10.000 PU/mês | **busca ativa; imagem e NDVI aguardam a conta** (22/10) | 28 passagens em Iturama de jul a out/2026 |

Números medidos com `scripts/testa-apis-rurais.mjs` no envelope acima.

---

## 2. Ficha de cada fonte

Campos pedidos no documento do cliente (§4): endereço oficial, tipo de acesso,
autenticação, limites, custo, licença, atualização, campos, sistema de
referência, consulta por geometria, cache e registro de origem.

### CAR / SICAR — perímetro (`car`)
- **Endereço:** https://www.car.gov.br · serviço `https://geoserver.car.gov.br/geoserver/sicar/ows`
- **Acesso:** WFS (GeoServer), camada `sicar:sicar_imoveis_<uf>`; a malha também é copiada para o banco (`car_imoveis`, tela Regiões).
- **Autenticação / custo:** nenhuma / gratuito.
- **Limites:** sem limite publicado; lento acima de ~500 feições — o total vem de `resultType=hits`.
- **Licença:** dado público (Lei 12.651/2012, art. 29); o serviço não declara licença.
- **Atualização:** contínua (declarações). **CRS:** EPSG:4674. **Por geometria:** sim (bbox).
- **Campos:** `cod_imovel, municipio, area, condicao, tipo_imovel, m_fiscal, dat_atualizacao`.
- **Situação:** 200; publica 27 camadas, todas `sicar_imoveis_<uf>`.

### CAR / SICAR — camadas ambientais (`car_ambiental`) — **ativa por importação manual** (3.5)
- **O que se queria:** APP, reserva legal, vegetação nativa e área consolidada declaradas, com área em ha por imóvel.
- **O que existe:** só a "Base de downloads" (`consultapublica.car.gov.br/publico/estados/downloads`), shapefile por município, com reCAPTCHA.
- **O que foi tentado em 07/10/2026:**
  - WFS: `sicar:sicar_app_mg`, `sicar:sicar_reserva_legal_mg`, `sicar:sicar_vegetacao_nativa_mg`, `sicar:sicar_area_consolidada_mg`, `sicar:app_mg`, `sicar:reserva_legal_mg` → `ExceptionReport` (camada inexistente);
  - workspaces `car`, `temas`, `sicar_temas`, `app`, `reserva_legal`, `publico` → 404; REST do GeoServer → 401;
  - base de downloads: `https://…/downloads` responde 302 para `http://…/imoveis/index`, que responde 301 de volta para `https://` — laço; a página de `car.gov.br` carrega `angular-recaptcha`;
  - ArcGIS do IBAMA (`CAR_NACIONAL`): só "Área do Imóvel".
- **Caminho adotado (22/10/2026):** importação manual por município em Central › CAR: importação e cobertura. O relatório lê o banco (`car_temas`) e mostra a data da base; município não importado aparece como "ainda não importado". Procedimento, validação e alternativas oficiais em `docs/CAR-IMPORTACAO.md`. Resolver CAPTCHA automaticamente está fora de questão.

### INCRA / SIGEF (`sigef`)
- **Endereço:** https://sigef.incra.gov.br · serviço `https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=certificada_sigef_particular_<uf>` (e `_publico_<uf>`)
- **Acesso:** WFS do MapServer/i3geo, **um tema por UF**; só GML. O `bbox` vai **sem** sufixo `EPSG:4326` — com ele o WFS 1.1.0 inverte os eixos e devolve 0 (medido: 135 × 0).
- **Autenticação / custo:** nenhuma / gratuito. **Limites:** a lista geral de temas (`?lista=temas`) não responde (504 em 120 s / timeout em 60 s).
- **Licença:** o serviço declara `AccessConstraints: vedado o uso comercial`. **Precisa de parecer do jurídico** antes de vender relatório com este bloco (o dado é público por lei, mas a restrição está escrita no serviço).
- **Atualização:** diária (parcela mais recente na região aprovada em 01/10/2026).
- **Campos:** `nome_area, status, codigo_imovel, data_aprovacao, registro_matricula, codigo_municipio, parcela_codigo`.
- **CRS:** EPSG:4326. **Por geometria:** sim (bbox, `resultType=hits` para o total).
- **Descartado:** espelho do IBAMA (`01_Publicacoes_Bases/lim_imovel_sigef_privado_a`) — responde, mas a aprovação mais recente é de 28/04/2022. `certificacao.incra.gov.br/geoserver` → 404; `sigef.incra.gov.br/consultar/parcelas` → "Request Rejected" (WAF).

### INCRA / SNCI (`snci`)
- Mesmo serviço e mesmas restrições do SIGEF; temas `imoveiscertificados_privado_<uf>` e `imoveiscertificados_publico_<uf>`.
- **Campos:** `nome_imovel, num_certificacao, data_certificacao, cod_imovel_rural, qtd_area_peca_tecnica, num_processo`. Base histórica (certificações até 2013).

### IBAMA — áreas embargadas (`ibama_embargos`)
- **Endereço:** consulta pública `servicos.ibama.gov.br/ctf/publico/areasembargadas/` · serviço `https://pamgia.ibama.gov.br/server/rest/services/SISCOM/publico/MapServer`, camada 3 (`ibama_embargos_a`).
- **Acesso:** ArcGIS REST. **Autenticação / custo:** nenhuma / gratuito. **Limites:** `maxRecordCount` 2000, paginação aceita.
- **Licença:** dado público (Decreto 6.514/2008, art. 18 — lista de áreas embargadas).
- **Atualização:** diária — `max(dat_ult_alteracao)` = 06/10/2026; o relatório mostra essa data como "base atualizada em".
- **Campos usados:** `num_tad, serie_tad, dat_embargo, municipio, uf, nome_imovel, des_localizacao, des_infracao, qtd_area_embargada, num_processo, unid_controle, sit_desmatamento`. O `cpf_cnpj_embargado` existe no serviço e **não** é exibido.
- **Achado:** há termo com o município digitado errado (polígono em Iturama com "Aracruz/ES"); o relatório avisa no item.
- **Descartado:** `siscom.ibama.gov.br/geoserver/publica/ows` → 404.

### Territórios quilombolas (`quilombolas`)
- **Endereço:** INCRA — Regularização de territórios quilombolas · serviço `https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_quilombos_incra_a/MapServer` (republicação do IBAMA).
- **Acesso:** ArcGIS REST. **Autenticação / custo:** nenhuma / gratuito.
- **Campos:** `nm_comunid, nm_municip, fase, nr_familia, dt_publica, dt_decreto, dt_titulac, esfera, st_titulad`.
- **Atualização:** a conferir — `dt_publica` mais recente no espelho é 2015; o campo `dt_sync` está corrompido (ano 2050). 440 territórios no país.
- **Por que o espelho:** os temas do INCRA no i3geo não são localizáveis sem a lista (testados `quilombolas_mg`, `areas_quilombolas_mg`, `quilombola_mg` e outros 10 nomes). O DNIT também republica (`vgeo:vw_incra_quilombolas`, 453, menos campos).

### IPHAN — patrimônio e sítios arqueológicos (`iphan`)
- **Endereço:** https://sicg.iphan.gov.br · serviço `https://geoserver.iphan.gov.br/geoserver/ows`
- **Acesso:** WFS (GeoServer): `SICG:tg_bem_classificacao` (pontos de todos os bens), `SICG:bem_poligono`, `SICG:Bem_Protecao` (tipo de proteção: tombamento, registro de sítio).
- **Autenticação / custo:** nenhuma / gratuito. **Licença:** não declarada; dado público.
- **Campos:** `identificacao_bem, co_iphan, ds_natureza, ds_tipo_bem, ds_classificacao, dt_cadastro, ds_tipo_protecao`.
- **Situação:** 200; 19 bens na região (sítios em Ouroeste/Iturama). `sicg.iphan.gov.br/geoserver` → 404 (o serviço certo é `geoserver.iphan.gov.br`).

### ANM / SIGMINE (`anm`)
- **Endereço:** https://www.gov.br/anm · `https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0` · shapefile em `app.anm.gov.br/dadosabertos/SIGMINE`.
- **Acesso:** ArcGIS REST; **não aceita paginação** (o adaptador não manda `resultRecordCount`). Total por `returnCountOnly`.
- **Atualização:** diária (declarada nos metadados do serviço). **CRS:** SIRGAS 2000.
- **Situação:** 200, 127 processos. O erro de servidor citado no PENDENCIAS 3.10 passou.

### ANEEL / SIGEL (`aneel`)
- **Endereço:** https://sigel.aneel.gov.br · `…/arcgis/rest/services/PORTAL/Camadas/MapServer` e `…/PORTAL/Transmissão/MapServer`.
- **Acesso:** ArcGIS REST. Camadas 0,1,2,3,5,7,8 (usinas e reservatórios); **Transmissão/1 = linhas, Transmissão/3 = subestações** (base ONS, campo `Name` com o código ONS).
- **Autenticação:** nenhuma nas pastas usadas (STD e SRD pedem token).
- **Limites:** `Camadas` às vezes leva ~10 s. Uma camada que falha não zera as outras; se **todas** falham, a fonte vira "indisponível".
- **Situação:** 1 UHE (Água Vermelha), 7 linhas de transmissão, 0 subestações na região.

### DNIT — rodovias (`dnit`) e DER/MG (`der_mg`, inativa)
- **Endereço:** https://servicos.dnit.gov.br/vgeo/ · serviço `https://servicos.dnit.gov.br/dnitgeo/geoserver/ows` (`Fees NONE`, `AccessConstraints NONE`).
- **Federais:** `vgeo:vw_snv_rod` guarda **todas as versões** do SNV desde 2013 (548 trechos na região); o adaptador filtra a vigente com `CQL_FILTER=BBOX(geom,…) AND dt_fim > hoje` (versão 202607A, 12 trechos).
- **Estaduais:** `vgeo:vw_cide_rod_2021` — base CIDE que o DNIT publica, com as estaduais de MG (MG-255 etc.), 35 trechos.
- **DER/MG:** sem serviço geográfico; a IDE-Sisema (`idesisema.meioambiente.mg.gov.br/geoserver`) respondeu 503. Fica inativa; as estaduais vêm da CIDE.
- **Campos:** `Codigo_BR, Codigo_SNV, Superficie_Federal, Extensao, Versao_SNV`; CIDE `Codigo_Rodovia, Unidade_Federacao, Superficie_Estadual, Jurisdicao`.

### IBGE — biomas (`ibge_biomas`) e municípios (`ibge`) — 22/10/2026
- **Biomas:** `https://geoservicos.ibge.gov.br/geoserver/ows`, camada `CREN:lm_bioma_250` (Biomas do Brasil, 1:250.000; 6 feições, 33 MB, EPSG:4674).
  A consulta por envelope devolve o **bioma inteiro** (o Cerrado todo), por isso a camada é copiada para o banco
  (`ibge_biomas`, dividida em 10.723 pedaços em `ibge_biomas_partes`). O relatório mostra a porcentagem de cada bioma
  na área; o mapa desenha a versão simplificada (~900 m) na camada "Biomas (limite oficial)", grupo Ambiental.
  Observação: o WFS 2.0 com `bbox` em `urn:ogc:def:crs:EPSG::4326` responde `InvalidParameterValue`; o 1.1.0 funciona.
- **Municípios:** malha `servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=intermediaria`
  (5.570 municípios, 12 MB; Boa Esperança do Norte/MT ainda sem malha) e nomes pela API de localidades. Serve para achar
  o município de qualquer ponto (`fn_municipio_no_ponto`).
- **Indicadores (SIDRA, `apisidra.ibge.gov.br`):** tabela 4714 (Censo 2022: população, área, densidade), 6579
  (população estimada, último ano), 5938 (PIB dos Municípios: PIB a preços correntes; participação da agropecuária
  no valor adicionado, que por município só existe até 2021). PIB por habitante = PIB ÷ população do mesmo ano (2022).
  Valores "...", "-" e "X" do SIDRA viram vazio. Cada indicador fica com valor, ano, unidade e tabela.
- **Carga e atualização:** `node scripts/ibge-importa.mjs [biomas] [municipios] [indicadores]` (todo: ~50 s). Indicadores
  uma vez por ano, depois da estimativa de população (agosto) e do PIB dos Municípios (dezembro).
- **Teste:** `node scripts/testa-ibge.mjs` (no `npm run testa`).

### Copernicus Data Space — Sentinel-2 (`sentinel`) — 22/10/2026
- **Catálogo (aberto, sem conta):** `POST https://stac.dataspace.copernicus.eu/v1/search`, coleção `sentinel-2-l2a`,
  filtro CQL2 `eo:cloud_cover <= N`, ordenado por data. A nuvem é da quadrícula MGRS inteira (~110 km), não da área.
  Na divisa de quadrícula a mesma passagem aparece duas vezes: fica a de menos nuvem.
- **Imagem e NDVI (com conta):** Sentinel Hub do CDSE, `https://sh.dataspace.copernicus.eu/api/v1/process` (PNG do tile,
  EPSG:3857) e `/api/v1/statistics` (média e faixas do NDVI na área). Token OAuth `client_credentials` em
  `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`. Sem token: 401.
- **Nuvem:** pixels com SCL 3 (sombra), 8, 9 (nuvem) e 10 (cirro) saem transparentes na imagem e fora da média.
- **Faixas do NDVI:** ≤0 água/sem vegetação · ≤0,2 solo exposto · ≤0,4 vegetação baixa · ≤0,6 moderada · >0,6 densa.
- **Cota grátis:** 10.000 unidades de processamento por mês e 300 pedidos por minuto (documentação de quotas, 22/10/2026).
  Para economizar: tiles só do zoom 10 ao 16, só para o plano profissional, guardados 7 dias no navegador e em memória.
- **Licença:** dados Copernicus Sentinel são livres, inclusive para uso comercial, com atribuição (a atribuição vai no
  canto do mapa). Resolve a restrição do mosaico da EOX de 2018 em diante (CC BY-NC-SA).
- **Ligar:** criar a conta em https://dataspace.copernicus.eu, abrir https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings
  › OAuth clients › Create (o segredo só aparece uma vez) e pôr `COPERNICUS_CLIENT_ID` e `COPERNICUS_CLIENT_SECRET` no servidor.
  Sem elas, a busca de cenas funciona, a cena não abre (aviso no painel) e o NDVI some do relatório.
- **Teste:** `node scripts/testa-sentinel.mjs` (no `npm run testa`); testa um modo ou outro conforme a conta exista.
- **Não testado sem a conta:** a geração do PNG e a estatística do NDVI (Process e Statistical API) — o código segue a
  documentação do CDSE, mas só roda de verdade depois de configurar o cliente OAuth.

### Demais fontes ativas (sem mudança em 07/10)
| Fonte | Serviço | Licença | Atualização |
|---|---|---|---|
| FUNAI | `geoserver.funai.gov.br/geoserver/Funai/ows` · `Funai:tis_poligonais` | `AccessConstraints NONE` | conforme atos de demarcação |
| PRODES / DETER / hidrografia / UCs | `terrabrasilis.dpi.inpe.br/geoserver/ows` | dados abertos INPE | anual / diária / irregular |
| Focos de calor | `data.inpe.br/queimadas/geoserver/ows` · `bdqueimadas:focos` (endereço novo em 21/10/2026) | dados abertos INPE | várias vezes ao dia |
| ANA | `snirh.gov.br/arcgis/rest/services/DADOSABERTOS/Curso_dÁgua` | dados abertos ANA | — |
| OpenStreetMap | Overpass API | ODbL (atribuição obrigatória) | contínua |
| IBGE | `servicodados.ibge.gov.br` | dados públicos | anual |

---

## 3. Origem e data de cada informação (3.15)

- `fontes_externas.classificacao`: **oficial** (órgão responsável, ou republicação por órgão público), **terceiro** (OSM, MapBiomas), **derivado** (cálculo do Arini — NDVI, áreas, distâncias). "Informado pelo usuário" é o quarto selo, usado para o que o anunciante declara.
- Cada `ResultadoFonte` e **cada item** sai do adaptador com `origem = { orgao, base, tipo, consultado_em, atualizado_em?, versao? }`. Vai dentro do item porque as rotas guardam só `resultado.itens` — a origem sobrevive ao cache sem mudar rota.
- Data da base quando o serviço expõe: embargos (`max(dat_ult_alteracao)`), DNIT (versão do SNV), SIGEF (aprovação mais recente na área), ANM (frequência declarada). Nas demais aparece a frequência da ficha.
- Tela: `src/components/rural/Selos.tsx` (`SeloClassificacao`, `SeloSituacao`, `LinhaOrigem`) usada em `FontesLista` (consulta de área) e `ConsultaRural` (relatório do imóvel).

## 4. Teste de queda e lentidão (3.16)

- `fontes_externas.sonda_url`: pedido mínimo por fonte (envelope de ~2 km em Iturama, só contagem).
- `fontes_saude (fonte_id, ok, status_http, ms, erro, origem, verificado_em)`; `fn_fonte_saude_registrar` grava e recalcula: **3 falhas seguidas → `instavel`**, uma resposta boa → `ok`.
- Quem roda: worker (`verificar_fontes`, a cada 6 h — `VERIFICA_FONTES_HORAS`), botão "Verificar agora" em /admin/fontes (`POST /api/admin/fontes/verificar`, setores Cartografia ou Segurança) e `node scripts/verifica-fontes.mjs`. As três usam `worker/jobs/sondaFonte.mjs`.
- "OK" exige HTTP 2xx **e** corpo sem `ExceptionReport`/`{"error"}`/HTML — serviço geográfico costuma falhar com 200.
- Relatório: fonte instável aparece como **"fonte com instabilidade"**, nunca "nada encontrado".
- Alerta por e-mail quando uma fonte cai depende do Resend (3.2).
