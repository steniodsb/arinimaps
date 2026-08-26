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

`../cartografia/` tem os DWG georreferenciados de Limeira do Oeste (4,5 MB) e
União de Minas (0,7 MB), formato AC1032 (AutoCAD 2018+). Conversão na F2/F3:
ODA File Converter → DXF → ogr2ogr → GeoJSON/raster tiles.

## Próximas fases

F1 funil comercial completo · F2 3D/vídeo/cartografia/POIs · F3 Asaas/expansão — ver `../ARQUITETURA.md` §8.
