# Arini Imóveis Brasil — o que falta (23/09/2026)

> O sistema está construído: F0 a F3 entregues, migrations 0001–0019 aplicadas,
> todas as telas no design escuro/claro, desktop e celular.
> Rode `npm run dev` em `arini-maps/` e entre com `admin@arinimaps.com.br`.
> Repositório: github.com/steniodsb/arinimaps
>
> **O que falta para 100% cabe em quatro etapas, nesta ordem.** De código, não
> sobrou nada que dependa só de mim — o resto é deploy, conteúdo e decisão.

---

## Feito em 23/09/2026

| Item | Como ficou |
|---|---|
| **Textos jurídicos** | 6 documentos em `/termos`: Termos de Uso, Política de Privacidade (LGPD), Autorização de Venda, Exclusividade, Regra de Remuneração (1% + mensalidade + proteção contra venda por fora) e Termo de Parceria. Texto em `src/lib/juridico.ts`, versionado. |
| **Aceite registrado** | Cadastro exige aceite (Termos + Privacidade; parceiro também o Termo de Parceria). Anúncio exige escolher a **condição de comercialização** — autorização simples, exclusividade Arini ou imóvel de parceiro — e aceitar o termo dela. Grava versão, data, hora, usuário e IP (migration 0018), como a especificação pede no item 8. A análise do imóvel no admin mostra o aceite. |
| **Dados jurídicos no painel** | Aba nova em Admin › Configurações: razão social, CNPJ, CRECI-J, endereço, foro, e-mail do encarregado LGPD, prazo da autorização (180 dias) e proteção pós-contrato (12 meses). Os termos leem daí; campo vazio aparece marcado no texto. |
| **Planta de Iturama mais leve** | Ao salvar a seleção de camadas na calibração, o servidor grava o arquivo já sem as camadas ocultas (migration 0019). Medido: **19,3 MB → 13,9 MB** baixados no zoom da cidade, 60 → 50 camadas. O centro do arquivo completo vai gravado junto, para giro/escala não moverem a planta calibrada. |
| **Páginas de teste removidas** | `public/teste-mapa.html` e `public/teste-satelite.html` (diagnóstico de agosto) saíram. |
| **Limpeza dos dados demo pronta** | `scripts/limpa-demo.mjs` — ver Etapa 2. Ensaiado, não executado. |

---

## Etapa 1 — Colocar no ar (você, ~1h)

Trava todo o resto: sem ela, o satélite sem nuvem, as correções do mapa e os
termos não chegam ao público. Roteiro completo em `deploy/DEPLOY.md`.

| # | O quê | Onde |
|---|---|---|
| 1 | **Envs antes do primeiro build**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. As `NEXT_PUBLIC_*` entram no build — adicionadas depois, o navegador quebra sem erro claro. Mudou `NEXT_PUBLIC_*`? **Rebuild**, não restart. | Dokploy › Environment |
| 2 | **Deploy** da `main` | Dokploy |
| 3 | **Domínio**: comprar `arinimaps.com.br` ou apontar subdomínio na Cloudflare; ajustar `NEXT_PUBLIC_SITE_URL` e rebuild | Registro.br / Cloudflare |
| 4 | **Worker** (vídeo automático, tiles de imagem, imagem de compartilhamento) — `deploy/worker-compose.yml` como 2º serviço. Todo o resto funciona sem ele. | Dokploy |

## Etapa 2 — Deixar apresentável (você, meio dia)

| # | O quê | Onde |
|---|---|---|
| 5 | **Exportar DXF de Limeira do Oeste e União de Minas** no AutoCAD e subir. Hoje as plantas estão pobres (47.786 e 7.773 linhas contra 207.603 de Iturama — sem o conteúdo dos blocos de loteamento). DWG é formato fechado e não há conversor nesta máquina. Conversão e publicação são automáticas. | AutoCAD → Salvar como → DXF → Admin › Cartografia |
| 6 | **Preencher Dados jurídicos** (CNPJ, CRECI-J, endereço, foro, e-mail LGPD) — enquanto vazios, os termos publicados mostram `〔… preencher em Admin › Configurações〕` | Admin › Configurações › Dados jurídicos |
| 7 | **Preencher contatos e textos** (e-mail que recebe leads, telefone, e-mail público) | Admin › Configurações |
| 8 | **Desfazer a venda de teste** antes de mostrar: `node scripts/limpa-demo.mjs --vitrine --executar`. Apaga lead, oportunidade, visita, 3 propostas, contrato, venda e comissão do teste E2E e devolve a Fazenda Boa Vista a "publicado". Os 3 imóveis demo continuam para a apresentação. Sem `--executar` é só ensaio. | terminal, em `arini-maps/` |
| 9 | **Trocar a senha do admin** e criar a conta real do Carlos | Admin › Usuários |
| 10 | **Olhar com calma**: `/`, `/mapa` (satélite + plantas), `/imoveis`, `/relatorios`, `/imovel/ARINI-MAP-000002` e o relatório, o tour 3D, `/termos`, o cadastro com aceite, anunciar um imóvel de teste, e Admin › Cartografia › Calibrar. | navegador |

## Etapa 3 — Reunião com o Carlos (demo + decisões)

Pauta pronta em `PAUTA-REUNIAO-CARLOS.md` (na pasta do projeto). Resumo:

- **Orçamento** — ainda não enviado (recomendação registrada: R$ 7.000 em 3 parcelas + sustentação R$ 400–500/mês).
- **Validar os termos com o advogado dele.** A especificação exige (itens 8 e 24.2). Os pontos que são decisão comercial, não redação, estão listados na pauta.
- **Mensalidade** do anúncio e dias de tolerância (hoje R$ 0 / 15 dias). O texto dos termos se ajusta sozinho ao valor configurado.
- **Lista final de municípios** do piloto (você adiciona só com o código IBGE).
- **Satélite licenciado** MapTiler (~US$ 25/mês) — o Esri atual é de demonstração.
- **MapBiomas**: token com aceite de termos, ou raster importado?
- **Pedir**: arquivos oficiais de CAR, SIGEF, IBAMA embargos, quilombolas e IPHAN; 1 KML real; o fluxograma resumido.

## Etapa 4 — Ligar o que depende da reunião

| Serviço / item | Env ou ação | O que liga | Quem |
|---|---|---|---|
| Resend | `RESEND_API_KEY`, `RESEND_FROM` | E-mails: lead novo, imóvel aprovado/publicado/correção, encaminhamento a parceiro | você cria a conta, eu verifico |
| Asaas | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | Botão "Cobrar via Asaas" + baixa automática (`/api/asaas/webhook`) | você |
| MapTiler | `NEXT_PUBLIC_MAPTILER_KEY` | Satélite licenciado para uso comercial | você (rebuild) |
| Arquivos oficiais | — | CAR, SIGEF, IBAMA, quilombolas, IPHAN passam a cruzar no relatório | **eu importo** no PostGIS |
| MapBiomas | token ou raster | Uso do solo no relatório | **eu**, conforme a decisão |
| Termos revisados | subir `VERSOES` em `src/lib/juridico.ts` | Aceites antigos seguem apontando para a versão lida | **eu** |
| Abertura ao público | `node scripts/limpa-demo.mjs --tudo --executar` | Remove os 3 imóveis demo e as contas de teste | você, no dia |

Sem as chaves o sistema funciona — só esses recursos ficam inativos. Admin ›
Configurações mostra o estado de cada integração.

---

## Referência — Consulta Rural

**Consultam ao vivo, sem chave (9 fontes):** ANM/SIGMINE, FUNAI, INPE PRODES,
DETER, Queimadas, unidades de conservação, corpos d'água (TerraBrasilis),
ANA/SNIRH e ANEEL/SIGEL — mais IBGE e OpenStreetMap.

**Sem consulta pública por polígono (medido em 28/08/2026) — dependem de arquivo:**

| Fonte | O que medi |
|---|---|
| CAR / SICAR | WFS responde e publica zero camadas; shapefile por município sai com CAPTCHA |
| INCRA / SIGEF | acervo fundiário deu timeout; certificação exige login |
| IBAMA — embargos | nenhum host respondeu; usar a planilha de dados abertos |
| Territórios quilombolas | mesmo acervo do INCRA |
| IPHAN | geoserver devolve a página do portal; sai pelo SICG |
| MapBiomas | API exige token e aceite de termos — **decisão** |
| DNIT | nenhum endpoint público; rodovias vêm do OpenStreetMap |

Duas limitações que são dos órgãos, não nossas: o SIGEL da ANEEL não expõe
linhas de transmissão nem subestações, e o geoserver do Programa Queimadas é
instável (3 de 8 chamadas idênticas voltam 404; o sistema repete sozinho).

## Referência — Mapa urbano (medições de 17/09/2026)

| Queixa | Estado |
|---|---|
| Calibração não salvava (cache de 60 s regravava valor velho) | corrigido — lê sem cache e ecoa o que o banco gravou |
| Mapa pesado para abrir (22 MB em z9) | corrigido — 0 MB em z9; planta só quando a cidade está na tela |
| Arraste travado (863 ms por movimento) | corrigido — 16,7 ms/quadro, 60 fps |
| Linha do lote invisível | corrigido — contorno escuro + linha clara |
| Nuvem no satélite | corrigido no código (Wayback 20512) — **vai ao ar no deploy** |
| Iturama pesada (19,3 MB) | corrigido em 23/09 — 13,9 MB |
| Limeira e União pobres | **depende do DXF** (Etapa 2, item 5) |
