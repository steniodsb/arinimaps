# Arini Imóveis Brasil — o que falta (17/09/2026)

> O sistema está construído e o SQL todo aplicado (migrations 0001–0017).
> Todas as telas — site, mapa, painel do cliente e Central Arini — já estão no
> design escuro dos mockups, no desktop e no celular. Conta nova é criada por
> **CPF** (com e-mail para rastreio).
> Rode `npm run dev` em `arini-maps/` e entre com `admin@arinimaps.com.br`.
> Repositório: github.com/steniodsb/arinimaps

---

## 0. Mapa urbano — o que foi medido e corrigido em 17/09/2026

Cinco queixas, cada uma virou número antes de virar conserto.

| Queixa | O que estava acontecendo | Como está agora |
|---|---|---|
| **Calibração não salva** | `/api/geo/cartografia` servia `max-age=60`, e a tela de calibração lia dessa mesma rota. Salvar → fechar → reabrir dentro de 1 min trazia os valores **antigos** do cache; o ajuste seguinte gravava o valor velho por cima. | A lista do admin lê com `?fresco=1` + `no-store`. O aviso de sucesso agora **ecoa o que o banco respondeu** (leste, norte, giro, escala, nº de camadas ocultas) em vez de uma frase genérica. |
| **Mapa pesado para abrir** | Abrir `/mapa` baixava as três plantas (22 MB, sendo 19 MB de Iturama) dentro do `load`, em série, antes de desenhar imóvel nenhum — e na visão regional (z9) nenhuma delas chega a ser desenhada. | A planta só é buscada quando a cidade entra na tela **e** o zoom passa do mínimo. Medido: abrir em z9 baixa **0 MB** (era 22 MB); em Iturama z16 baixa só Iturama. |
| **Arrastar a planta trava** | Cada movimento do mouse refazia o GeoJSON inteiro e reenviava ao MapLibre. Medido em Iturama: **863 ms por movimento** (23 ms de cálculo + 840 ms de reprocessamento de 604.637 pontos). A planta andava quase um segundo atrás do cursor. | O arraste empurra a camada em pixels (`line-translate`, uniforme de GPU) e só recalcula a geometria **ao soltar**. Medido: **16,7 ms por quadro — 60 fps**. Shift durante o arraste anda a 15% para encostar no meio-fio. Teclado e Ctrl+Z coalescem num redesenho por quadro. |
| **Linha do lote não aparece** | Traço único, `#FFE9A8` com 1,1 px em z16: some sobre telhado de cerâmica claro e some sobre asfalto. | Contorno escuro embaixo + linha clara em cima, nas duas telas, com espessura que cresce até z19. Régua de escala na tela de calibração. |
| **Nuvem no satélite** | O mosaico "atual" da Esri muda sem aviso e a nuvem entrou numa atualização. | **Já resolvido no código, falta publicar.** Release fixo do Wayback (20512, 2025‑10‑23). Medido em 17/09 com `scripts/mede-nuvem.mjs` — é o melhor nas três cidades: Iturama 0,4% (mosaico atual: 15,6%, pior tile 52,9%), Limeira 0,0%, União 0,0%. |

**Ainda em aberto neste bloco:**

- **Plantas de Limeira do Oeste e União de Minas estão pobres.** São do conversor
  antigo: 47.786 e 7.773 linhas, contra 207.603 de Iturama — sem o conteúdo dos
  blocos de loteamento. Só existem em `.dwg`, e DWG é formato fechado.
  **Depende de você: abrir no AutoCAD → Salvar como → DXF** e subir em
  Admin › Cartografia. A conversão e a publicação são automáticas.
- **Iturama ainda baixa 19,3 MB no zoom da cidade**, e 41% disso é descartado no
  navegador (as 10 camadas de paisagismo: 122.027 de 207.603 linhas vão ao mapa).
  O conserto é gerar o arquivo já filtrado no servidor quando o operador salva a
  seleção de camadas — 19,3 MB cairiam para ~11 MB. Não feito ainda.

---

## 1. Depende só de você (destrava sozinho)

| # | O quê | Onde |
|---|---|---|
| 1 | **Redeploy no Dokploy** — é o que tira a nuvem do satélite e leva as correções do mapa urbano ao ar | painel Dokploy |
| 2 | **Envs em runtime**: as 6 do Supabase + `NEXT_PUBLIC_SITE_URL` com o domínio real | Dokploy › Environment |
| 3 | **Domínio**: comprar `arinimaps.com.br` ou apontar subdomínio na Cloudflare | — |
| 4 | ~~**Planta de Iturama**~~ **Feito em 09/09/2026** — DXF convertido, 207.603 linhas, alinhada ao satélite sem calibração | — |
| 5 | **DXF de Limeira do Oeste e União de Minas** (ver §0) | AutoCAD → Salvar como → DXF |
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

## 5. Consulta Rural — o que consulta sozinho e o que depende de arquivo

Sondei de novo todas as fontes do documento técnico em 28/08/2026 com os
scripts `sonda-fontes.mjs`, `sonda-fontes2.mjs` e `sonda-fontes3.mjs`.

**Consultam ao vivo, sem nenhuma chave (9 fontes):**

| Fonte | Órgão | Como |
|---|---|---|
| Processos minerários | ANM / SIGMINE | ArcGIS REST |
| Terras indígenas | FUNAI | WFS |
| Desmatamento PRODES | INPE / TerraBrasilis | WFS |
| Alertas DETER | INPE / TerraBrasilis | WFS |
| Focos de calor | INPE / Programa Queimadas | WFS |
| Unidades de conservação | CNUC/MMA compilado pelo INPE | WFS |
| Corpos d'água e represas | INPE / TerraBrasilis | WFS |
| Cursos d'água | ANA / SNIRH | ArcGIS REST |
| Empreendimentos de energia | ANEEL / SIGEL | ArcGIS REST |

Mais IBGE (municípios) e OpenStreetMap (POIs e acessos), que já alimentavam a página do imóvel.

**Não têm consulta pública por polígono — preciso do arquivo oficial para importar:**

| Fonte | O que medi em 28/08/2026 |
|---|---|
| CAR / SICAR | O WFS responde mas publica **zero camadas**. O shapefile por município sai com CAPTCHA. |
| INCRA / SIGEF | O acervo fundiário deu timeout; o portal de certificação exige login. |
| IBAMA — embargos | Nenhum host respondeu (404/403/DNS). Usar a planilha de dados abertos. |
| Territórios quilombolas | Mesmo acervo do INCRA que não respondeu. |
| IPHAN | O geoserver devolve a página do portal, não capabilities. Sai pelo SICG. |
| MapBiomas | A API de estatísticas exige token e aceite de termos. **Decisão sua: token ou raster importado?** |
| DNIT | Nenhum endpoint público respondeu; as rodovias hoje vêm do OpenStreetMap. |

Duas limitações que valem dizer ao Carlos, porque não são falha nossa:
- O SIGEL da ANEEL **não expõe linhas de transmissão nem subestações** — só empreendimentos de geração.
- O geoserver do Programa Queimadas é um cluster instável: 3 de 8 chamadas idênticas voltam 404. O sistema repete a chamada automaticamente.

## 6. Validação que só você pode fazer

Abrir e olhar com calma: `/` (landing), `/mapa` (com satélite e plantas),
`/imovel/ARINI-MAP-000002`, o tour 3D, e o painel admin inteiro.
Todas as telas foram verificadas por screenshot, mas seu olho no fluxo real
vale mais que o meu.

Telas novas desta rodada, que valem uma olhada:
`/imoveis` (busca com filtros), `/relatorios` (lista dos relatórios territoriais)
e `/imovel/ARINI-MAP-000001/relatorio` — o relatório sai em PDF pelo botão
"Baixar relatório", que usa a impressão do navegador (Salvar como PDF).

E, desta rodada: **Admin › Cartografia › Calibrar sobre o satélite** — arraste a
planta e veja se ficou suave. É a tela que mais mudou.
