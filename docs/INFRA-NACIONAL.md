# Infraestrutura para operação nacional e custo da IA

Recomendação de 08/10/2026. Valores em US$ são de tabela pública dos fornecedores e **devem ser conferidos
na contratação**; R$ com cotação de 5,40. Complementa `DIMENSIONAMENTO.md` (volume de banco e arquivos).

## 1. Onde o sistema pesa

| Peça | O que consome | Como escala |
|---|---|---|
| Páginas e API (Next.js) | CPU da VPS | mais núcleos e mais processos (cluster) |
| Tiles do mapa (CAR e lotes) | CPU do banco (gera o MVT) | cache: memória do processo → CDN → navegador |
| CAR sob demanda | SICAR (serviço público) + gravação no banco | só a 1ª visita a uma área; depois é tile |
| Consulta de área | 16 fontes oficiais externas | tempo das fontes, não da nossa máquina; resultado fica salvo |
| Satélite | **tiles da Esri, cobrados por uso** | é o maior custo variável (ver §3) |
| Assistente de IA | API da Anthropic, cobrada por token | cota por plano (ver §4 e §5) |
| Vídeos e fotos | armazenamento e banda | Cloudflare R2 (sem custo de saída) |

## 2. Recomendação por fase

| | Lançamento | Crescimento | Nacional |
|---|---|---|---|
| Uso estimado | até 5 mil visitas/dia, ~300 simultâneos | até 50 mil/dia, ~2 mil simultâneos | 300 mil+/dia |
| VPS do app | 4 vCPU · 8 GB (São Paulo) | 8 vCPU · 16 GB, 2–4 processos | 2+ VPS atrás de balanceador |
| Banco (Supabase, região São Paulo) | Pro + compute Small (2 GB) | Pro + Medium (4 GB) ou Large (8 GB) | Large/XL + réplica de leitura |
| CDN / proteção | Cloudflare grátis | Cloudflare Pro | Cloudflare Pro/Business |
| Arquivos | Supabase Storage (100 GB no Pro) | + Cloudflare R2 para vídeo | R2 |
| Cache compartilhado | — | Redis (limite por IP e cache entre processos) | Redis gerenciado |
| Monitoramento | Uptime Kuma + Sentry grátis | Sentry pago | idem |
| **Custo fixo aprox./mês** | **US$ 100–130 (≈ R$ 550–700)** | **US$ 300–450 (≈ R$ 1,6–2,4 mil)** | US$ 1–2 mil+ |

Referências: VPS em São Paulo (Vultr, Magalu Cloud ou AWS Lightsail sa-east-1) 4 vCPU/8 GB ≈ US$ 48,
8 vCPU/16 GB ≈ US$ 96. Supabase Pro US$ 25 + compute Small US$ 15 / Medium US$ 60 / Large US$ 110.
Cloudflare Pro US$ 20. Backup com recuperação por ponto no tempo (PITR) do Supabase: +US$ 100, quando houver
operação financeira real no sistema.

**Por que São Paulo:** o usuário está no Brasil; servidor nos EUA/Europa soma 120–250 ms a cada pedido, e o
mapa faz dezenas por movimento.

**O que já está pronto para escalar:** tiles vetoriais com cache em 3 camadas, limite por IP, CAR sob demanda
gravado uma vez só, consultas salvas (não repetem as 16 fontes), páginas sem estado (dá para rodar várias cópias).

**O que fazer ao passar da fase 1:** colocar a Cloudflare na frente com regra de cache para `/api/tiles/*`
(o cabeçalho já permite 1 dia na CDN); trocar o limite por IP em memória por Redis quando houver mais de um
processo; mover vídeos para o R2.

## 3. Satélite — o custo que mais cresce

Esri Location Platform (pesquisado em 08/10/2026), dois modelos de cobrança:
- **por tile:** 2 milhões grátis/mês, depois US$ 0,15 por mil (uma sessão de mapa de ~2 min ≈ 200 tiles);
- **por sessão:** mil grátis/mês, depois US$ 4 por mil; cada sessão = um usuário, tiles ilimitados por até 12 h.

| Sessões de mapa por dia | Por tile | Por sessão |
|---|---|---|
| 300 | grátis | ≈ US$ 32 |
| 1.000 | ≈ US$ 600 | ≈ US$ 116 |
| 5.000 | ≈ US$ 4.200 | ≈ US$ 600 |

Começar por tile (cabe no grátis) e passar para sessão a partir de ~500 sessões/dia. A sessão é documentada
para o estilo `arcgis/imagery` do serviço Basemap Styles com MapLibre; confirmar com a chave se a URL de
imagem que usamos hoje aceita o token de sessão. Alternativas avaliadas: Mapbox (≈ US$ 0,25–1/mil tiles),
Google Map Tiles (US$ 0,60/mil, termos restringem misturar com outro mapa), MapTiler Flex (por sessão, mais
barato, qualidade da imagem no interior de MG não comparada), Azure (preço sob consulta).

## 4. Assistente de IA

### Custo por pergunta (preços conferidos em 08/10/2026)

Pergunta típica: ~8 mil tokens de instruções e ferramentas (em cache), ~5 mil de pergunta, histórico e
resultados de ferramentas, ~600 de resposta.

| Modelo | Entrada | Cache | Saída | Por pergunta |
|---|---|---|---|---|
| **Claude Haiku 5.5 (padrão desde 08/10)** | US$ 0,10/M | US$ 0,01/M | US$ 0,50/M | **≈ US$ 0,001 ≈ R$ 0,005** |
| Claude Sonnet 5.5 | US$ 2/M | US$ 0,10/M | US$ 10/M | ≈ US$ 0,017 ≈ R$ 0,09 |

| Perguntas por dia | Haiku 5.5/mês | Sonnet 5.5/mês |
|---|---|---|
| 1.000 | ≈ R$ 160 | ≈ R$ 2.700 |
| 5.000 | ≈ R$ 800 | ≈ R$ 13.500 |
| 20.000 | ≈ R$ 3.200 | ≈ R$ 54.000 |

Trocar de modelo é só a variável `ARINI_IA_MODELO` (dá para usar Sonnet num plano premium no futuro).

A cota mensal de perguntas por plano (já existe) é o que segura o custo: o plano grátis deve ter poucas
perguntas; os pagos, cota proporcional ao preço. A Central já mostra o custo estimado em R$ por conversa.

### Base que fica "mais inteligente"

O modelo não aprende sozinho entre conversas: quem acumula conhecimento é o **nosso banco**, e o assistente
consulta esse banco a cada pergunta (busca por significado, RAG). Proposta em três camadas:

1. **Consultas territoriais** (`consultas_area`, `consultas_rurais` — já ficam salvas): cada consulta vira um
   resumo indexado (município, CAR, embargos, SIGEF, data). Pergunta sobre uma área já consultada responde
   na hora, sem ir às 16 fontes, sempre com a data do dado.
2. **Inteligência de mercado agregada**: preço por hectare e por m² por município e tipo, a partir dos
   anúncios, propostas e vendas; ocorrências por região (embargos, queimadas, sobreposições). Recalculado
   toda noite; só números agregados, nada que identifique pessoa.
3. **Perguntas sem boa resposta**: o assistente marca quando não soube; a Matriz revisa e publica a resposta
   na base de conhecimento (`kb_artigos`, já existe). Curadoria humana evita que ele "aprenda" erro ou dado
   pessoal (LGPD: conversas de clientes não entram na base compartilhada).

Técnica: extensão `pgvector` no próprio Supabase (sem custo extra) + embeddings da Voyage AI
(≈ US$ 0,02 por milhão de tokens — indexar 100 mil consultas custa menos de US$ 5). Espaço: ~6 KB por
consulta indexada → 100 mil consultas ≈ 600 MB.

**Implementado em 08/10/2026 (migration 0040), sem embeddings** — busca textual do Postgres em português,
sem acento (`unaccent` + `to_tsvector('portuguese')`, índice GIN), que já funciona sem chave nenhuma:

| Camada | Banco | Ferramenta do assistente | Atualização |
|---|---|---|---|
| 1. Consultas territoriais | `ia_consultas_resumo`: um resumo por área do CAR, lote urbano ou imóvel anunciado — município, CAR, o que cada fonte encontrou e a data de cada dado. Nunca guarda quem consultou; área desenhada à mão (`geo:`) fica fora; resumo de imóvel só aparece enquanto o anúncio está na vitrine | `buscar_consultas_anteriores` (município, UF, CAR ou termo: "embargo", "mineração", "queimada"…) — responde sempre com a data | gatilho em `consultas_area` e `consultas_rurais` (falha no resumo nunca derruba a consulta); `fn_ia_resumos_consultas_reconstruir()` refaz tudo |
| 2. Mercado | `ia_mercado_municipio`: por município e tipo, anúncios publicados (venda, sem leilão), mediana e faixa p25–p75 de R$/ha (rural) e R$/m² (urbano), vendas registradas (`sales`) | `inteligencia_mercado` — "quanto vale o hectare em Iturama", com a data do cálculo e o aviso de que é referência de anúncios, não avaliação | `fn_recalcular_inteligencia_mercado()`, job `inteligencia_mercado` do worker uma vez por dia (o projeto agenda rotinas pela fila `jobs`, não por pg_cron). Grupo com **menos de 3** fica sem número gravado no banco |
| 3. Lacunas | `ia_lacunas`: pergunta (sem CPF/CNPJ/telefone/e-mail), ocorrências agrupadas pela forma normalizada, situação pendente/respondida/descartada, artigo ligado | `registrar_lacuna` — o modelo chama quando as ferramentas não trazem a resposta (instrução no prompt de sistema) | Marketing › Conhecimento › "Perguntas sem resposta": Responder abre o editor com a pergunta como título; publicar o artigo marca como respondida |

Primeiro cálculo (08/10/2026), Iturama/MG: rural, 19 anúncios, mediana ≈ R$ 38 mil/ha (faixa R$ 34,6 mil a
43,1 mil); urbano, 20 anúncios, mediana ≈ R$ 703/m² (faixa R$ 577 a 779); 1 venda rural registrada (abaixo do
mínimo, sem número).

**Evolução quando houver chave da Voyage:** coluna `vector` (pgvector) em `ia_consultas_resumo` e
`kb_artigos`, embeddings gerados no gatilho/worker e busca híbrida (texto + significado). As tabelas e
ferramentas acima ficam iguais; muda só a função de busca.

## 5. Cenário de acessos simultâneos

"Simultâneos" = pessoas ativas no mesmo minuto, no pico do dia. Mistura suposta: 60% no mapa, 10% no
assistente, 5% rodando consulta de área, 25% navegando páginas.

**Medido em 08/10:** o banco gera um tile do CAR em 1 a 4 ms (zoom 12–13) e até 40 ms no zoom 10 na região
mais densa; tile médio de 4 a 76 KB. O satélite não passa pelo nosso servidor (vai direto da Esri).

| Carga por pessoa | Pedidos |
|---|---|
| No mapa | ~1 movimento a cada 10 s × ~12 tiles do CAR/lotes ≈ 1,2 pedido/s ao nosso servidor |
| No assistente | ~1 pergunta/min, 2–3 chamadas à Anthropic, resposta em 5–15 s |
| Consulta de área | ~1 a cada 3 min, 16 fontes oficiais em paralelo, 10–40 s |
| Navegando | ~1 página a cada 20 s |

| | 100 simultâneos | 500 simultâneos | 2.000 simultâneos |
|---|---|---|---|
| Visitas/dia (aprox.) | 3–5 mil | 20–30 mil | 100 mil+ |
| Tiles no servidor | ~70/s | ~360/s | ~1.400/s |
| Tiles que chegam ao banco | ~20/s (cache em memória) | ~25/s (Cloudflare + memória) | ~30/s, ou zero com base pré-gerada (ver abaixo) |
| Perguntas à IA | ~10/min | ~50/min | ~200/min |
| Consultas de área | ~2/min (~30 chamadas a órgãos/min) | ~8/min (~130/min) | ~33/min (~530/min) |
| VPS | 4 vCPU · 8 GB | 8 vCPU · 16 GB, 4 processos | 2× 8 vCPU + balanceador |
| Banco | Pro + Small | Pro + Medium | Pro + Large + réplica |
| Infra fixa/mês | ≈ US$ 110 | ≈ US$ 350 | ≈ US$ 1.200 |
| Satélite (Esri por sessão)/mês | ≈ US$ 100 | ≈ US$ 540 | ≈ US$ 2.150 |
| IA (Haiku 5.5)/mês | ≈ US$ 35 | ≈ US$ 160 | ≈ US$ 650 |
| **Total/mês** | **≈ US$ 250 (R$ 1,4 mil)** | **≈ US$ 1.050 (R$ 5,7 mil)** | **≈ US$ 4.000 (R$ 22 mil)** |

Satélite: sessões por dia ≈ 15 × pessoas no mapa no pico; US$ 4 por mil sessões após mil grátis. IA:
perguntas por dia ≈ 120 × pessoas no assistente no pico.

### Onde trava primeiro e o que fazer antes

1. **Consultas de área (as fontes do governo, não o nosso servidor).** Com 25+ consultas ao mesmo tempo
   são centenas de pedidos por minuto ao SICAR, INCRA, IBAMA; esses serviços caem ou bloqueiam. Fazer:
   **fila** com limite de pedidos simultâneos por órgão, reaproveitar consulta recente da mesma área (já
   existe) e mostrar "sua consulta está na fila (posição 3)". *Implementado em 08/10:* no máximo 4 pedidos
   simultâneos por servidor de órgão (`ARINI_FONTES_MAX_SIMULTANEOS`), espera de até 25 s
   (`ARINI_FONTES_ESPERA_MS`) — quem não ganha vaga sai como "indisponível agora", nunca "nada encontrado";
   no máximo 8 consultas de área rodando ao mesmo tempo (`ARINI_CONSULTAS_MAX_SIMULTANEAS`), até 40
   esperando (`ARINI_CONSULTAS_FILA_MAX`) por até 30 s (`ARINI_CONSULTAS_ESPERA_MS`); passou disso, 503
   `consulta_na_fila` com a posição e a tela tenta de novo sozinha, sem gastar cota. Código:
   `src/lib/seguranca/fila.ts`, `src/lib/rural/adaptadores.ts` (`pedir`) e `src/lib/geo/consultaArea.ts`.
2. **Assistente: limite da Anthropic, não custo.** Contas novas começam com poucas chamadas por minuto; o
   nível sobe com depósito/uso no console. Fazer: subir o nível antes do lançamento e limitar conversas
   simultâneas no servidor, com mensagem "assistente ocupado, tente em instantes". *Implementado em 08/10:*
   até 20 conversas respondendo ao mesmo tempo por processo (`ARINI_IA_MAX_SIMULTANEAS`); acima disso 503
   `ia_ocupada` e o chat devolve a pergunta à caixa. Cota mensal por plano (`mensagens_ia_mes`, migration
   0039): básica 20, anunciante 50, profissional 300, parceiro 500, organização e franquia 2.000.
3. **Tiles com 500+ simultâneos.** Fazer: Cloudflare com cache de `/api/tiles/*` (cabeçalhos já prontos).
   Com 2.000+: gerar a base nacional do CAR como arquivo de tiles (PMTiles) toda semana e servir pelo
   Cloudflare R2 — o banco deixa de gerar tile.
4. **Limite por IP em memória** conta por processo; com mais de um processo, mover para Redis.
5. **Satélite** passa a ser o maior custo a partir de ~500 simultâneos: abrir a sessão da Esri só quando a
   pessoa aproxima (zoom ≥ 13); de longe, imagem aberta (Sentinel-2). Quem só olha a região não gasta sessão.
6. **Teste de carga** simulando 100 e 500 simultâneos no ambiente de homologação, antes de abrir ao
   público. Script pronto, em Node puro: `scripts/teste-carga.mjs`. Cada pessoa simulada mistura tiles do
   CAR em volta de Iturama (zoom 10–13, 12 por movimento), `/api/geo/imoveis` e as páginas `/`, `/imoveis`
   e `/mapa`, com pausa curta entre ações; entra com a senha de acesso (`SITE_SENHA` do `.env.local`) e
   imprime req/s, p50/p95/p99 por tipo, status e taxa de erro.

   ```bash
   # validação rápida contra o servidor local
   node scripts/teste-carga.mjs
   # homologação, 100 e depois 500 pessoas por 2 minutos
   BASE_URL=https://homolog.ariniimoveisbrasil.com.br USUARIOS=100 DURACAO_S=120 node scripts/teste-carga.mjs
   BASE_URL=https://homolog.ariniimoveisbrasil.com.br USUARIOS=500 DURACAO_S=120 node scripts/teste-carga.mjs
   ```

   Outras variáveis: `PAUSA_MS` (pausa máxima entre ações, padrão 1500), `RAMPA_S` (tempo para todos
   entrarem, padrão 3) e `SIMULAR_IPS` (padrão 1: cada pessoa manda um `X-Forwarded-For` próprio para o
   limite por IP valer por pessoa; use 0 se o proxy da homologação sobrescrever o cabeçalho — aí todo o
   teste conta como um IP e esbarra no limite de 3.000 tiles/5 min). Rodar de uma máquina FORA da VPS, e
   contra `next build && next start` ou a homologação: em `next dev` os tempos não valem (compila sob
   demanda). Não cobre consulta de área nem assistente de propósito — bateriam nos órgãos e na Anthropic.

## 6. Decisões para o Carlos

1. Fase de partida (recomendado: lançamento) e fornecedor da VPS em São Paulo.
2. Satélite híbrido (aberto de longe, Esri de perto) — recomendado.
3. Cota de perguntas por plano (modelo: Haiku 5.5, decidido em 08/10 pelo custo).
4. Aprovar a base de inteligência em três camadas (§4) — implementação estimada em 1 a 2 semanas.
