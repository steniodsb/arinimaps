# Arini Maps — Arquitetura completa do sistema

> Documento mestre do projeto. Versão 1.1 — 21/08/2026 (revisada: licenciamento de imagens, POIs via extract OSM, OSRM self-host, notificação de lead na F0, georreferenciamento por pontos de controle, render headless).
> Baseado em: especificação funcional do cliente (fluxograma §1–§32), transcrição da reunião de 21/08 e nos padrões já validados no CRM da Arini.
> Compromisso assumido na reunião: **primeira versão navegável na quarta-feira 27/08**.

---

## 0. Resumo executivo

O Arini Maps é um **marketplace imobiliário regional com o mapa como porta de entrada**: o comprador navega pelo mapa (urbano e rural), vê imóveis à venda destacados por cor, abre a página do imóvel (fotos, 3D, vídeo automático, pontos de interesse), clica em "Tenho interesse" e vira lead. A Arini é a **central de intermediação**: aprova todo cadastro (parceiro, proprietário e imóvel), qualifica todo lead e acompanha o funil até a venda, cobrando **1% sobre a operação** + **mensalidade de permanência** do anúncio.

Cadeia completa: `MAPA → IMÓVEL → APROVAÇÃO → PUBLICAÇÃO → INTERESSE → ARINI → INTERMEDIAÇÃO → NEGOCIAÇÃO → VENDA`.

Decisões estruturantes deste documento:

1. **Mesma stack do CRM da Arini** (Next.js App Router + Supabase + TypeScript + Tailwind, VPS WaveHost via Dokploy, mídia no R2). Zero curva de aprendizado, padrões de RLS/auditoria/aprovação já provados em produção com esse mesmo cliente.
2. **PostGIS no Supabase** como coração geoespacial — geometria, área, perímetro, distâncias e cruzamentos são SQL, não serviço externo.
3. **MapLibre GL JS** (open source, custo zero de licença) para o mapa 2D e para o **3D estilo Google Earth** (terreno + satélite + voo de câmera). Nada de Google Maps SDK pago.
4. **Vídeo automático = gravação do próprio voo 3D** (Puppeteer + ffmpeg num worker na VPS). Uma única apresentação alimenta o 3D interativo E o vídeo.
5. **Cartografia urbana entra como imagem georreferenciada** (confirmado na reunião: o cliente entrega a imagem georreferenciada; alinhamento por centro de referência). Pipeline GDAL → tiles → overlay no mapa. DWG vetorial fica para fase posterior, se necessário.
6. **Entrega faseada**: F0 demo navegável (27/08) → F1 fluxo comercial completo → F2 3D/vídeo/cartografia/POIs → F3 cobrança e expansão.

---

## 1. Stack e justificativa

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Mesmo padrão do CRM Arini; SSR para SEO das páginas de imóvel; App Router já dominado |
| UI | **Tailwind CSS** + componentes próprios | Padrão da casa; identidade verde/dourado da Arini já existe |
| Banco | **Supabase (Postgres + PostGIS + RLS + Auth + Storage)** | PostGIS resolve todo o motor geoespacial em SQL; RLS por perfil já é o modelo de segurança validado no CRM; projeto **novo e separado** do CRM |
| Mapa 2D | **MapLibre GL JS** | Open source, sem billing; vector + raster; suporta desenhar polígono (terra-draw), camadas custom, cores por status |
| Basemap | OSM (ruas) + satélite: **Esri World Imagery na demo**, **MapTiler/Mapbox no ar** | Satélite é obrigatório para rural. Os termos da Esri exigem uso via tecnologia Esri — para produção comercial, orçar MapTiler (free tier generoso, ~US$25/mês depois) ou Mapbox raster (50k loads/mês grátis) |
| 3D | **MapLibre terrain** (DEM Terrarium/AWS, gratuito) + satélite + extrusão/contorno do polígono + animação de câmera | Efeito "Google Earth" sem Cesium/Google 3D Tiles (que custam por sessão) |
| Vídeo | **Worker Node na VPS**: Puppeteer grava o voo 3D → ffmpeg → MP4 no R2 | Reusa a apresentação 3D; sem serviço de render pago |
| Geoprocessamento | **GDAL no worker** (raster → tiles) + **turf.js / PostGIS** (vetores, KML/KMZ em JS puro) | KML/KMZ processa direto na API do Next; só raster precisa do worker |
| POIs | **Extract OSM regional (Geofabrik) importado no PostGIS** (osm2pgsql, job mensal); Overpass só como complemento pontual | Posto, farmácia, supermercado, hospital, escola, rodovias e acessos ficam DENTRO do banco — consulta de POI vira `ST_DWithin`, sem dependência externa em runtime nem rate limit |
| Municípios/malhas | **APIs IBGE** (localidades + malhas municipais) | Limites municipais, cidades próximas, sede do município — público e gratuito (confirmado na reunião: "APIs públicas") |
| Rotas/distâncias | PostGIS (linha reta) no MVP; **OSRM self-host** no worker (extract regional, F2) | O servidor público do OSRM proíbe uso em produção. Um extract só da região roda leve na VPS; até lá, linha reta com rótulo honesto ("em linha reta") |
| Storage de mídia | **Cloudflare R2** (bucket próprio `arini-maps`) | Padrão da casa; tiles, fotos, vídeos, documentos |
| Infra | **VPS WaveHost + Dokploy + Traefik** (app) + container worker | Mesmo deploy do CRM; worker com teto de memória (lição da Evolution) |
| Pagamentos (F3) | **Asaas** (Pix/boleto/cartão, recorrência) | Mensalidade de permanência; cobrança de comissão via cobrança avulsa |
| E-mail transacional | **Resend** | Já usado no atendimento da Arini |

**O que deliberadamente NÃO entra:** Google Maps SDK (custo), Cesium ion (custo/complexidade), microserviços (um app + um worker bastam), importação DWG vetorial no MVP (ver §5.2 e §16).

---

## 2. Arquitetura de alto nível

```
                        ┌─────────────────────────────────────────┐
                        │       Next.js (app único, 4 áreas)      │
                        │                                         │
  Comprador ──────────► │  (public)/    mapa + marketplace + SEO  │
  Proprietário ───────► │  proprietario/ portal do proprietário   │
  Parceiro ───────────► │  parceiro/    portal imob/corretor/eng  │
  Arini ──────────────► │  admin/       painel central Arini      │
                        │  api/         leads, geo, jobs, share   │
                        └───────┬───────────────────┬─────────────┘
                                │                   │
                    ┌───────────▼──────────┐  ┌─────▼──────────────────┐
                    │  Supabase            │  │  Worker (VPS, Docker)  │
                    │  Postgres + PostGIS  │  │  GDAL: raster → tiles  │
                    │  Auth · RLS · Jobs   │  │  Puppeteer+ffmpeg:     │
                    │  (fila em tabela)    │  │  vídeo do voo 3D       │
                    └───────────┬──────────┘  │  screenshots OG/share  │
                                │             └─────┬──────────────────┘
                    ┌───────────▼──────────┐        │
                    │  Cloudflare R2       │◄───────┘
                    │  fotos · vídeos ·    │
                    │  tiles · documentos  │
                    └──────────────────────┘

  Externos (leitura, com cache em banco):
  IBGE (municípios/malhas) · Overpass/OSM (POIs) · OSRM (rotas) · Esri/OSM (basemaps)
```

**Padrão de jobs**: tabela `jobs` no Postgres (tipo, payload, status, tentativas). O worker faz polling; o app enfileira. Idempotente, com teto de memória no container — mesmo desenho dos jobs do atendimento da Arini, que já provou funcionar sem fila externa.

---

## 3. Perfis e permissões

Enum `role`: `admin_central` · `analista_arini` · `imobiliaria` · `corretor` · `engenheiro` · `proprietario` · `comprador`.

| Perfil | Pode | Não pode |
|---|---|---|
| **admin_central** (Arini) | Tudo: aprovar, publicar, intermediar, comissões, auditoria, configurações | — |
| **analista_arini** | Analisar cadastros/imóveis, operar funil, agendar visitas | Configurações, comissões, excluir |
| **imobiliaria / corretor** | Cadastrar imóveis próprios, ver seus imóveis/leads encaminhados, registrar atendimento/visita/proposta dos seus | Ver imóveis/leads de outros parceiros; publicar sem aprovação |
| **engenheiro** | Perfil profissional; anexar laudos/plantas quando convidado a um imóvel | Acesso comercial |
| **proprietario** | Cadastrar seus imóveis, acompanhar status e oportunidades dos seus | Ver dados de outros |
| **comprador** | Navegar, favoritar, demonstrar interesse, acompanhar suas oportunidades | Área administrativa |

**Regra de ouro (herdada do CRM): quem manda é a RLS, não a tela.** Toda tabela nasce com policy explícita por perfil; papel visual sem policy não existe. Leads e oportunidades: parceiro só enxerga o que a Arini encaminhou para ele (`responsavel_partner_id = seu id`).

---

## 4. Modelo de dados (Postgres + PostGIS)

Migrations numeradas (`0001…`) como no CRM. Campos de sistema onipresentes: `id uuid pk`, `created_at`, `updated_at`, `created_by`.

### 4.1 Identidade e parceiros

- **`profiles`** — espelho do `auth.users`: `role`, `nome`, `cpf_cnpj`, `telefone`, `avatar_url`, `ativo`.
- **`partners`** — imobiliária/corretor/engenheiro: `profile_id`, `tipo`, `razao_social`, `creci` / `crea`, `cidade_base`, `status` (`solicitado → em_analise → aprovado|pendente|reprovado`, depois `ativo|suspenso|inativo`), `motivo_pendencia`, `aceite_termos_at`.
- **`partner_documents`** — docs do parceiro: `partner_id`, `tipo`, `storage_path`, `verificado`.
- **`owners`** — proprietário: `profile_id`, dados de contato, `status` (mesma máquina do parceiro), `aceite_termos_at`.

### 4.2 Território

- **`regions`** — região (piloto = 1 linha; estrutura pronta para franquias §30): `nome`, `ativa`.
- **`municipalities`** — `region_id`, `nome`, `uf`, `codigo_ibge`, `geom geometry(MultiPolygon,4326)`, `sede geometry(Point)`, `ativo`. Populada via API de malhas do IBGE.
- **`cartography_layers`** — cartografia urbana: `municipality_id`, `nome`, `tipo` (`raster|vector`), `source_path` (arquivo original no R2), `tiles_path` (pasta {z}/{x}/{y}), `bounds`, `min_zoom`, `max_zoom`, `opacidade_padrao`, `status` (`enviado → processando → pronto|erro`).

### 4.3 Imóveis

- **`properties`** — núcleo: `codigo` (**`ARINI-MAP-000001`**, gerado por sequence — §29), `tipo` (`urbano|rural`), `owner_id`, `partner_id` (nullable — imóvel de parceiro §16), `municipality_id`, `titulo`, `descricao`, `valor`, `area_declarada`, `caracteristicas jsonb` (quartos, benfeitorias, solo, outorga…), `condicoes_venda text`, `aceita_permuta/financiamento bool`, `exclusividade bool`, `status` (§27), `motivo_correcao`, `published_at`, `sold_at`.
- **`property_geometries`** — `property_id`, `geom geometry(Geometry,4326)` (polígono rural, lote urbano ou ponto), `centroid`, `area_m2` (ST_Area geography), `perimeter_m`, `fonte` (`kml|kmz|desenho|ponto|dwg`), `arquivo_original_path`.
- **`property_media`** — fotos/vídeos: `tipo`, `storage_path`, `ordem`, `capa bool`.
- **`property_documents`** — matrícula, CAR, ITR, autorização de venda: `tipo`, `storage_path`, `verificado bool`.
- **`property_authorizations`** — autorização/exclusividade formalizada: `tipo` (`autorizacao|exclusividade`), `documento_path`, `validade`, `aceite_at`.
- **`property_pois`** — POIs vinculados ao imóvel: `poi_id`, `distancia_m` (linha reta), `distancia_rota_m` (OSRM, nullable), `destaque bool`.
- **`presentations`** — apresentação 3D e vídeo: `property_id`, `tipo` (`tour3d|video`), `params jsonb` (roteiro da câmera, POIs incluídos), `status` (`pendente → processando → pronto|erro`), `output_path`, `duracao_s`.

### 4.4 Dados geográficos de apoio

- **`pois`** — cache do Overpass: `categoria` (`combustivel|farmacia|supermercado|hospital|escola|centro|acesso_rodovia|outro`), `nome`, `geom Point`, `municipality_id`, `fonte`, `fetched_at` (TTL de atualização).
- **`highways`** (opcional, F2) — trechos de rodovia da região para "distância até o acesso".

### 4.5 Funil comercial (§13–§23)

- **`leads`** — `property_id`, `nome`, `telefone`, `email`, `mensagem`, `origem` (`mapa|pagina|compartilhamento|campanha`), `canal`, `utm jsonb`, `status` (`novo → em_oportunidade | descartado`).
- **`opportunities`** — ID único da operação: `codigo` (`OP-000001`), `lead_id`, `property_id`, `comprador_profile_id` (nullable), `etapa` (funil §18), `responsavel_tipo` (`arini|parceiro|proprietario`), `responsavel_partner_id`, `partner_comprador_id` (Parceiro B — §17), `qualificacao jsonb`, `motivo_perda`.
- **`opportunity_events`** — timeline de atendimento: `tipo` (`contato|qualificacao|encaminhamento|anotacao|mudanca_etapa`), `descricao`, `autor`.
- **`visits`** — `opportunity_id`, `data_hora`, `responsavel`, `status` (`agendada → realizada|remarcada|nao_compareceu`), `feedback`.
- **`proposals`** — propostas E contrapropostas na mesma tabela: `opportunity_id`, `numero_rodada`, `autor_lado` (`comprador|vendedor`), `valor`, `entrada`, `parcelamento jsonb`, `prazo`, `condicoes`, `observacoes`, `status` (`enviada → aceita|contraproposta|recusada`).
- **`contracts`** — `opportunity_id`, `documento_path`, `status` (`em_elaboracao → assinado → registrado`), `assinado_at`.
- **`sales`** — `opportunity_id`, `property_id`, `valor_final`, `data_venda`, `participantes jsonb` (proprietário, parceiro A, parceiro B, comprador — §17/§23).
- **`commissions`** — `sale_id`, `base_calculo`, `percentual` (default **1.00**), `valor`, `regra_contratual text`, `status` (`registrada → cobrada → paga → conciliada`), `pago_em`.

### 4.6 Receita e operação

- **`subscriptions`** — mensalidade por imóvel publicado (§24): `property_id`, `valor_mensal`, `dia_vencimento`, `status` (`ativa|pendente|inadimplente|isenta|cancelada`).
- **`invoices`** — `subscription_id`, `competencia`, `valor`, `status` (`aberta|paga|vencida`), `pago_em`, `gateway_id` (Asaas, F3).
- **`jobs`** — fila: `tipo` (`tile_raster|render_video|screenshot_og|fetch_pois|process_kml`), `payload jsonb`, `status`, `tentativas`, `erro`.
- **`audit_log`** (§25) — **append-only, sem policy de UPDATE/DELETE**: `user_id`, `acao`, `entidade`, `entidade_id`, `property_id`, `opportunity_id`, `dados_antes jsonb`, `dados_depois jsonb`, `created_at`. Escrita via rotas de API/service role (nunca do browser — lição do CRM).
- **`settings`** — chave/valor: percentual padrão, valor mensalidade, categorias de POI ativas, região piloto.

### 4.7 Máquinas de estado

**Imóvel (§27):**
`rascunho → pendente → em_analise → (correcao ⇄ em_analise) → aprovado → publicado → em_negociacao ⇄ publicado → vendido → historico`
Alternativos a partir de qualquer estado pós-análise: `suspenso` (ex.: mensalidade §24), `inativo`, `reprovado`. Transições válidas ficam em função SQL `fn_property_transition` — estado inválido é erro de banco, não bug de tela.

**Parceiro/Proprietário (§28):** `solicitado → em_analise → aprovado|pendente|reprovado`; depois `ativo ⇄ suspenso → inativo`.

**Oportunidade (§18):** `novo_lead → primeiro_contato → qualificacao → em_atendimento → visita_agendada → visitou → proposta_enviada → contraproposta ⇄ negociacao → aceite → contrato → fechado → pos_venda`; saída lateral `perdido` (com motivo) em qualquer etapa.

---

## 5. Módulo geoespacial (o diferencial do produto)

### 5.1 Mapa regional (porta de entrada)

- MapLibre GL, estilos: **Ruas** (OSM) e **Satélite** (Esri World Imagery) com toggle.
- Camadas: limites municipais (IBGE), cartografia urbana (overlay raster por município), polígonos/pontos de imóveis.
- **Cor por status** (pedido explícito da reunião): publicado = verde Arini; em negociação = âmbar; vendido = cinza (histórico opcional no mapa). **Legenda fixa** ("sumário de cores") no canto do mapa.
- Filtros sobre o mapa: tipo (urbano/rural), município, faixa de preço, faixa de área. Filtro = query PostGIS por viewport (`ST_Intersects` com o bbox da tela) — só carrega o que está visível.
- Clique no polígono → card resumo → página do imóvel.
- **Escala futura**: com centenas de imóveis, GeoJSON por viewport basta; se a base crescer a milhares, migrar a camada para vector tiles direto do PostGIS (`ST_AsMVT` ou tile server martin) — troca de fonte no MapLibre, sem refactor de dados.

### 5.2 Cartografia urbana (§5)

Confirmado na reunião: o cliente **entrega imagem georreferenciada** da cidade ("você tira o fundo e joga em cima do mapa; alinhou o centro de referência, o resto bate").

Pipeline (worker):
1. Admin sobe o arquivo em `admin/cartografia` (GeoTIFF ideal; ou PNG/JPG + pontos de controle/world file).
2. Job `tile_raster`: GDAL — `gdalwarp` para EPSG:3857 → fundo branco vira alfa (`nearblack`/threshold para "deixar só as riscas") → `gdal2tiles` gera pirâmide {z}/{x}/{y}.png → upload para R2.
3. `cartography_layers.status = pronto`; o mapa adiciona a camada raster com opacidade ajustável.
4. Tela de **ajuste fino por pontos de controle**: o admin marca **2 pontos** (um na imagem, o correspondente no satélite) e o sistema resolve a transformação afim (translação + escala + rotação) — só deslocar (offset) não basta quando a imagem vem sem world file. Com GeoTIFF/world file válido, o passo é pulado.

**DWG/CAD**: DWG é formato proprietário; conversão confiável exige ODA File Converter (DWG→DXF) + ogr2ogr (DXF→GeoJSON) e um DWG bem georreferenciado — raramente o caso. Decisão: **aceitar o upload do DWG como documento do imóvel desde o F0** (fica arquivado e atende o item 5 do teste §32), e converter para vetor web **só na F3, se os arquivos reais do cliente justificarem**. O caminho raster cobre a necessidade visual imediata.

### 5.3 Cartografia rural (§6)

1. Upload KML/KMZ na tela de cadastro (ou **desenho manual do polígono** direto no mapa — terra-draw; o concorrente faz assim e é o fallback perfeito quando o proprietário não tem KML).
2. Parse em JS puro na API (KMZ = zip → JSZip; KML → GeoJSON via @tmcw/togeojson). Sem worker.
3. Validação/reparo: turf (`kinks`, `rewind`, `cleanCoords`); polígono inválido → mensagem clara na tela.
4. Grava em `property_geometries`; PostGIS calcula `area_m2` (ST_Area::geography), `perimeter_m`, `centroid`; compara com `area_declarada` e avisa divergência > 10% (insumo do checklist de aprovação).
5. Preview imediato no mapa dentro do próprio formulário.

### 5.4 Motor geoespacial (§7)

Ao salvar geometria (e sob demanda), o sistema materializa em `property_pois` + `properties.caracteristicas`:

- **Município**: `ST_Contains(municipalities.geom, centroid)`.
- **Cidades próximas**: distância do centroid às sedes municipais (3 mais próximas + a própria).
- **POIs** (§9): consulta local por raio (5–30 km conforme urbano/rural) na tabela `pois` — populada por **import do extract OSM regional** (Geofabrik + osm2pgsql, job mensal de refresh). `ST_DWithin` + distância em linha reta na hora; `distancia_rota_m` preenchida depois pelo OSRM self-host (F2).
- **Acessos/rodovias**: mesmas tabelas do extract (`highway=motorway|trunk|primary`) — distância até o acesso mais próximo, tudo em SQL.
- **Zero dependência externa em runtime**: IBGE/Geofabrik só são tocados em jobs de import/refresh, nunca na renderização de página.

### 5.5 Apresentação 3D (§8)

Página `/imovel/[codigo]/tour`:
- MapLibre com `raster-dem` (Terrarium/AWS — gratuito) + `terrain` + satélite Esri + polígono do imóvel extrudado/contornado em dourado + marcadores de POIs.
- **Roteiro de câmera automático** gerado dos dados: (1) zoom Brasil→região, (2) órbita sobre o imóvel (bearing animado), (3) pan até a cidade sede com rótulo de distância, (4) sobrevoo dos 3–5 POIs em destaque, (5) retorno com card final (área, preço, código).
- Usuário pode interromper e navegar livre (drag = girar, scroll = zoom) — o requisito "interagir com o mapa/imóvel".

### 5.6 Vídeo automático (§9)

- O vídeo **é a gravação do mesmo roteiro 3D**: job `render_video` → Puppeteer abre `/tour?record=1` (1080×1920 vertical p/ WhatsApp/Reels + 1920×1080 horizontal) → captura frames → ffmpeg monta MP4 (com trilha e logo da Arini) → R2 → `presentations.output_path`.
- **Detalhe técnico que decide o sucesso**: headless não tem GPU — o Chromium roda WebGL via **SwiftShader** (`--use-angle=swiftshader`), que renderiza MapLibre por CPU. Um vídeo de ~40 s leva alguns minutos para renderizar; por isso é job assíncrono, 1 por vez, e o frame-by-frame usa clock virtual (captura determinística, não gravação em tempo real).
- Disparado automaticamente na **aprovação** do imóvel; regenerável manualmente no admin.
- Botão **Compartilhar** na página do imóvel: link curto + vídeo baixável + OG image (screenshot do mapa gerada pelo mesmo worker).

---

## 6. Fluxos funcionais (mapeamento 1:1 com a especificação)

| § da spec | Fluxo | Onde vive |
|---|---|---|
| 1 | Entrada/identificação de perfil | Landing pública com 6 portas; cadastro/login Supabase Auth; redirect por `role` |
| 2 | Cadastro de parceiros | `/cadastro/parceiro` (wizard: perfil → dados → docs → registros → termos) → `admin/parceiros` (aprovar/pendente/reprovar com motivo) |
| 3 | Cadastro do proprietário | `/cadastro/proprietario` (mesmo padrão) → `admin/proprietarios` |
| 4 | Cadastro do imóvel | `/parceiro/imoveis/novo` e `/proprietario/imoveis/novo` — wizard: tipo → dados → localização (mapa) → geometria (KML/desenho) → fotos/vídeos → docs → condições → exclusividade → aceites → enviar |
| 5–6 | Cartografia | §5.2 e §5.3 acima |
| 7 | Motor geoespacial | §5.4 — automático ao salvar geometria |
| 8–9 | 3D + vídeo | §5.5 e §5.6 — automático na aprovação |
| 10 | Aprovação Arini | `admin/imoveis/[id]/analise`: checklist persistido item a item (dados, localização, cartografia, área, fotos, vídeos, docs, condições, autorizações, aceites) → decisão (aprovar/correção/pendente/reprovar) com observação → audit |
| 11 | Publicação | Ação "Publicar": status→`publicado`, cria `subscription`, dispara vídeo/OG, página `/imovel/ARINI-MAP-000123` no ar (mapa, 3D, vídeo, fotos, POIs, botão interesse) |
| 12–13 | Comprador → lead | Mapa → filtros → página → "Tenho interesse" (nome, telefone, e-mail, mensagem) → `leads` + `opportunities` (etapa `novo_lead`) → **e-mail imediato à Arini via Resend desde a F0** (lead que ninguém fica sabendo é o sistema falhando no momento mais importante); WhatsApp via Evolution já provisionada, na F3 |
| 14 | Central de intermediação | `admin/oportunidades`: fila de leads novos → qualificar (form estruturado) → **encaminhar** (proprietário, parceiro A, outro) → Arini segue vendo tudo |
| 15–17 | Atendimento (proprietário / parceiro / A+B) | Mesmo funil; muda o `responsavel_*`. Caso §17: `partner_comprador_id` registra o Parceiro B; painel mostra os dois lados; participantes gravados na venda |
| 18 | Funil | Kanban `admin/funil` (padrão do AgendaKanban do CRM) + visão lista; parceiro vê só as suas |
| 19 | Visita | Agendar/registrar em `visits`; não realizada → remarcar/follow-up/perdido |
| 20–21 | Proposta/negociação | Rodadas em `proposals`; timeline mostra proposta ↔ contraproposta; aceite → contrato |
| 22 | Contrato | Upload do documento, marcação de assinaturas, registro da operação |
| 23 | Venda | Wizard de fechamento: valor final → participantes → comissão calculada (1%, editável com regra contratual) → imóvel `vendido` → sai da oferta → histórico preservado |
| 24 | Receita | `subscriptions/invoices` (F1 controle manual: pago/pendente/inadimplente com regra de suspensão; F3 Asaas automatiza) + `commissions` |
| 25 | Auditoria | Toda mutação relevante passa por rota de API que grava `audit_log`; painel `admin/auditoria` com filtros (usuário, imóvel, oportunidade, ação, período) |
| 26 | Dashboard | `admin`: mapa regional com tudo, contadores (pendentes, publicados, leads, visitas, propostas, vendas, mensalidades, comissões), atalhos |
| 29 | ID único | `ARINI-MAP-######` no imóvel + `OP-######` na oportunidade; página do imóvel e da oportunidade agregam TUDO pelo id |
| 30 | Regional | `regions` desde a migration 0001; todo dado territorial pende de `region_id` → ligar Região 02 é INSERT, não refactor |

---

## 7. Estrutura do projeto

```
arini-maps/
├── src/
│   ├── app/
│   │   ├── (public)/                # mapa, marketplace, página do imóvel, cadastros
│   │   │   ├── page.tsx             # mapa regional (home)
│   │   │   ├── imoveis/             # listagem com filtros
│   │   │   ├── imovel/[codigo]/     # página do imóvel + /tour (3D)
│   │   │   └── cadastro/            # portas: comprador, proprietário, parceiro
│   │   ├── admin/                   # painel Arini (dashboard, aprovações, funil,
│   │   │                            #  cartografia, comissões, mensalidades, auditoria)
│   │   ├── parceiro/                # portal imobiliária/corretor/engenheiro
│   │   ├── proprietario/            # portal do proprietário
│   │   └── api/                     # leads, geo (kml, pois), jobs, share, webhooks
│   ├── components/
│   │   ├── map/                     # MapView, camadas, legenda, draw, filtros
│   │   ├── tour/                    # roteiro de câmera 3D
│   │   └── crm/                     # kanban, timeline, propostas
│   ├── lib/
│   │   ├── geo/                     # kml.ts, turf helpers, postgis.ts, pois.ts, ibge.ts
│   │   ├── map/                     # estilos maplibre, cores por status
│   │   ├── audit.ts · auth.ts · permissions.ts · upload.ts (R2)
│   │   └── funil.ts                 # máquina de estados da oportunidade
│   └── middleware.ts                # split por hostname (padrão do CRM) se precisar
├── supabase/migrations/             # 0001…, com PostGIS habilitado na 0001
├── worker/                          # Dockerfile: node + gdal + chromium + ffmpeg
│   ├── jobs/tileRaster.ts · renderVideo.ts · screenshot.ts · fetchPois.ts
│   └── index.ts                     # polling da tabela jobs
└── deploy/                          # compose do worker, notas Dokploy
```

Domínio sugerido: `arinimaps.com.br` (ou `maps.arininegociosimobiliarios.com.br` para começar sem comprar domínio — decisão do Carlos).

---

## 8. Fases de entrega

### F0 — Fundação + demo navegável (21→27/08, entrega quarta)
Setup (repo, Supabase novo com PostGIS, Dokploy, R2) · mapa regional MapLibre (ruas + satélite + municípios IBGE) · auth com perfis · cadastro de imóvel **rural** com KML/KMZ **e desenho manual** + urbano por ponto/lote desenhado · cálculo automático de área/perímetro · aprovação simples no admin (aprovar/correção/reprovar) · publicação com cor por status + legenda · página do imóvel (fotos, dados, mapa) · "Tenho interesse" → lead → fila no admin **+ e-mail imediato via Resend** · seed com 2–3 imóveis de exemplo da região.
**Demo de quarta mostra a espinha dorsal inteira: mapa → imóvel → aprovação → publicação → interesse → lead.**

### F1 — Fluxo comercial completo (semanas 2–3)
Wizards completos de parceiro/proprietário com docs e termos · aprovação com checklist persistido · funil Kanban completo (§18) com qualificação, encaminhamento, visitas, propostas/contrapropostas, contrato, venda · comissão 1% · mensalidade com controle manual e regra de suspensão · auditoria completa + painel · dashboard admin · portais parceiro/proprietário.

### F2 — Camada "uau" (semanas 3–5, em paralelo parcial com F1)
Pipeline de cartografia urbana raster (GDAL→tiles→overlay+pontos de controle) · import do extract OSM regional (POIs/rodovias no PostGIS) + OSRM self-host · apresentação 3D com roteiro de câmera · vídeo automático (worker) · compartilhamento (link curto, OG image, vídeo baixável) · SEO das páginas · troca do satélite para o provedor licenciado (MapTiler/Mapbox).

### F3 — Receita automática + expansão (semanas 5–8)
Asaas (mensalidade recorrente + cobrança de comissão) · relatórios (funil, conversão, receita) · notificações (e-mail/WhatsApp via infra do atendimento) · DWG vetorial **se os arquivos reais justificarem** · hardening multi-região (tela de gestão de regiões) · pós-venda estruturado.

**Esforço total estimado: 6–8 semanas** para F0–F3 completos, com F0+F1 (sistema operável de ponta a ponta) em ~3 semanas.

---

## 9. O que preciso do Carlos (checklist de insumos)

1. **Fluxograma/arquivo de 200 páginas** resumido que ele prometeu enviar (validar contra esta arquitetura).
2. **Cartografia urbana georreferenciada** de 1 cidade para começar — ideal GeoTIFF; senão imagem + o "centro de referência" que ele descreveu.
3. **Lista de municípios da região piloto** (quais cidades entram no mapa de largada).
4. **1 KML/KMZ real de fazenda** para teste (ele tem base rural).
5. **Textos jurídicos**: termos de uso, termo de autorização de venda, termo de exclusividade, regra contratual da comissão (base de cálculo do 1%).
6. **Valor da mensalidade** de permanência e regra de suspensão (quantos dias de atraso).
7. **Categorias de POI** que ele quer destacar (a lista da spec §9 já é o default).
8. **Logo/identidade** (reaproveito verde/dourado do CRM se ele quiser consistência).
9. **Domínio**: comprar `arinimaps.com.br` ou usar subdomínio do site atual.
9b. **Aprovar o custo do satélite em produção** (~US$25/mês MapTiler ou free tier Mapbox) — único custo recorrente de mapa do projeto.
10. **Vídeos de referência** dos concorrentes (ele mostrou na reunião — pedir os links no WhatsApp).

---

## 10. Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| **DWG vetorial** é formato fechado e raramente vem georreferenciado | Raster primeiro (decidido em reunião); DWG arquiva como documento; vetorização só na F3 com arquivo real na mão |
| **Qualidade do georreferenciamento** das imagens do cliente | Tela de ajuste fino (offset) + validação visual sobre satélite antes de ativar a camada |
| **Licença do satélite** — Esri exige uso via tecnologia Esri; OSRM público proíbe produção | Demo com Esri (atribuição); produção com MapTiler/Mapbox (custo previsto no orçamento, ~US$25/mês); rotas via OSRM self-host regional |
| **Dependência de APIs públicas em runtime** | Eliminada por desenho: POIs/rodovias vêm do extract OSM importado no PostGIS; IBGE/Geofabrik só em jobs de import |
| **Render de vídeo pesado na VPS** compartilhada (3,8 GB, roda o CRM + Evolution) | Headless sem GPU = SwiftShader por CPU (minutos por vídeo): job assíncrono, 1 por vez, teto de memória rígido, captura frame a frame com clock virtual; se virar gargalo, VPS dedicada barata |
| **Golpe/fraude em anúncio** (preocupação explícita do Carlos) | Nada publica sem aprovação manual da Arini; checklist de docs; autorização de venda obrigatória; auditoria de tudo |
| **LGPD** — leads têm dados pessoais | Consentimento no formulário de interesse; RLS estrita; dados de lead visíveis só para Arini + responsável encaminhado |
| **Escopo do "3D"** — expectativa de Google Earth fotorrealista | Alinhar na demo: terreno real + satélite + voo de câmera (igual aos vídeos dos concorrentes que ele mostrou). Google 3D Tiles fotorrealista custa por sessão — só se ele topar o custo |
| **Prazo de quarta** | F0 é deliberadamente enxuto e usa só peças que já domino (Next+Supabase+MapLibre); 3D/vídeo NÃO estão na demo |

---

## 11. Mapeamento do teste obrigatório (§32) → fase

| # | Item do teste | Fase |
|---|---|---|
| 1–2 | Criar/aprovar parceiro | F1 (F0 tem versão simplificada) |
| 3 | Criar proprietário | F0 (simples) / F1 (completo) |
| 4 | Cadastrar imóvel | F0 |
| 5 | Inserir DWG | F0 (upload como documento) / F3 (vetorial) |
| 6–8 | KML/KMZ → geometria → mapa | F0 |
| 9–10 | 3D + vídeo/apresentação | F2 |
| 11–13 | Aprovar, publicar, compartilhar | F0 (aprovar/publicar) · F2 (compartilhar rico) |
| 14–17 | Acesso → interesse → lead → Arini | F0 |
| 18–19 | Qualificar, encaminhar | F1 |
| 20–27 | Atendimento → visita → proposta → contraproposta → negociação → contrato → venda | F1 |
| 28 | Comissão 1% conforme regra | F1 |
| 29 | Imóvel → vendido | F1 |
| 30 | Histórico preservado | F0 em diante (audit_log nasce na migration 0001) |

---

## 12. Próximos passos imediatos

1. **Hoje**: enviar orçamento ao Carlos (basear nas fases §8; F0+F1 = núcleo, F2 = diferencial, F3 = receita).
2. Receber o fluxograma dele e os insumos do §9 (mínimo: municípios + 1 KML + 1 cartografia).
3. **Sábado–terça**: executar F0 (setup → mapa → cadastro → aprovação → lead).
4. **Quarta 27/08**: demo navegável + colher ajustes → replanejar F1/F2 com ele.
