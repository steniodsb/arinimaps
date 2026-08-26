# Arini Imóveis Brasil — o que falta (26/08/2026)

> O sistema está construído e o SQL todo aplicado (migrations 0001–0013).
> Rode `npm run dev` em `arini-maps/` e entre com `admin@arinimaps.com.br`.
> Repositório: github.com/steniodsb/arinimaps

---

## 1. Depende só de você (destrava sozinho)

| # | O quê | Onde |
|---|---|---|
| 1 | **Redeploy no Dokploy** — o último commit corrige o build e o mapa | painel Dokploy |
| 2 | **Envs em runtime**: as 6 do Supabase + `NEXT_PUBLIC_SITE_URL` com o domínio real | Dokploy › Environment |
| 3 | **Domínio**: comprar `arinimaps.com.br` ou apontar subdomínio na Cloudflare | — |
| 4 | **Planta de Iturama** (a que estava aberta no seu AutoCAD): Salvar como → DXF e subir | Admin › Cartografia |
| 5 | **Calibrar as plantas** que ficarem tortas (setas do teclado até bater no satélite) | Admin › Cartografia › Calibrar |
| 6 | **Preencher as configurações** (contatos, textos da home, mensalidade, comissão) | Admin › Configurações |
| 7 | **Trocar as senhas** das 3 contas de teste e criar a conta real do Carlos | Admin › Usuários |
| 8 | **Limpar os dados demo** antes de mostrar (Fazenda Boa Vista está "vendida" pelo teste E2E) | Admin › Imóveis |

## 2. Chaves de serviço (cada uma liga um recurso já pronto no código)

| Serviço | Env | O que liga |
|---|---|---|
| Resend | `RESEND_API_KEY`, `RESEND_FROM` | E-mails automáticos: lead novo, imóvel aprovado/publicado/correção, encaminhamento a parceiro |
| Asaas | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Botão "Cobrar via Asaas" + baixa automática do pagamento (webhook em `/api/asaas/webhook`) |
| MapTiler | `NEXT_PUBLIC_MAPTILER_KEY` | Satélite licenciado para uso comercial (hoje usa Esri, que é de demonstração) |

Sem elas o sistema funciona — só esses recursos ficam inativos. O painel de
Configurações mostra o estado de cada uma.

## 3. Worker (vídeo e tiles)

`deploy/worker-compose.yml` está pronto. Sobe como segundo serviço no Dokploy com
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SITE_URL`.
Sem ele: vídeo automático, tiles de imagem georreferenciada e imagem de
compartilhamento ficam pendentes. **Todo o resto funciona sem o worker.**

## 4. Decisões com o Carlos

- Valor da mensalidade do anúncio e dias de tolerância (hoje R$ 0 / 15 dias).
- Textos jurídicos: termos de uso, autorização de venda, exclusividade, regra do 1%.
- Lista final de municípios do piloto (você mesmo adiciona em Admin › Regiões, só com o código IBGE).
- Custo do satélite licenciado (~US$ 25/mês) — único custo recorrente de mapa.
- Orçamento do projeto (recomendação registrada: R$ 7.000 em 3 parcelas + sustentação mensal).

## 5. Consulta Rural — fontes que exigem importação de arquivo

Sondei as 17 fontes do documento técnico em 26/08/2026.

**Funcionando ao vivo no sistema:** ANM/SIGMINE (processos minerários),
FUNAI (terras indígenas), INPE/TerraBrasilis (desmatamento PRODES),
IBGE (municípios) e OpenStreetMap (POIs e acessos).

**Sem consulta pública por polígono** — precisam do arquivo oficial baixado e importado:

| Fonte | Situação |
|---|---|
| CAR / SICAR | Publica o WFS mas sem camadas; os dados saem por download de shapefile por município, com CAPTCHA |
| INCRA / SIGEF | Sem endpoint público estável; baixar a malha certificada |
| IBAMA — embargos | Serviço geográfico fora do ar na sondagem; usar planilha/shapefile de dados abertos |

Quando você conseguir esses arquivos, eu importo para o PostGIS e eles passam a
cruzar com a geometria do imóvel como as demais. Enquanto isso, aparecem no
relatório como "dependem de importação" — nunca como "nada encontrado".

## 6. Validação que só você pode fazer

Abrir e olhar com calma: `/` (landing), `/mapa` (com satélite e plantas),
`/imovel/ARINI-MAP-000002`, o tour 3D, e o painel admin inteiro.
Todas as telas foram verificadas por screenshot, mas seu olho no fluxo real
vale mais que o meu.
