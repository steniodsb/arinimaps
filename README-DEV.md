# Arini Maps — guia de desenvolvimento

Arquitetura completa: `../ARQUITETURA.md` (v1.1).

## Rodar

```bash
npm run dev            # http://localhost:3000
node scripts/migrate.mjs   # aplica migrations pendentes (supabase/migrations/)
node scripts/seed.mjs      # idempotente: região, municípios IBGE, usuários, imóveis demo
```

## Contas de teste (senha: a `SEED_USER_PASSWORD` do `.env.local`)

| E-mail | Perfil | Vai para |
|---|---|---|
| admin@arinimaps.com.br | admin_central | /admin |
| proprietario.teste@arinimaps.com.br | proprietário (ativo) | /painel |
| corretor.teste@arinimaps.com.br | corretor (ativo) | /painel |

## 07/10: mapa fluido com tiles vetoriais + home com mapa vivo (migration 0031)

Queixas do Stenio: zoom demorava a acompanhar, mapa pouco fluido, malha sumia ao afastar;
seção "Entre na área de consultas" da home sem vida.

- **Tiles vetoriais (MVT) no banco**: `fn_mvt_car` e `fn_mvt_lotes` (ST_AsMVT sobre colunas
  `geom_3857` pré-projetadas, com gatilho que as mantém em dia). Servidos por
  `src/app/api/tiles/[camada]/[z]/[x]/[y]/route.ts` (`/api/tiles/car/{z}/{x}/{y}.pbf`,
  `/api/tiles/lotes/…`), gzip, cache HTTP de 1 h + cache em memória do processo. O PostgREST
  não devolve bytea cru, então `fn_tile_*` entrega base64 e a rota decodifica. `api/tiles` e
  `api/geo` ficaram fora do `proxy.ts` (cada tile passava pelo refresh de sessão).
- **MapaRegional** deixou de baixar GeoJSON do CAR/lotes a cada movimento: fontes `vector`,
  `source-layer` `car` / `lotes` / `medidas` (as metragens dos lados vêm prontas no tile a partir
  do zoom 17). CAR aparece desde o zoom 7 (de longe só áreas ≥ 200/100/10 ha; aviso na tela);
  lotes a partir do 15. As rotas `/api/geo/car?bbox` e `/api/geo/lotes?bbox` foram removidas.
  Em desenvolvimento, `window.__mapa` expõe o mapa no console.
- **Home**: `src/components/home/VitrineConsultas.tsx` + `src/components/map/MapaVitrine.tsx`
  (mapa não interativo que passeia por 3 cenas — rural/CAR, Iturama/lotes, regional — com
  legenda; pausa fora da tela e respeita `prefers-reduced-motion`); cartões em vidro com ícones SVG.
- Testes: `BASE_URL=… node scripts/testa-tiles.mjs` (CAR de longe, clique no CAR e no lote,
  metragens, cache); `scripts/screenshot-home.mjs` captura a seção.

## 05→06/10: planos por nicho + módulos cartográficos (migrations 0028–0030)

Documentos do Carlos de 05/10 (Fluxograma Mestre e Requisitos cartográficos). Cobertura
item a item em `docs/FLUXOGRAMA-COBERTURA.md`; planos em `docs/PLANOS.md`.

- **Planos por nicho** (0028): `plans`, `profiles.nicho/plan_id/plan_origem/plan_valido_ate`,
  `plan_subscriptions`, `access_attempts`. Registro em `src/lib/planos.ts` (RECURSOS, NICHOS, COTAS);
  trava em `src/lib/planos-servidor.ts` (`conferirRecurso` → 401/403 + tentativa registrada);
  `ator()` devolve `acesso`. Telas: `/planos`, `/admin/planos`, troca de plano por conta em
  `/admin/usuarios`, nicho no cadastro, tentativas em `/admin/seguranca`. O mapa esconde as
  ferramentas que o plano não libera (`Ferramentas.tsx`, `UiMapa.tsx`).
- **Rastreabilidade** (0029): `property_events` (ficha, tour, relatório, documento, mídia, interesse,
  lead, consulta, compartilhamento, revisão), `property_geometry_versions` (gatilho em toda troca da
  divisa; `fn_upsert_geometry` ganhou origem/motivo/responsável; `fn_validar_geometria`),
  `property_data_sources`. Componente `src/components/crm/HistoricoImovel.tsx` na ficha admin e no painel.
- **Solicitações cartográficas** (0029 + 0030): `cartographic_requests` (protocolo `CART-000001`, máquina
  de status, `fn_cart_request_transicao`), `cartographic_request_events`. Rotas em `src/app/api/cartografia`
  e `src/app/api/admin/cartografia/solicitacoes`; telas `/cartografia/solicitar`, `/painel/cartografia`,
  `/admin/cartografia/solicitacoes`. Labels/transições em `src/lib/cartografia/solicitacoes.ts`.
- **Alteração de anúncio publicado** (Fluxograma §9): `property_revisions`; `POST /api/imoveis/[id]/revisao`;
  decisão `alvo: "revisao"` em `/api/admin/decisao`. **Pedido de complemento** (§7): ação `complementar`
  + `properties.pendencia_tipo`.
- Teste de ponta a ponta: `node scripts/testa-planos.mjs` (com `npm run dev`). SQL avulso: `node scripts/sql.mjs "select …"`.

## Sessão noturna 24→25/08: F1+F2+F3 entregues

Tudo do fluxograma do cliente está implementado (38 rotas, migrations 0001–0008 aplicadas):

- **Funil completo**: `/admin/funil` (kanban), `/admin/oportunidades/[id]` (qualificação,
  encaminhamento A/B, timeline, visitas, propostas em rodadas, contrato com upload,
  venda atômica via `fn_registrar_venda` → comissão 1% + imóvel vendido + mensalidade cancelada).
- **Portal do parceiro/proprietário**: `/painel/oportunidades` (RLS decide o que aparece),
  registrar atendimento/visita/proposta; `/painel/imoveis/[id]` com documentos (bucket privado `docs`, URL assinada).
- **Receita**: `/admin/mensalidades` (gerar faturas por competência, marcar paga, inadimplência
  via `fn_marcar_inadimplentes`, cobrança Asaas se houver chave), `/admin/comissoes` (registrada→cobrada→paga→conciliada).
- **POIs reais**: Overpass com cache em `pois` + `fn_vincular_pois` (3 por categoria) — dispara
  na publicação; fallback vira job pro worker. GOTCHA: Overpass exige User-Agent (406 sem ele);
  upsert PostgREST não casa com índice único parcial (por isso a 0008 tornou `uq_pois_osm` total);
  PostgREST precisa de `notify pgrst, 'reload schema'` após migration com função nova (o migrate.mjs já faz).
- **Tour 3D**: `/imovel/[codigo]/tour` — terreno Terrarium + satélite + roteiro de câmera em função
  de t (zoom → órbita → cidade → POIs → retorno). `?record=1` expõe `window.__ARINI_TOUR.seek(t)`
  para o worker gravar o vídeo frame a frame (clock determinístico).
- **Worker** (`worker/` + `deploy/worker-compose.yml`): render_video (Puppeteer SwiftShader+ffmpeg),
  tile_raster (GDAL→tiles→storage), screenshot_og, fetch_pois. Polling com `for update skip locked`.
- **Admin**: auditoria com filtros, relatórios (funil/VGV/receita), regiões (adicionar município só
  com código IBGE), configurações, cartografia (upload → job de tiles).
- Compartilhamento (`/i/[codigo]`, WhatsApp, OG image), sitemap/robots.

Testado ponta a ponta com dados reais: OP-000001 percorreu lead → qualificação → visita →
3 rodadas de proposta → aceite → contrato → **venda R$ 3,6 mi → comissão R$ 36.000** (1%),
imóvel `vendido`, funil `fechado`, auditoria completa. POIs reais de Iturama vinculados
automaticamente na publicação (Rodovia MG-255 a 1,2 km etc.).

LIMITAÇÃO DO TESTE NOTURNO: mapas MapLibre não renderizam em aba oculta
(`document.hidden` → sem requestAnimationFrame) — mapa, tour e desenho precisam de
validação visual com a janela aberta. O restante foi verificado por API + banco.

O que falta é SÓ o que depende do Stenio: ver `../PENDENCIAS.md`.

## O que a F0 cobre (entregue)

- Mapa regional (MapLibre, ruas + satélite, limites municipais IBGE, cores por status + legenda, filtro rural/urbano)
- Página pública do imóvel (`/imovel/ARINI-MAP-000001`) com mini-mapa satélite e área medida
- "Tenho interesse" → lead + oportunidade `OP-######` + auditoria (+ e-mail se `RESEND_API_KEY`/`ARINI_NOTIFY_EMAIL` no env)
- Cadastro público por perfil (`/entrar`) — proprietário/parceiro nascem `solicitado` para análise
- Painel do anunciante (`/painel`): meus imóveis + wizard `/painel/novo` (desenhar polígono, marcar ponto ou subir KML/KMZ — parse no navegador; fotos para o Storage)
- Painel Arini (`/admin`): dashboard, fila de análise com checklist automático (inclui divergência área medida × declarada >10%), decisões com máquina de estados no banco, aprovação de cadastros, lista de leads
- Publicar cria a mensalidade (`subscriptions`) automaticamente

## Estrutura de banco

Migrations `0001`–`0005` aplicadas no projeto Supabase `qtpjryvqifcmmabebccf`
(runner próprio em `scripts/migrate.mjs`, registro em `_migrations`).
PostGIS habilitado; RLS em todas as tabelas; `audit_log` append-only (só service role escreve).

## Cartografia do cliente

`../cartografia/` tem os DWG georreferenciados de Limeira do Oeste (4,5 MB),
União de Minas (0,7 MB) e Iturama (18 MB + DXF de 108 MB), formato AC1032
(AutoCAD 2018+). Os três já estão no mapa como camada vetorial
(`cartography_layers`, tipo `vector`, GeoJSON no bucket `media`).

Conversão: DWG → DXF (LibreDWG `dwg2dxf` ou "Salvar como" no AutoCAD) e então

```bash
node --max-old-space-size=8192 scripts/converte-dxf.mjs "../cartografia/ITURAMA GEORREFERENCIADO.dxf" "Iturama" "Planta urbana — Iturama" sirgas 22
```

O script lê o model space **e o conteúdo dos blocos inseridos** (INSERT, com
aninhamento, posição/escala/rotação), discretiza arcos, círculos e bulges de
polilinha, e descarta o que não interessa ao mapa imobiliário: paper space,
textos, hachuras, layers de paisagismo (regex `LAYERS_IGNORAR`) e blocos-símbolo
(pequenos e repetidos — árvores, mesas, etiquetas de lote; ajuste por
`SIMBOLO_MAX_M`/`SIMBOLO_MIN_INSERTS`/`IGNORAR`). `DRY=1` grava o GeoJSON ao lado
do DXF sem subir nada. Datum: Iturama e União de Minas são SIRGAS 2000; Limeira
do Oeste é SAD 69 (65 m de deslocamento). Calibração fina em Admin › Cartografia.

## Próximas fases

F1 funil comercial completo · F2 3D/vídeo/cartografia/POIs · F3 Asaas/expansão — ver `../ARQUITETURA.md` §8.
