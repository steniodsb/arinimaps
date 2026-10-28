# ARINI IMÓVEIS BRASIL — Roadmap de pendências (16/10/2026)

> Repositório: github.com/steniodsb/arinimaps · migrations até a 0047 · verificação automática a cada push (GitHub Actions).
> Cobertura dos documentos de 05/10 (Fluxograma Mestre e Requisitos cartográficos): `docs/FLUXOGRAMA-COBERTURA.md` · planos por nicho: `docs/PLANOS.md`.
> Site travado pela senha de bloqueio (`SITE_SENHA`) até o lançamento.
> Acessos e senhas: `ACESSOS - NAO COMPARTILHAR.md`, fora do repositório.
> PDF: `Arini Imóveis Brasil - Roadmap de pendencias.pdf` (gerado destes mesmos dados).
>
> **Situação:** Pendente · Parcial · Validar (ajustado, falta conferir com o Carlos) · Bloqueado (aguarda outro item) · Decisão.
> 
> **Origem:** Call = call de 01/10 · Melhorias N = documento de melhorias, item N · Segurança N = requisitos de segurança e LGPD, item N · APIs = levantamento de APIs · Fluxograma N = Fluxograma Mestre (05/10), seção N · Carto N = Requisitos cartográficos (05/10), seção N.

---

## 1. Colocar no ar

Servidor, domínio e a estrutura que sustenta o sistema em produção.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 1.1 | **Variáveis de ambiente no servidor** — Inclui a senha de bloqueio, que mantém o site fechado até o lançamento. | Pendente | Stênio | — | — |
| 1.2 | **Publicar a versão atual** — Site, mapa, painel do anunciante e Matriz fora do ambiente de desenvolvimento. | Pendente | Stênio | 1.1 | — |
| 1.3 | **Domínio definitivo** — Apontar o endereço e gerar a versão final com ele. | Bloqueado | Stênio e Carlos | 8.6 | — |
| 1.4 | **Serviço de processamento** — Worker pronto e testado aqui (`deploy/worker-compose.yml`, `node scripts/worker-local.mjs`): vídeo otimizado (720p, 49,6 MB → 1,4 MB) e imagem de capa, captura para compartilhamento passando pela senha do site, lotes, pontos de referência, saúde das fontes, monitoramento e descarte. Falta subir na VPS. | Bloqueado | Stênio | 1.2 | — |
| 1.5 | **Ambiente de homologação** — Um comando monta tudo (`node scripts/homologacao.mjs`: migrations, seed, CAR e 40 imóveis de teste; recusa se apontar para a produção). Roteiro em `docs/HOMOLOGACAO.md`. Falta criar o projeto Supabase e o app no Dokploy. | Pendente | Stênio | — | Melhorias 22 · Segurança 9 e 15 |
| 1.6 | **Backup automático e recuperação** — `scripts/backup.mjs` (banco criptografado AES-256-GCM, retenção 7 diários / 4 semanais / 12 mensais na R2), `scripts/backup-arquivos.mjs` (fotos e documentos, incremental) e `scripts/backup-restaurar.mjs` (confere e restaura). Testado aqui; roteiro e metas em `docs/BACKUP.md`. **28/10:** `BACKUP_CHAVE` gerada (no `.env.local`, no `deploy/.env.worker` e no arquivo de acessos) e primeiro backup enviado à R2 (`backups/banco/2026-10-28/`, 283 MB cifrado; arquivos: 8 fotos e vídeos, 67 MB); `--conferir` decifrou e leu os dois dumps. Falta o agendamento na VPS. | Parcial | Stênio | 1.2 | Call · Melhorias 20 · Segurança 16 |
| 1.7 | **Proteção de borda (Cloudflare)** — Filtro de ataques, cache do mapa e R2 (arquivo do CAR nacional, backups). Roteiro em `deploy/DEPLOY.md` §6b. **27/10:** R2 pronta (bucket `arinimaps`, domínio `mapas.arinibrasil.com.br`, CORS, token só deste bucket). Falta o proxy da Cloudflare na frente da VPS. | Parcial | Stênio | 1.2 | Segurança 9 |
| 1.8 | **Acesso direto ao banco restrito** — Banco sem exposição aberta à internet: acesso administrativo só por rede e IPs autorizados. | Pendente | Stênio | — | Segurança 9 |
| 1.9 | **Dimensionar banco e armazenamento** — `docs/DIMENSIONAMENTO.md` e `docs/INFRA-NACIONAL.md`. **Decidido em 08/10:** testes com o Carlos no Supabase grátis + VPS 2 vCPU/4 GB; no lançamento, Supabase Pro (compute Micro incluso) + VPS 4 vCPU/8 GB em São Paulo. Fotos viram WebP no navegador e vídeos 720p no worker. **28/10: o banco passou do limite do plano grátis** (617 MB de 500 MB; o CAR ambiental do piloto ocupa 355 MB). O Supabase avisa que pode restringir o projeto: antecipar o Pro. Simplificar as geometrias foi medido e descartado (cortando até 50 cm o banco só cairia para ~510 MB). | Urgente | Stênio | 8.8 | Call · Melhorias 13 e 20 |
| 1.10 | **Monitoramento com alertas** — `/api/saude` (banco, armazenamento, tiles, fila, fontes) e o worker conferindo a cada 5 min: alerta em Segurança e e-mail aos responsáveis, um por componente por hora. Monitor externo (Uptime Kuma) para a VPS inteira. `docs/MONITORAMENTO.md`. O e-mail depende do Resend. | Parcial | Stênio | 1.2 · 3.2 | Melhorias 20 · Segurança 17 |
| 1.11 | **Limpeza dos dados de demonstração** — No dia do lançamento. | Pendente | Stênio | 8.13 | — |

## 2. Mapa e cartografia

O que foi apontado no mapa, o que já foi ajustado e precisa ser conferido, e o que falta.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 2.1 | **Velocidade e fluidez do mapa** — CAR e lotes como tiles vetoriais; CAR do **Brasil inteiro** num arquivo PMTiles pronto (2,4 GB, 432 mil tiles) que o navegador lê por pedaços direto da Cloudflare, sem passar pelo servidor. Marcadores menores. Falta publicar o arquivo na R2 e medir em aparelho real no 4G. | Validar | Stênio e Carlos | 1.7 | Call · Melhorias 2 |
| 2.2 | **Tour 3D só depois do mapa carregar** — Ajustado e mais lento. Conferir no celular. | Validar | Stênio e Carlos | — | Call · Melhorias 4 |
| 2.3 | **Marcações visíveis ao afastar o zoom** — Imóveis têm marcador regional; a malha do CAR agora aparece desde a visão regional (de longe só as áreas maiores, com aviso) em vez de sumir abaixo do zoom 12. | Validar | Stênio e Carlos | — | Call |
| 2.4 | **Mapa limpo, só com o essencial** — Lotes e metragens numa camada limpa; a planta original, com círculos, setas, rodovias e nomes de rua, virou camada opcional. | Validar | Stênio e Carlos | — | Call · Melhorias 3 |
| 2.5 | **Revisar os arquivos de planta com o Miguel** — Limpar os desenhos na origem e corrigir o que veio errado no arquivo. | Pendente | Stênio e Carlos | 7.7 | Call |
| 2.6 | **Regiões onde a planta não bate com o satélite** — Conferir quadra a quadra nas três cidades e recalibrar onde houver deslocamento. Medido em 07/10 contra as ruas do OpenStreetMap (`scripts/confere-alinhamento.mjs`, relatório em `docs/ALINHAMENTO-PLANTAS.md`): Iturama e Limeira no lugar no geral (≤ 1 m), com desvios locais de 5–8 m no norte de Iturama; União de Minas ~6 m a leste — conferido no satélite e recalibrado em 08/10 (−15,8, −9,0), lotes gerados de novo. Os tiles de lotes agora levam versão: recalibração aparece na hora. **16/10:** calibração por parte — o admin desenha uma área e move/gira só aquela quadra ou trecho; os lotes da parte andam junto e mantêm a numeração (`docs/ALINHAMENTO-PLANTAS.md`). | Validar | Stênio | — | Call |
| 2.7 | **Metragem em todos os lotes** — Agora calculada pela divisa de cada lote, inclusive onde a planta não trazia. Conferir com o Carlos. | Validar | Stênio e Carlos | — | Call |
| 2.8 | **Ferramentas da parte de baixo do mapa** — Medir área e distância estão no mapa. Conferir com o Carlos. | Validar | Stênio e Carlos | — | Call |
| 2.9 | **Plantas completas de Limeira do Oeste e União de Minas** — Exportar os arquivos do AutoCAD no formato que o sistema lê. **27/10:** convertidos de DWG para DXF com o LibreDWG (`cartografia/`) e numerados (ver 2.11). | Validar | Stênio | — | — |
| 2.10 | **“Consultar informações” no lote urbano** — O rural já tem, pela consulta do CAR. Cartão do lote ganhou o botão; `/consulta/lote/[id]` mostra município, área, perímetro, lados, quadra e número, pontos de referência com distância e o cruzamento com as fontes ao vivo (mesma trava de plano, cota, cache e registro do CAR, código comum em `src/lib/geo/consultaArea.ts`). | Validar | Stênio | — | Melhorias 7 |
| 2.11 | **Número do lote e da quadra** — Ler os textos da planta e associar a cada lote. `scripts/numera-lotes.mjs` lê os textos do DXF; em Iturama 21.688 de 25.910 lotes ganharam número e 21.504 quadra (19.002 os dois). Aparecem no cartão do lote, na consulta e no mapa a partir do zoom 18. Limeira e União convertidas de DWG para DXF com o LibreDWG 0.14 em 27/10/2026 (DXF em `cartografia/`): União 1.034 de 1.170 lotes com número e 877 com quadra; Limeira 2.445 de 4.166 com número e 2.196 com quadra (planta com menos números legíveis no centro). | Validar | Stênio | — | Melhorias 6 |
| 2.12 | **Pontos de referência** — Distância até o imóvel (painel do mapa e página do imóvel) e atualização periódica: o worker agenda sozinho, uma vez por dia, os anúncios com pontos mais velhos que o prazo de Configurações › Mapa (padrão 90 dias). | Validar | Stênio | — | Melhorias 5 |
| 2.13 | **Expansão para novas regiões** — `node scripts/nova-regiao.mjs` (municípios pelo IBGE num raio, CAR automático) e roteiro em `docs/EXPANSAO.md`. Testado com Frutal (117 municípios, desfeito depois do teste). | Validar | Stênio | — | Call · Melhorias 1 |
| 2.14 | **Cartografia nacional do CAR** — Arquivo do Brasil inteiro gerado (`scripts/car-nacional/`: baixa do SICAR, gera, publica, confere), atualizado uma vez por mês, sem depender do SICAR na hora do uso. Enquanto não está na R2, o mapa busca no SICAR sob demanda a janela da tela. **21/10:** arquivo pronto em `dados/car-brasil.pmtiles` (2,4 GB, 08/10); **27/10:** publicado na R2 (`https://mapas.arinibrasil.com.br/car/car-brasil.pmtiles`, leitura por pedaços e CORS conferidos). Falta pôr `NEXT_PUBLIC_CAR_NACIONAL_URL` na Vercel e na VPS. | Validar | Stênio | 1.1 | Carlos 07/10 |
| 2.15 | **Camadas oficiais no mapa** — SIGEF, terras indígenas (FUNAI), quilombolas, embargos do IBAMA, unidades de conservação, desmatamento PRODES Cerrado, focos de queimada do INPE e processos minerários da ANM desenhados no mapa, com cartão no clique e atalhos no menu (plano profissional). | Validar | Stênio e Carlos | — | Carlos 07/10 |

## 3. APIs e integrações

Serviços externos e bases oficiais que alimentam o mapa, os avisos e o relatório.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 3.1 | **Satélite licenciado (Esri)** — Decidido em 23/09 (Esri Location Platform; 2 milhões de tiles/mês grátis). Conta "arinimaps" no ArcGIS Location Platform (pagamento por uso desligado) e chave criada em 19/10/2026 (Mapas Base, referenciadores arinibrasil.com.br, www e localhost:3000; **vence em 18/10/2027**, renovar antes). **26/10:** as nuvens voltaram na imagem "atual"; o mapa passou a usar a versão fixa do Wayback (release 20512, 23/10/2025) com a chave, medida sem nuvem nos municípios do piloto. Falta a Esri confirmar por escrito que a chave cobre o Wayback. | Validar | Stênio | — | — |
| 3.2 | **E-mails automáticos (Resend)** — Novo interessado, imóvel aprovado, recuperação de senha e alertas. | Bloqueado | Stênio | 1.3 | — |
| 3.3 | **Cobrança (Asaas)** — Mensalidade do anúncio e assinatura da consulta, com baixa automática. | Bloqueado | Carlos | 8.3 | Call |
| 3.4 | **SIGEF, IBAMA embargos, quilombolas e IPHAN** — Consultados ao vivo no relatório territorial: SIGEF e SNCI pelo serviço do INCRA, embargos pelo ArcGIS do IBAMA, quilombolas pela base do INCRA republicada pelo IBAMA e patrimônio pelo serviço do IPHAN. Na região de Iturama: 4.170 parcelas SIGEF, 21 embargos, 19 bens do IPHAN, nenhum território quilombola. O serviço do INCRA declara “vedado o uso comercial”: validar com o jurídico. | Validar | Stênio e Carlos | — | APIs |
| 3.5 | **Camadas ambientais do CAR** — APP, reserva legal, vegetação nativa e área consolidada não têm consulta pública: o serviço do SICAR só publica o perímetro, e a base de downloads exige CAPTCHA por município. **22/10:** importação manual pronta em Central › CAR: importação e cobertura (`/admin/car`): o zip do SICAR é lido no navegador (zips aninhados, UTM pelo `.prj`, Latin-1), validado polígono a polígono no banco (corrige geometria, recusa fora do Brasil, ignora repetido e arquivo já importado), com histórico de versões, ficha das falhas e painel de cobertura nacional (5.571 municípios do IBGE). A fonte `car_ambiental` entrou no relatório lendo o banco, com a data da base. Procedimento em `docs/CAR-IMPORTACAO.md`. Testado de ponta a ponta com um arquivo no formato do SICAR (o real exige CAPTCHA). **28/10:** os 6 municípios do piloto foram importados da base estadual do SICAR (MG, 05/10/2026), com os 4 temas e o limite do IBGE: 92.503 polígonos vigentes (APP 67.811, área consolidada 8.986, reserva legal 7.563, vegetação nativa 8.143) e ~2% recusados por geometria degenerada do próprio SICAR. O recorte é pelo código do imóvel: imóvel inscrito no município vizinho não entra. Falta: o Carlos decidir a frequência e pedir ao SFB a base nacional (item 1.8 do levantamento). | Validar | Stênio e Carlos | — | APIs · Carlos 22/10 |
| 3.17 | **Biomas oficiais e indicadores do IBGE** — Itens 4 e 8 do levantamento do Carlos (22/10). Limite oficial dos biomas (IBGE 1:250.000) no banco: a fonte "Bioma (limite oficial)" no relatório mostra a porcentagem de cada bioma na área (Iturama: 97,8% Cerrado, 2,2% Mata Atlântica), e a camada "Biomas (limite oficial)" no mapa, com uma cor por bioma e legenda. Malha dos 5.570 municípios (acha o município de qualquer ponto) e indicadores com o ano de cada um: população do Censo 2022 e estimada, área, densidade, PIB, PIB por habitante e participação da agropecuária, no bloco "Contexto do município" das consultas de CAR, lote, área desenhada e da página do imóvel. Carga: `scripts/ibge-importa.mjs`; teste: `scripts/testa-ibge.mjs`. | Validar | Stênio e Carlos | — | Carlos 22/10 |
| 3.6 | **MapBiomas (uso do solo)** — Aprovado pelo Carlos em 20/10/2026 (por token): criar a conta, aceitar os termos e integrar. | Pendente | Stênio e Carlos | — | APIs |
| 3.7 | **SNCR, CNIR, CAFIR e CIB** — Bases cadastrais rurais que exigem acesso autorizado pelo órgão. Carlos vai solicitar o acesso (20/10/2026). | Bloqueado | Carlos | — | APIs |
| 3.8 | **Imagens históricas e Sentinel-2 do Copernicus** — Chip "Imagem do ano" no mapa (plano profissional): Esri Wayback 2014–2025 em alta resolução e Sentinel-2 sem nuvens da EOX, com modo comparar. **22/10:** cena do dia pelo Copernicus Data Space — período e nuvem máxima, lista das passagens da tela (catálogo aberto, já funciona), cena em cor real ou NDVI no mapa e na cortina de comparação, e a fonte "Vegetação (NDVI do Sentinel-2)" no relatório (NDVI médio, faixas e o mesmo período do ano anterior). Imagem e NDVI esperam a conta: criar em dataspace.copernicus.eu e o cliente OAuth no painel do Sentinel Hub (`COPERNICUS_CLIENT_ID`/`SECRET`); passo a passo em docs/FONTES.md. Licença Copernicus permite uso comercial; a EOX de 2018+ não. Landsat ainda não. | Bloqueado | Stênio | — | APIs |
| 3.9 | **Rodovias (DNIT e DER/MG)** — Federais (versão vigente do cadastro nacional) e estaduais (base que o DNIT publica, com as do DER/MG) entram ao vivo no relatório; 15 rodovias na região. O DER/MG não publica serviço próprio. | Validar | Stênio | — | APIs |
| 3.10 | **ANEEL e ANM** — A ANM voltou a responder (127 processos na região). A ANEEL agora traz linhas de transmissão e subestações, além das usinas (7 linhas e a UHE Água Vermelha na região). | Validar | Stênio | — | APIs |
| 3.11 | **API de avaliação de imóveis** — Base para a pré-avaliação de valor. | Bloqueado | Carlos | 8.4 | Call · Melhorias 18 |
| 3.12 | **Chave de inteligência artificial** — Modelo decidido em 08/10: Claude Haiku 5.5 (~R$ 0,005 por pergunta), com cotas por plano (20 a 2.000/mês) e limite de conversas simultâneas. Chave da Anthropic na Vercel desde 19/10/2026. **22/10:** créditos colocados na conta; a API responde (HTTP 200 com o Haiku 5.5) e o assistente respondeu pelo site, com o número batendo com o banco (39 publicados em Iturama: 19 rurais, 20 urbanos). Conferir com `node scripts/confere-chaves.mjs`. Falta conferir em produção, com login no site. | Validar | Stênio | — | Call |
| 3.13 | **Busca por matrícula** — Objetivo (Carlos, 20/10/2026): clicar no imóvel e ver o NÚMERO da matrícula para pedir o espelho no cartório. Rural certificado: feito em 20/10/2026 — o cartão do CAR no mapa, a página de consulta do CAR, a consulta de área e o relatório mostram "Matrícula nº …" pelo SIGEF (cruzamento da divisa com a parcela certificada; 4 de 5 imóveis testados em Iturama). Rural não certificado e urbano (custo zero, 20/10/2026): o anunciante informa número e cartório junto do documento, a Matriz confere (Admin › imóvel › Matrícula) e o anúncio mostra só o selo "Matrícula conferida pela Arini"; nas consultas, botão que copia a coordenada e abre o Mapa do Registro de Imóveis do ONR (grátis, sem API, com reCAPTCHA). Fonte paga como reserva: Infosimples (mapa do ONR por API, R$ 0,20/consulta, mínimo R$ 100/mês). | Parcial | Stênio e Carlos | — | Call · Melhorias 16 |
| 3.14 | **Matriz técnica das fontes** — Para cada fonte: órgão, endereço oficial, tipo de acesso, autenticação, custo, limites, licença, atualização, campos e situação medida. Em docs/FONTES.md e na tela Fontes oficiais (Cartografia). | Validar | Stênio e Carlos | — | APIs · Melhorias 19 |
| 3.15 | **Origem e data de cada informação** — Cada bloco do relatório mostra órgão, base, selo (oficial, terceiro, derivado ou informado pelo usuário), data da consulta e, quando o órgão informa, a data ou versão da base. | Validar | Stênio e Carlos | — | APIs · Melhorias 19 |
| 3.16 | **Teste de queda e lentidão das fontes** — Verificação automática a cada 6 horas e botão “Verificar agora”, com disponibilidade e tempo de resposta dos últimos 7 dias; três falhas seguidas marcam a fonte como instável e o relatório avisa “fonte com instabilidade”. Falta o aviso por e-mail. **21/10:** o INPE mudou o serviço de focos de calor para `data.inpe.br` (camada `bdqueimadas:focos`); consulta, camada do mapa e sonda atualizadas (migration 0049). | Parcial | Stênio | 1.4 · 3.2 | Melhorias 19 |

## 4. Design

Acabamento visual e experiência em cada tela e aparelho.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 4.1 | **Interface mais simples e amigável** — Revisão de 08/10 com `scripts/screenshot-revisao.mjs` (20 telas em escuro, claro e celular, sem erro de página); ícones SVG no lugar de emoji na home e botões travados com explicação. Simplificar mais depende do retorno do Carlos. | Validar | Stênio | — | Call |
| 4.2 | **Revisão do modo claro tela por tela** — Todas as telas novas e as principais conferidas no modo claro (Matriz, planos, fontes, conta, mapa) sem contraste quebrado. | Validar | Stênio | — | — |
| 4.3 | **Layout no celular real** — Conferido em 390 px: mapa (aviso do CAR e assistente não cobrem mais os controles), home, painel e Central. **21/10:** tabelas da Central com a 1ª coluna fixa e sombra de rolagem no celular; indicadores sem o número cobrir o ícone. Falta aparelho real em 4G (9.4). | Validar | Stênio | 1.2 | — |
| 4.4 | **Logo e cores oficiais** — Hoje o logotipo é só texto. | Pendente | Carlos | — | — |
| 4.5 | **Fotos reais** — Página inicial e imóveis de vitrine. | Pendente | Carlos | — | — |
| 4.6 | **Foto no perfil de cada usuário** — Feito em Minha conta (/conta): foto enviada é recortada e reduzida no navegador, fica à parte da selfie da exclusividade e aparece no topo do site, na Central e nas listas de organização. Conferir com o Carlos. | Validar | Stênio e Carlos | — | Melhorias 9 |
| 4.7 | **Botão de tema na tela de acesso restrito** — Botão claro/escuro no topo da tela de senha do site. | Validar | Stênio | — | — |
| 4.8 | **Seção “Entre na área de consultas” da home com mapa vivo** — Mapa não interativo passeando por três cenas (CAR, lotes de Iturama, região) atrás de cartões com ícones. Conferir no celular e no 4G. | Validar | Stênio e Carlos | — | 07/10 |

## 5. Funcionalidades

Recursos novos que ainda não estão no sistema.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 5.1 | **Chat de inteligência artificial** — Busca em linguagem natural (“lotes de R$ 40 mil em Iturama”), sem acesso livre ao banco e respeitando as permissões de quem pergunta. Pronto e inerte até a chave: botão “Pergunte à Arini” no site e no painel, respostas em tempo real citando a fonte e com link para a ficha ou a área do CAR; só consulta imóveis publicados, dados públicos do CAR, consultas já feitas e a base de conhecimento (nada de dado pessoal nem SQL livre). Recurso “Assistente de IA” nos planos (gratuitos com 20 perguntas/mês), limite por minuto e hora, conversas gravadas para auditoria e tela de uso e custo estimado em Conhecimento e IA. Sem a chave aparece “Assistente em configuração”. | Parcial | Stênio | 3.12 | Call · Melhorias 16 · Segurança 18 |
| 5.2 | **Base de conhecimento da IA** — Atualizável e auditável, com fonte e data, em vez de aprendizado sem controle. Tela Conhecimento e IA (Marketing e Diretoria): artigos em rascunho, publicado ou arquivado, com fonte, data de referência e versão a cada alteração; busca em português que o assistente usa. 12 artigos iniciais escritos a partir dos termos e da documentação — a Arini deve revisar. | Validar | Stênio e Carlos | — | Melhorias 17 |
| 5.3 | **Pré-avaliação de valor** — Localização, área, topografia, aproveitamento e infraestrutura, sempre como estimativa e com encaminhamento a profissional. Metodologia própria v0 (docs/PRE-AVALIACAO.md): comparáveis do sistema em R$/ha ou R$/m², fatores documentados (oferta, área, distância à sede e à rodovia), faixa, mediana e confiança; com poucos comparáveis responde “dados insuficientes”. Botão “Falar com um avaliador” vira lead no funil. Desligada para clientes até a aprovação; a equipe testa na ficha da Central. | Validar | Stênio e Carlos | 8.4 | Call · Melhorias 18 |
| 5.4 | **Aptidão territorial** — Indicar se a área é mais propícia para lavoura ou gado de corte e qual a rentabilidade esperada, mostrando os fatores usados. Indicação qualitativa (lavoura, pecuária ou restrições) a partir da declividade medida no modelo de elevação, água e restrições já consultadas, listando o que falta (solo, MapBiomas, embargos). Rentabilidade não é estimada por falta de dado verificável. Desligada para clientes até a aprovação. | Validar | Stênio e Carlos | 8.4 | Call · Melhorias 18 |
| 5.5 | **Consulta básica, profissional e assinatura** — Estrutura pronta: planos por nicho com recursos, cotas e trava no servidor; consulta de área limitada pela cota do plano. Faltam preço e cobrança. | Parcial | Stênio | 8.5 · 8.14 | Call · Melhorias 15 |
| 5.6 | **Consulta nacional** — A consulta vale para o Brasil todo; a venda começa na região de Iturama. As fontes ao vivo já consultam qualquer área, falta abrir a consulta para fora da região. Ferramenta “Consultar Área” no mapa: desenha um polígono em qualquer ponto do Brasil (até 50.000 ha) e abre `/consulta/area/[chave]` com as fontes, mesma trava de plano e cota. | Validar | Stênio | — | Call |
| 5.7 | **Acesso do franqueado** — Só consulta e gestão dos próprios imóveis; aprovação continua na Matriz. Perfil e território existem; falta conferir as telas dele. | Validar | Stênio e Carlos | 8.10 | Call · Melhorias 12 |
| 5.8 | **Histórico de versões na pasta do imóvel** — Reenviar um documento do mesmo tipo cria a versão seguinte e guarda a anterior; a pasta mostra "versão N" e as versões anteriores, e a Matriz vê quem enviou cada uma. A conferência e a trava de publicação valem para a versão atual. Fotos e vídeos ainda não têm versões. | Validar | Stênio e Carlos | — | Melhorias 13 |
| 5.9 | **Separação por organização** — Organizações cadastradas pela Matriz com plano e região; o administrador da organização convida e remove membros, e o convite é aceito no login. O plano da organização vale para os membros que estão no plano padrão. Falta o Carlos decidir se os membros veem a carteira de imóveis uns dos outros. | Decisão | Carlos | 8.10 | Melhorias 1 |
| 5.10 | **Preferências salvas na conta** — Tema, base do mapa e camada do CAR ficam na conta; o mapa abre como a pessoa deixou e lembra cada troca. | Validar | Stênio | — | — |
| 5.11 | **Planos por nicho** — Conta tem nicho (persona do fluxograma) e plano; o plano libera ferramentas, camadas e consultas, com cota mensal. Diretoria edita em Planos e nichos e troca o plano de cada conta em Equipe e usuários; página pública /planos; tentativas bloqueadas registradas em Segurança. Preços em zero até a definição. | Validar | Stênio e Carlos | 8.14 · 8.15 | Fluxograma 3 e 20 · Melhorias 1, 10 e 15 |
| 5.12 | **Solicitações cartográficas** — “Não encontrei meu imóvel” e “o mapa está divergente” pelo mapa, com protocolo, anexos, fila do setor de Cartografia, status e devolutiva; a geometria do usuário só vira oficial quando a Matriz aplica e valida. | Validar | Stênio e Carlos | — | Carto 2 e 3 |
| 5.13 | **Histórico e rastreabilidade do imóvel** — Acessos e interações, versões da divisa com origem e responsável, origem de cada dado e trilha de auditoria na ficha (Matriz e anunciante); resumo público “Rastreabilidade”. | Validar | Stênio e Carlos | — | Carto 1 |
| 5.14 | **Alteração de anúncio publicado** — Anunciante propõe mudanças (título, descrição, valor, área, condições); vira versão para a Matriz aprovar ou rejeitar; o anúncio atual continua no ar durante a análise. | Validar | Stênio e Carlos | — | Fluxograma 9 |
| 5.15 | **Pedido de complemento** — Além de “corrigir”, a Matriz pede dados complementares; o anunciante vê a diferença no painel. | Validar | Stênio e Carlos | — | Fluxograma 7 |
| 5.16 | **Cadastro de demanda sem imóvel** — Demandas registradas pelo Comercial (botão na oportunidade); quando um imóvel publicado casa com a demanda (tipo, município, valor e área, com folga ajustável, 10% por padrão), vira tarefa do Comercial e e-mail ao responsável. Falta o Carlos confirmar os critérios. | Validar | Carlos | — | Fluxograma 12 |
| 5.17 | **Busca de imóveis** — Filtros de tipo, preço e área, ordem, grade ou lista, vista com **lista ao lado do mapa** (passar o mouse acende a divisa; clicar na divisa leva ao cartão), **favoritos** (coração no cartão e na ficha; sem conta ficam no aparelho e vão para a conta ao entrar) e páginas de 24. Imóvel sem foto mostra o terreno no satélite, também em Meu painel. | Validar | Stênio e Carlos | — | 08/10 |
| 5.18 | **Fotos e vídeos sem sobrecarregar** — Foto vira WebP de até 2048 px no navegador antes de subir (6,3 MB → 0,2 MB, sem os dados de GPS); vídeo é reduzido a 720p no worker, com capa. | Validar | Stênio | 1.4 | 08/10 |

## 6. Segurança e LGPD

O que falta para fechar os requisitos de segurança e proteção de dados.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 6.1 | **Varredura de vulnerabilidades e pentest** — Feito por empresa externa antes do lançamento. | Pendente | Externo | 1.2 | Segurança 15 e 21 |
| 6.2 | **Revisão de segurança das APIs** — Feita em 07/10 (67 rotas + teste direto na API do banco), relatório em `docs/AUDITORIA-APIS.md` e triagem automática em `scripts/audita-rotas.mjs`. Corrigidos: cadastro direto no Auth que permitia criar conta de Diretoria, escrita direta pelo navegador em imóvel/documentos/oportunidades (dava para publicar sem a Matriz), relatório territorial aberto de qualquer imóvel, troca de senha sem a senha atual, XSS no popup do mapa, upload sem conferir o conteúdo, CSRF (conferência de origem), cabeçalhos e cookie seguro. Cadastro público do Supabase desligado em 19/10/2026 (a API responde `signup_disabled`; o site cadastra por `admin.createUser`). | Feito | Stênio | — | Segurança 14 |
| 6.3 | **Registro de quem abre cada documento** — Documentos, selfies, autorizações, contratos e anexos cartográficos abrem por `/api/arquivos`, que confere a permissão a cada clique, registra quem abriu (inclusive negados) e assina por 60 s; lista em Segurança › Acessos a documentos. A pasta de documentos do imóvel e a selfie na ficha da Central também passam por ali. | Validar | Stênio | — | Segurança 11 e 13 |
| 6.4 | **Retenção e descarte automático** — Mecanismo pronto: prazos em Configurações › Segurança (selfie, documentos de anúncio reprovado, registros de acesso), rotina diária no worker com registro do que foi descartado e modo simulação. Tudo em 0 (não descartar) e só simulando até a decisão dos prazos. | Bloqueado | Stênio | 8.9 | Segurança 11, 12 e 19 |
| 6.5 | **Criptografia de campos sensíveis** — CPF/CNPJ cifrado na aplicação, com hash para unicidade e busca, e fora do token de sessão; inerte sem a chave `CAMPO_CRIPTO_CHAVE` (nada muda no cadastro). Telefone e caminhos de arquivo ficam sem cifra, com a justificativa em `docs/SEGURANCA.md` §6. **21/10:** chave gerada e gravada no `.env.local`; falta colar a mesma `CAMPO_CRIPTO_CHAVE` na Vercel (e depois na VPS). Hoje não há CPF gravado (só contas de teste), então o `cifra-cpf.mjs` não tem o que regravar; rodar de novo depois da chave no servidor, por garantia. **28/10:** rodado de novo: 0 perfis a regravar. | Parcial | Stênio | 1.1 | Segurança 10 |
| 6.6 | **Rotação de chaves e segredos** — Procedimento, frequência e responsável de cada segredo em `docs/SEGURANCA.md` §11. Falta indicar a conta da Arini que guarda cópia das chaves. | Validar | Stênio e Carlos | — | Segurança 2 e 10 |
| 6.7 | **Recuperação reforçada para a equipe** — Conta da equipe só troca a senha pelo link depois do código do autenticador ou, sem segundo fator, de um código enviado ao e-mail; fica na auditoria, gera alerta e avisa a diretoria. O código por e-mail depende do serviço de e-mail. | Validar | Stênio | 3.2 | Segurança 5 |
| 6.8 | **Alertas de acesso anormal** — Detecção pronta: aparelho ou local novo, excesso de senhas erradas e entrada logo após falhas viram alerta em Segurança, com “visto”. O aviso por e-mail ao dono da conta sai quando o serviço de e-mail estiver configurado. | Parcial | Stênio | 3.2 | Segurança 3, 6 e 17 |
| 6.9 | **Segundo fator obrigatório para a equipe** — A opção existe; falta ativar e cada pessoa cadastrar o código do celular. | Pendente | Carlos | — | Segurança 4 |
| 6.10 | **Plano de resposta a incidentes** — Escrito em `docs/INCIDENTES.md`: papéis, gravidade, primeiras 24 h, comunicação à ANPD e aos titulares (LGPD art. 48), evidências e pós-incidente. Faltam nomes e contatos de cada papel. | Parcial | Carlos | 7.2 | Segurança 20 |
| 6.11 | **Mapa de dados pessoais** — `docs/LGPD-MAPA-DE-DADOS.md`, levantado do banco: cada dado pessoal com finalidade, base legal sugerida, quem acessa, retenção e onde fica. Falta o jurídico validar bases legais e prazos. | Validar | Stênio e Carlos | 8.9 | Segurança 19 |
| 6.12 | **Proteção dos registros** — Auditoria, acessos, tentativas, histórico do imóvel, consultas, aberturas de documentos e revisões não podem ser alterados nem apagados, nem pelo servidor; só a rotina de retenção descarta, no prazo definido. | Validar | Stênio | — | Segurança 13 |
| 6.13 | **Revisão periódica de permissões** — Tela Segurança › Revisão de acessos: equipe com setores, último acesso e segundo fator; contas com plano fora do padrão; parceiros com território; botão “marcar revisão concluída” e aviso da próxima revisão (90 dias). Falta a primeira revisão. | Validar | Carlos | — | Segurança 8 |
| 6.14 | **Limite de requisições nas leituras do mapa** — Login, cadastro e consultas já têm limite. Tiles e `/api/geo` agora têm limite por IP (3.000 e 600 a cada 5 min), contado em memória para não pôr o banco na frente de cada tile. | Validar | Stênio | — | Segurança 14 |
| 6.15 | **Atualização mensal de dependências** — Rotina com os comandos em `docs/SEGURANCA.md` §14. Aplicado em 07/10: Next 16.3.8 (corrige falhas críticas), Supabase e demais atualizações sem quebra. Resta o MapLibre 6 (troca de versão maior, com teste do mapa). | Parcial | Stênio | — | Segurança 15 |

## 7. Dados e conteúdo da Arini

Informações que só a Arini tem e que entram direto no painel.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 7.1 | **CNPJ, CRECI-J, endereço da sede e foro** — Aparecem nos termos publicados. | Pendente | Carlos | — | — |
| 7.2 | **E-mail do encarregado de dados e e-mail dos interessados** | Pendente | Carlos | — | — |
| 7.3 | **E-mail definitivo da conta de administrador** — O atual é provisório. | Pendente | Carlos | — | — |
| 7.4 | **Lista final de municípios do piloto** | Pendente | Carlos | — | — |
| 7.5 | **Mensalidade do anúncio e dias de tolerância** | Pendente | Carlos | — | — |
| 7.6 | **Equipe e setor de cada pessoa** — Para criar as contas da Matriz. | Pendente | Carlos | — | — |
| 7.7 | **Contato do Miguel** — Para a revisão dos arquivos de planta. | Pendente | Carlos | — | Call |

## 8. Dúvidas gerais e decisões

Definições que destravam os itens bloqueados.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 8.1 | **Prazo, custo e valor do escopo novo** — Por etapa, separando correção, melhoria, novidade e integração, com riscos e dependências. | Decisão | Stênio e Carlos | — | Call · Melhorias 22 |
| 8.2 | **Custo por uso da inteligência artificial** — Decidido em 08/10: Claude Haiku 5.5, com cota por plano. Falta definir quais dados podem ser enviados ao serviço de IA (hoje só dado público e de anúncio publicado). | Decisão | Carlos | — | Segurança 18 |
| 8.3 | **Conta do Asaas e quais cobranças passam por ele** — Conta criada e chave de produção configurada (15/10); comercial aprovado, conta bancária e documentação pendentes no Asaas. Mensalidade pronta: cliente sem duplicar, webhook com vencimento, estorno e reenvio sem efeito duplo (migration 0045). Roteiro em `docs/ASAAS.md`. Decidido em 16/10: fatura vencida no Asaas suspende na hora (sem carência). Em aberto: cobrar comissão pelo Asaas. Webhook "Arini Imóveis Brasil" em `https://arinibrasil.com.br/api/asaas/webhook`, token e eventos gravados pelo script (19/10); a rota responde 401 a token errado. Falta a cobrança-teste de R$ 5. | Decisão | Carlos | — | — |
| 8.4 | **API ou metodologia da pré-avaliação e da aptidão** — E a validação jurídica do uso. | Decisão | Carlos | — | Call · Melhorias 18 |
| 8.5 | **Regras da consulta profissional** — O que libera, para quem e o valor da assinatura. | Decisão | Carlos | — | Call · Melhorias 15 |
| 8.6 | **Domínio** — `arinibrasil.com.br` comprado em 19/10/2026, DNS na Cloudflare. Falta o registro A para a VPS. | Decisão (feita) | Carlos | — | — |
| 8.7 | **MapBiomas por token ou por arquivo** — Decidido em 20/10/2026: por token. | Decisão (feita) | Stênio e Carlos | — | — |
| 8.8 | **Plano pago do banco de dados** — Decidido em 08/10: Supabase Pro (US$ 25/mês, compute Micro incluso) a partir do lançamento; nos testes, o plano grátis. Alternativas (Neon, Postgres na VPS) avaliadas e descartadas por ora. | Validar | Carlos | — | Call |
| 8.9 | **Selfie e prazos de guarda** — Finalidade, base legal, retenção e descarte de selfies e documentos. | Decisão | Carlos | — | Melhorias 9 · Segurança 12 |
| 8.10 | **Regras das franquias** — Território e o que cada franqueado enxerga. | Decisão | Carlos | — | Call · Melhorias 12 |
| 8.11 | **Pacote de suporte pós-lançamento** — Horário comercial, para usuários e para o sistema, e quando passar a ter pessoas dedicadas. | Decisão | Stênio e Carlos | — | Call |
| 8.12 | **Fontes que exigem autorização ou custo** — Decidido em 20/10/2026: vale contratar o serviço de cartório (rural e urbano, se houver) e pedir acesso ao SNCR/CNIR; Carlos faz as solicitações e cota os valores. | Decisão (feita) | Carlos | — | Call · APIs |
| 8.13 | **Data de lançamento** — Quando o site deixa de pedir a senha de acesso. | Decisão | Stênio e Carlos | — | Call |
| 8.14 | **Preço e cobrança dos planos** — Valor de cada plano (consulta profissional, parceiro, organização, franquia), periodicidade, se a assinatura soma ou substitui a mensalidade por anúncio, e cota de degustação do gratuito (hoje 2 consultas de área por mês). | Decisão | Carlos | 8.3 | Fluxograma 3 · Melhorias 15 |
| 8.15 | **Nichos da primeira versão** — Produtor rural, empresa/holding e prefeitura estão reservados no modelo (o fluxograma não define o fluxo deles). Entram agora, com qual plano, ou ficam para depois? Plano por pessoa ou por organização? | Decisão | Carlos | — | Fluxograma personas 5, 6 e 7 |

## 9. Testes e revisão

Validação antes de abrir ao público.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 9.1 | **Envio de vídeo de ponta a ponta** — Com o serviço de processamento no ar. | Pendente | Stênio | 1.4 | — |
| 9.2 | **Roteiro completo em homologação** — Cadastro, anúncio pelo CAR e pelo lote, documentos, aprovação, interessado, proposta, venda e comissão. | Pendente | Stênio | 1.5 | Melhorias 22 |
| 9.3 | **Rodada de testes com o Carlos** — Acesso, visualização e rastreio de ajustes, com a conta dele. | Pendente | Stênio e Carlos | — | Call |
| 9.4 | **Android e iPhone em 4G** | Pendente | Stênio | — | Melhorias 2 |
| 9.5 | **Testes de segurança antes do lançamento** — `scripts/testa-seguranca.mjs` (no `npm run testa`): 86 testes de força bruta, matriz de permissões por perfil e setor, acesso a registros de outro usuário, upload malicioso, RLS pela chave pública e segundo fator nas APIs; 86 ok em 16/10. Corrigido: funções do banco executáveis pela API pública (dava para trocar a divisa de qualquer imóvel — crítico, migration 0046), segundo fator só nas telas, setor ignorado em oportunidades/documentos/revisão e nas policies, relatório territorial legível por todos, caminho de documento com `../`. Território é só rótulo (a separação entre franquias vem da posse do imóvel). | Validar | Stênio | — | Segurança 21 e 22 |
| 9.6 | **Teste de restauração do backup** | Bloqueado | Stênio | 1.6 | Segurança 22 |
| 9.7 | **Testes automáticos antes de cada publicação** — A cada push o GitHub roda tipos, lint, auditoria das rotas e o build de produção (`.github/workflows/verificar.yml`); commit com ✗ não deve ir para o ar. `npm run testa` (ponta a ponta, precisa do site e do banco) roda na homologação. **22/10:** bateria com 15 etapas, todas verdes. Entraram fumaça, Matriz, configurações, lotes e a importação do CAR; os testes antigos foram atualizados para a senha do site e para a validação de upload, e passaram a reprovar de verdade quando um item falha. Órgão fora do ar vira aviso. A revisão visual cobriu 192 capturas (64 telas × 3 modos) sem nenhum problema. | Validar | Stênio | — | — |

## 10. Pós-lançamento e suporte

O que garante o sistema funcionando depois da abertura.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 10.1 | **Suporte em horário comercial** — Para os usuários e para o sistema, conforme o pacote definido. | Bloqueado | Stênio | 8.11 | Call |
| 10.2 | **Chat de suporte dentro do sistema** — A conversa do chamado atualiza sozinha dos dois lados, com aviso de atendente online e contador de chamados esperando no menu da equipe. A resposta vai por e-mail só se o cliente não estiver com a página aberta. | Validar | Stênio | 8.11 | Call |
| 10.3 | **Acompanhamento das primeiras semanas** — Correção rápida do que aparecer com os primeiros anunciantes. | Pendente | Stênio | 8.13 | Call |
| 10.4 | **Treinamento da equipe da Matriz** — Análise de anúncios, documentos, funil e cartografia. | Pendente | Stênio e Carlos | — | — |
| 10.5 | **Manual de funcionalidades e permissões** — `docs/MANUAL.md`: quem usa, fluxos da Central por setor, o que o cliente encontra, como ligar o que está desligado, testes. Permissões detalhadas em `docs/SEGURANCA.md` §2. | Validar | Stênio | — | Melhorias 22 · Segurança 22 |
| 10.6 | **Integração com o CRM de atendimento** — O CRM vira um braço deste sistema, com as melhorias pendentes dele, depois desta fase. | Pendente | Stênio | — | Call |

## Já entregue (resumo)

- **Mapa:** Satélite como padrão, marcadores regionais, imóveis rurais do CAR clicáveis (“esta área é minha”), 31 mil lotes urbanos clicáveis com metragens, cores para rural, urbano e leilão, tour 3D esperando o mapa e com pontos de referência.
- **Anúncio:** Pelo CAR, pelo lote ou desenhando a área; documentos conferidos pela Arini antes de publicar; fotos e vídeos; selfie na exclusividade; leilão com edital.
- **Perfis:** Proprietário, comprador, corretor, imobiliária, engenheiro, leiloeiro, franqueado, consulta e equipe interna, com território por franquia.
- **Matriz:** Nove setores com acesso controlado: operações, comercial, financeiro, jurídico, marketing, cartografia, suporte, segurança e diretoria; tarefas internas e chamados.
- **Segurança:** Senhas com hash, segundo fator, recuperação por link de uso único, limite de tentativas, regras de acesso no banco (RLS), registro de acessos e auditoria, sessões com expiração, senha de bloqueio do site.
- **Jurídico:** Seis termos com aceite registrado: versão, data, hora e IP. Pedidos de titulares (LGPD) atendidos pela Matriz.
- **07/10:** Mapa fluido com tiles vetoriais (CAR de longe, lotes e metragens de perto, cliques mantidos) e home com mapa vivo na seção de consultas.
- **06/10 — documentos de 05/10:** Planos por nicho (recursos, cotas, trava no servidor, tela da Diretoria, página pública), solicitações cartográficas com protocolo e fila da Matriz, histórico/versões/origem dos dados na ficha do imóvel, alteração de anúncio publicado como nova versão, pedido de complemento, tentativas de acesso bloqueadas registradas. Cobertura item a item em `docs/FLUXOGRAMA-COBERTURA.md`.
- **08/10:** Cartografia nacional do CAR (arquivo do Brasil inteiro pronto), oito camadas oficiais no mapa, fila e limite por órgão para aguentar acessos simultâneos, assistente de IA com Haiku 5.5 e base de inteligência por município, fotos e vídeos otimizados, backup criptografado, monitoramento, homologação e expansão em um comando, busca com lista e mapa, favoritos e páginas, códigos AIB nos imóveis de demonstração, verificação automática no GitHub.
