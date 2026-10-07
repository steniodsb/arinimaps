# Auditoria de segurança das APIs

Item 6.2 do roadmap ("Revisão de segurança das APIs") e requisito 14 do
documento de segurança e LGPD. Feita em 07/10/2026 sobre as 67 rotas de
`src/app/api`, as policies de RLS do banco e o front que monta HTML.

## Como foi feita

1. **Triagem automática** — `node scripts/audita-rotas.mjs` lista cada rota, os
   métodos exportados e aponta, **por método**: falta de conferência de sessão,
   falta de limite de requisições, SQL montado com texto, filtro do PostgREST
   com valor interpolado (`.or(\`…${x}\`)`), `fetch` para endereço variável
   (SSRF), upload sem limite de tamanho/tipo, `select("*")` e pontos de HTML cru
   no front (`dangerouslySetInnerHTML`, `setHTML`, `innerHTML`). Sai com erro se
   algum método que muda dados ficar sem trava. Rode depois de criar rota.
2. **Revisão manual** de cada rota apontada e das rotas sensíveis (login,
   recuperação, cadastro, documentos, uploads, webhook).
3. **Teste direto contra a API pública do banco** (PostgREST e Auth com a
   chave pública, que está no navegador) — foi aí que apareceram os achados
   mais graves, que nenhuma revisão das rotas do Next pegaria.

## Achados e correções

| # | Gravidade | Achado | Correção | Onde |
|---|---|---|---|---|
| 1 | **Crítico** | O cadastro direto no Auth (`POST /auth/v1/signup` com a chave pública) está aberto e o gatilho criava o perfil com o papel enviado em `user_metadata` — inclusive `admin_central`. Qualquer pessoa virava Diretoria. Testado: o Auth aceita o cadastro direto. | Gatilho `fn_handle_new_user` só aceita papel de equipe vindo de `app_metadata` (que só o servidor grava); senão a conta nasce `comprador`. Testado com 4 casos. **Falta (Stênio):** desligar "Allow new users to sign up" no painel do Supabase — o cadastro do site usa a API administrativa e continua funcionando. Contas da equipe conferidas: só as duas esperadas. | migration 0036 |
| 2 | **Alto** | Policies de escrita sobrando da F0 permitiam, pela API pública com a sessão do próprio usuário: criar o próprio cadastro de proprietário/parceiro já "aprovado" e então inserir e **publicar** imóvel sem a Matriz; marcar o próprio documento como conferido; trocar `storage_path` para o arquivo de outro imóvel (e a rota de documentos assinava); alterar aceite e selfie da autorização; alterar oportunidade, proposta, visita, contrato e histórico. | Escrita direta fechada: as policies viraram só leitura (mesmo filtro). Toda gravação do sistema já passava pelas rotas do servidor — nenhuma tela grava pelo navegador (conferido). Testado como usuário autenticado: insert em `owners` e update em `property_documents` recusados. | migration 0036 |
| 3 | **Alto** | `GET /api/imoveis/[id]/consulta-rural` sem trava: relatório territorial de qualquer imóvel (rascunho, em análise, reprovado) pelo id. | Público só para anúncio publicado/em negociação/vendido; o resto exige equipe ou responsável. | rota |
| 4 | **Alto** | `POST /api/auth/redefinir` sem `senha_atual` aceitava qualquer sessão — uma sessão de login comum (ex.: roubada) trocava a senha sem saber a atual. | Sem a senha atual só vale sessão aberta pelo link de recuperação (`amr` do token ≠ `password`). | rota + `src/lib/seguranca/recuperacao.ts` |
| 5 | **Alto** | Popup do mapa montava HTML com o título do anúncio sem escapar (`setHTML`) — XSS armazenado no mapa público. O sanitizador do MapLibre 5 tem contorno conhecido (GHSA-jrc7-96c5-q579). | `escaparHtml()` em `src/lib/seguranca/html.ts`. | `MapaRegional.tsx` |
| 6 | **Médio** | Fotos do anúncio subiam sem limite de tamanho nem conferência de tipo para o bucket **público**, com o `Content-Type` do navegador: um HTML ou SVG com script renomeado para `.jpg` ficava hospedado. Selfie, documentos e contrato também confiavam no tipo declarado; contrato sem limite de tamanho. | `conferirArquivo()` (`src/lib/seguranca/arquivos.ts`) decide o tipo pelos primeiros bytes (JPEG, PNG, WebP, HEIC, AVIF, GIF, PDF, ZIP/KMZ/DOCX, DOC, DWG, KML, DXF) e grava extensão e `Content-Type` reais. Limites: foto 20 MB, selfie 15 MB, documento/contrato 25 MB. | `api/imoveis`, `api/oportunidades/[id]/contrato` |
| 7 | **Médio** | Qualquer conta logada subia qualquer arquivo, de qualquer tamanho, direto no bucket público `media` (policy `media_auth_insert`). | Policy removida. O envio de vídeo usa URL assinada pelo servidor, que não depende dela (testado: envio por token funciona; envio direto é recusado). | migration 0036 |
| 8 | **Médio** | O próprio usuário alterava, pela API pública, colunas do perfil que não são dele: `setores` (membro da equipe se dava outro setor), `ativo`, CPF, aceite dos termos. | Só `nome`, `telefone`, `avatar_url` e `preferencias` mudam por ali. Testado. | migration 0036 |
| 9 | **Médio** | CSRF: as rotas que mudam dados dependiam só do SameSite=Lax do cookie. | `conferirOrigem()` (`src/lib/seguranca/origem.ts`) no `proxy.ts` para todo POST/PUT/PATCH/DELETE em `/api/*`: `Origin` precisa ser o próprio site (ou `Sec-Fetch-Site` ≠ cross-site). Isento: webhook do Asaas. As rotas fora do matcher (`api/admin/cartografia/**`) conferem dentro da rota. Extra: `ORIGENS_PERMITIDAS`. | proxy + 3 rotas |
| 10 | **Médio** | CPF no `user_metadata` do Auth: viaja dentro do token de sessão (cookie legível pelo navegador). | Retirado do cadastro e apagado das contas existentes (migration). | `api/cadastro`, migration 0036 |
| 11 | **Médio** | Documentos, selfies, contratos e anexos cartográficos abertos por URL assinada de 1 h, sem registro de quem abriu. | `GET /api/arquivos/[...path]`: confere a permissão a cada clique, registra em `document_access_log` (inclusive negados) e redireciona para URL de 60 s. Contrato e anexos cartográficos já usam; documentos do imóvel e selfie: ver "Pendente nos pacotes de outros". | item 6.3 |
| 12 | **Baixo** | Sem cabeçalhos de segurança (clickjacking, sniffing, HSTS). | `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors/object-src/base-uri/form-action`, `Referrer-Policy`, HSTS, `Permissions-Policy`. CSP de `script-src` fica para a homologação (exige nonce e teste do mapa/tour). | `next.config.ts` |
| 13 | **Baixo** | Cookie de sessão sem `Secure`. | `opcoesCookieSessao()` liga `Secure` quando `NEXT_PUBLIC_SITE_URL` é https (desligado em localhost para não travar o login). | `src/lib/seguranca/cookies.ts` |
| 14 | **Baixo** | Token do webhook do Asaas comparado com `!==`. | `timingSafeEqual`. | `api/asaas/webhook` |
| 15 | **Baixo** | Anexo cartográfico gravado com o `Content-Type` do navegador. | Tipo pela extensão (lista fechada). | `src/lib/cartografia/servidor.ts` |
| 16 | **Baixo** | ~30 rotas devolvem a mensagem crua do Postgres em erro 500 (nomes de tabela/restrição). | Não corrigido em massa (arquivos de vários pacotes). Padrão novo: `falha()`/`falhaBanco()` de `src/lib/erros.ts`. | — |
| 17 | Info | Dependências: Next 16.3.2 com 3 RCE críticas (GHSA-p293-qw3h-jr36, -2xp9-vwfh-vxw4, -vcvr-r3jv-pc5j); `sharp` e `source-map-js` vulneráveis. | Next 16.3.8 (patch), `npm audit fix`. Restam: MapLibre ≤ 6.4 (crítica, só corrigida na 6.x — major; mitigada pelo achado 5) e `braces` (só ferramenta de lint). | item 6.15 |

**Sem achado:** SQL injection (todas as consultas usam o cliente do Supabase ou
`pg` com parâmetros; nenhum filtro do PostgREST com valor interpolado), SSRF
(todo `fetch` do servidor vai a host fixo: IBGE, Overpass, Resend, Asaas,
fontes oficiais, o próprio Supabase), `select("*")` (só em catálogo de planos,
artigos da base e no "antes" da auditoria).

## Pendente nos pacotes de outros (mudança indicada, não aplicada)

- `src/app/api/imoveis/[id]/documentos/route.ts` (pacote D): no POST, trocar a
  leitura do arquivo por `conferirArquivo(arquivo, ACEITA.documento, 25 * 1024 * 1024)`
  e gravar com `arquivo.ext`/`arquivo.contentType`; no GET, devolver
  `url: urlArquivo(d.storage_path)` em vez de `createSignedUrl(..., 3600)`.
- `src/components/crm/DocumentosImovel.tsx`: abrir pelo `urlArquivo(d.storage_path)`.
- `src/app/admin/imoveis/[id]/page.tsx`: selfie por `urlArquivo(autorizacao.selfie_path)`
  em vez de `createSignedUrl(…, 3600)`.
- `src/app/api/conta/avatar/route.ts` (pacote D): `conferirArquivo(f, ACEITA.imagem, MAX)`.

## Tabela por rota

Gerada a partir de `node scripts/audita-rotas.mjs --json` + revisão manual.
"Limite" = limite de requisições na própria rota (as rotas da equipe dependem
da sessão e não têm limite próprio; as públicas do mapa têm limite em memória).

| Rota | Métodos | Sessão / permissão | Limite | Achados | Correção |
|---|---|---|---|---|---|
| `/api/acesso` | POST | senha de bloqueio do site; 10 tentativas/IP/15 min | sim | — | — |
| `/api/admin/car` | POST,GET | Cartografia | não | — | — |
| `/api/admin/cartografia/[id]` | PATCH,DELETE | Cartografia | não | Fora do matcher do proxy: sem conferência de origem (CSRF). | Origem conferida dentro da rota (`conferirOrigem`). |
| `/api/admin/cartografia` | POST | Cartografia | não | Fora do matcher do proxy: sem conferência de origem. Upload de planta (DXF/TIFF) só pela equipe, tipo pela extensão. | Origem conferida dentro da rota. Arquivo vai para o worker/GDAL, não é servido como página. |
| `/api/admin/cartografia/solicitacoes/[id]` | PATCH | Cartografia | não | Fora do matcher do proxy (prefixo `api/admin/cartografia`): sem conferência de origem. | Origem conferida dentro da rota. |
| `/api/admin/comissoes` | POST | Financeiro | não | — | — |
| `/api/admin/configuracoes` | POST | Diretoria (campos `somenteDiretoria`) | não | — | — |
| `/api/admin/decisao` | POST | Operações | não | — | — |
| `/api/admin/financeiro/exportar` | GET | Financeiro; exportação registrada na auditoria | não | — | — |
| `/api/admin/fontes/verificar` | POST | Cartografia ou Segurança | não | — | — |
| `/api/admin/geometria/validar` | POST | Cartografia | não | — | — |
| `/api/admin/lgpd` | POST,PATCH | Jurídico | não | — | — |
| `/api/admin/mensalidades` | POST | Financeiro | não | — | — |
| `/api/admin/municipios` | POST | Cartografia | não | `fetch` ao IBGE com o código interpolado. | Código validado (7 dígitos) antes; host fixo — sem SSRF. |
| `/api/admin/organizacoes` | POST,PATCH | Diretoria ou Comercial | não | `select("*")` só para o “antes” da auditoria. | Sem exposição ao cliente. |
| `/api/admin/parceiros` | PATCH | Operações | não | — | — |
| `/api/admin/planos` | POST,PATCH | Diretoria | não | `select("*")` em `plans` (catálogo público). | Sem dado pessoal. |
| `/api/admin/pois/atualizar` | POST | Cartografia | não | — | — |
| `/api/admin/seguranca/alertas` | PATCH | Segurança | não | nova (6.8) | — |
| `/api/admin/seguranca/retencao` | POST | Diretoria | não | nova (6.4) | — |
| `/api/admin/seguranca/revisao` | POST | Segurança ou Diretoria | não | nova (6.13) | — |
| `/api/admin/suporte/[id]` | GET | Suporte | não | — | — |
| `/api/admin/suporte/nao-lidos` | GET | Suporte | não | — | — |
| `/api/admin/suporte` | PATCH | Suporte | não | — | — |
| `/api/admin/tarefas` | POST,PATCH | equipe; só tarefas do próprio setor | não | — | — |
| `/api/admin/usuarios` | POST,PATCH | Diretoria (`admin_central`) | não | Promover conta externa a equipe é possível pela Diretoria (auditado). | Sem mudança; fica na revisão trimestral (6.13). |
| `/api/arquivos/[...path]` | GET | por registro: dono/parceiro do imóvel, quem fez o aceite, quem opera a oportunidade, solicitante; equipe por setor | sim | nova (6.3) | 120 aberturas/usuário/10 min; registro em `document_access_log`. |
| `/api/asaas/webhook` | POST | token `ASAAS_WEBHOOK_TOKEN` | não | Token comparado com `!==` (vaza tempo de comparação). | Comparação em tempo constante (`timingSafeEqual`). Isenta da conferência de origem. |
| `/api/auth/entrar` | POST | é o login; 30/IP/10 min e 8/e-mail/15 min | sim | — | Detecção de acesso anormal (6.8). |
| `/api/auth/evento` | POST | sessão; eventos em lista fechada | sim | — | — |
| `/api/auth/recuperar` | POST | 10/IP/h e 3/e-mail/h; resposta igual exista ou não a conta | sim | — | — |
| `/api/auth/redefinir` | POST | sessão | não | ALTO: sem `senha_atual`, qualquer sessão (inclusive de login comum, talvez roubada) trocava a senha. Conta da equipe recuperava só com o link. | Sem senha atual só vale sessão aberta pelo link (`amr` ≠ password). Equipe: código do autenticador ou código no e-mail + auditoria + alerta + aviso à Diretoria (6.7). |
| `/api/avaliacao/[propertyId]/avaliador` | POST | sessão + limite 3/h | sim | Rota nova do pacote C — revisão superficial. | — |
| `/api/avaliacao/[propertyId]` | POST | plano (`pre_avaliacao`) + limite | sim | Rota nova do pacote C — revisão superficial. | — |
| `/api/cadastro` | POST | é o cadastro; 6/IP/h | sim | MÉDIO: CPF ia para o `user_metadata` (viaja no token de sessão). | CPF fora do metadata (e removido das contas existentes); cifrado + hash quando `CAMPO_CRIPTO_CHAVE` existir (6.5). |
| `/api/cartografia/solicitacoes/[id]/mensagem` | POST | solicitante | sim | Anexo gravado com o tipo declarado pelo navegador. | Tipo gravado pela extensão aceita (lista fechada); download só via `/api/arquivos`. |
| `/api/cartografia/solicitacoes` | POST,GET | sessão + plano | sim | Idem anexos; URLs assinadas de 1 h na resposta. | Endereços passam por `/api/arquivos` (60 s, registrado). |
| `/api/consulta/area` | POST | plano + cota + limite (`executarConsultaArea`) | sim | — | — |
| `/api/consulta/car/[cod]` | POST | plano + cota + limite (`executarConsultaArea`) | sim | — | — |
| `/api/consulta/lote/[id]` | POST | plano + cota + limite (`executarConsultaArea`) | sim | — | — |
| `/api/conta/avatar` | POST,DELETE | sessão + limite | sim | BAIXO: tipo pelo MIME declarado (lista de imagens), bucket público. | Recomendado ao pacote D: `conferirArquivo(f, ACEITA.imagem, …)`. |
| `/api/conta/organizacao` | POST | sessão + limite | sim | Rota nova do pacote D — revisão superficial. | — |
| `/api/conta/preferencias` | GET,PATCH | sessão + limite | sim | — | — |
| `/api/conta` | PATCH | sessão + limite | sim | — | — |
| `/api/demandas/[id]` | PATCH | Comercial | não | `select("*")` só para o “antes” da auditoria. | — |
| `/api/demandas` | POST | Comercial | não | — | — |
| `/api/geo/car/[cod]` | GET | pública (dado do CAR é público) | sim | — | Limite em memória (pacote A, 6.14). |
| `/api/geo/cartografia` | GET | pública (camadas publicadas) | sim | — | Limite em memória (pacote A). |
| `/api/geo/imoveis` | GET | pública: só anúncios publicados/em negociação/vendidos, campos públicos | sim | — | Limite em memória (pacote A). |
| `/api/geo/lotes/[id]` | GET | pública | sim | — | Limite em memória (pacote A). |
| `/api/geo/municipios` | GET | pública | sim | — | Limite em memória (pacote A). |
| `/api/geo/pois` | GET | pública | sim | — | Limite em memória (pacote A). |
| `/api/ia/chat` | POST | plano (`chat_ia`) + limite | sim | Rota nova do pacote C — revisão superficial. | — |
| `/api/ia/conhecimento/[id]` | GET,PATCH | Marketing ou Diretoria | não | `select("*")` de artigo da base (sem dado pessoal). | — |
| `/api/ia/conhecimento` | GET,POST | Marketing ou Diretoria | não | — | — |
| `/api/ia/estado` | GET | sessão | não | — | — |
| `/api/imoveis/[id]/consulta-rural` | POST,GET | POST: Operações/Cartografia; GET: público | não | ALTO: GET sem trava — relatório territorial de QUALQUER imóvel (rascunho, em análise, reprovado) pelo id. | GET público só para anúncio publicado/em negociação/vendido; o resto exige equipe ou responsável (404 para os demais). |
| `/api/imoveis/[id]/documentos` | POST,GET,PATCH | dono/parceiro ou equipe; conferência: Operações/Jurídico | não | BAIXO: upload sem conferir o conteúdo; lista devolve URL assinada de 1 h sem registro de abertura. | Arquivo do pacote D — mudança indicada no relatório (usar `conferirArquivo` e `urlArquivo`). |
| `/api/imoveis/[id]/midia` | POST,PUT,DELETE | dono/parceiro ou equipe + limite | sim | — | Vídeo por URL de envio assinada; caminho gerado pelo servidor. |
| `/api/imoveis/[id]/revisao` | POST,DELETE | dono/parceiro | não | — | — |
| `/api/imoveis` | POST | sessão; proprietário/parceiro aprovado ou equipe | não | MÉDIO: fotos sem limite de tamanho nem conferência de tipo, gravadas no bucket PÚBLICO com o `Content-Type` do navegador (HTML/SVG disfarçado de foto). Selfie e documentos pelo MIME declarado. | Conteúdo conferido pelos primeiros bytes (`conferirArquivo`): fotos 20 MB, selfie 15 MB, documentos 25 MB; tipo e extensão gravados são os reais. |
| `/api/leads` | POST | formulário público + limite por IP | sim | — | — |
| `/api/oportunidades/[id]/contrato` | POST,GET | Arini envia; quem opera a oportunidade baixa | não | MÉDIO: upload sem limite de tamanho nem conferência; URL assinada de 1 h. | `conferirArquivo` (25 MB) e download via `/api/arquivos` (registrado, 60 s). |
| `/api/oportunidades/[id]` | PATCH,POST | `podeOperarOportunidade` | não | — | — |
| `/api/suporte/[id]` | GET,POST | dono do chamado + limite | sim | — | — |
| `/api/suporte` | POST | sessão opcional + limite | sim | — | — |
| `/api/tiles/[camada]/[z]/[x]/[y]` | GET | pública | sim | `fetch` com URL montada. | Host fixo (`NEXT_PUBLIC_SUPABASE_URL`) e função de lista fechada — sem SSRF. Limite em memória (pacote A). |

## HTML montado à mão no front

| Arquivo | Situação |
|---|---|
| `src/app/layout.tsx` | script do tema, constante do código |
| `src/components/map/MapaRegional.tsx` (popup) | **corrigido**: `escaparHtml()` no título e no valor |
| `src/components/tour/Tour3D.tsx` (etiquetas) | remove `<>&` do nome do ponto; texto entra só como conteúdo |
| `src/components/map/ComparaImagens.tsx` | atribuição da camada, vinda da configuração do código |
