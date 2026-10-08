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
| Assistente de IA | API da Anthropic, cobrada por token | cota por plano (ver §4) |
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

Esri Location Platform: 2 milhões de tiles/mês grátis, depois US$ 0,15 por mil.
Uma sessão de mapa de ~2 minutos pede de 150 a 300 tiles (estimativa: 200).

| Sessões de mapa por dia | Tiles/mês | Custo/mês |
|---|---|---|
| 300 | 1,8 milhão | grátis |
| 1.000 | 6 milhões | ≈ US$ 600 (R$ 3,2 mil) |
| 5.000 | 30 milhões | ≈ US$ 4.200 (R$ 23 mil) |

**Recomendação:** usar imagem aberta (Sentinel-2 da EOX, já no sistema, licença livre, 10 m) quando o mapa
está afastado (zoom < 13, visão regional) e a Esri só de perto, onde a resolução importa. Isso corta algo
como 60–70% dos tiles pagos. Medir no painel da Esri no 1º mês antes de decidir.

## 4. Assistente de IA

### Custo por pergunta (modelo padrão `claude-sonnet-5-5`, tabela de set/2026 — conferir)

| Parte | Tokens | US$ |
|---|---|---|
| Instruções e ferramentas (em cache) | ~8 mil a US$ 0,20/M | 0,0016 |
| Pergunta, histórico e resultados das ferramentas | ~5 mil a US$ 2/M | 0,0100 |
| Resposta | ~600 a US$ 10/M | 0,0060 |
| **Total** | | **≈ US$ 0,018 ≈ R$ 0,10** |

Com o `claude-haiku-4-5` (mais simples, metade do preço) ≈ R$ 0,05.

| Perguntas por dia | Sonnet/mês | Haiku/mês |
|---|---|---|
| 200 | ≈ R$ 600 | ≈ R$ 300 |
| 1.000 | ≈ R$ 3.000 | ≈ R$ 1.500 |
| 5.000 | ≈ R$ 15.000 | ≈ R$ 7.500 |

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

## 5. Decisões para o Carlos

1. Fase de partida (recomendado: lançamento) e fornecedor da VPS em São Paulo.
2. Satélite híbrido (aberto de longe, Esri de perto) — recomendado.
3. Modelo da IA (Sonnet para qualidade, Haiku para custo) e cota de perguntas por plano.
4. Aprovar a base de inteligência em três camadas (§4) — implementação estimada em 1 a 2 semanas.
