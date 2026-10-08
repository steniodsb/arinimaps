# Colocar o Arini Imóveis Brasil no ar (Dokploy)

Levantado do código em 17/09/2026. Nada aqui é de memória: a lista de envs saiu
de `grep process.env` em `src/` e `worker/`, e a versão do Node saiu do
`engines` do próprio Next.

> **Segredos não estão neste arquivo.** Os valores ficam no seu
> `arini-maps/.env.local`, que é ignorado pelo git. Copie de lá.

---

## 1. Serviço da aplicação

| Campo no Dokploy | Valor |
|---|---|
| Tipo | Application |
| Provider | GitHub — `steniodsb/arinimaps` |
| Branch | `main` |
| Build | Nixpacks (padrão — o repo não tem Dockerfile) |
| Install | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm start` |
| Porta | `3000` |

O `engines.node = ">=22"` no `package.json` existe para o Nixpacks não escolher
Node 18: o Next 16.3.2 exige `>=20.9.0` e o build morre antes de começar.

---

## 2. Envs da aplicação

### Obrigatórias — sem estas o app não sobe

| Env | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qtpjryvqifcmmabebccf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | do `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | do `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | a URL pública que o serviço vai atender |

> **O erro mais provável desta etapa.** As `NEXT_PUBLIC_*` são gravadas dentro
> do JavaScript **durante o build**, não lidas na hora da requisição. Se elas só
> existirem depois que o container subir, o servidor funciona e o **navegador
> não** — login e mapa quebram sem erro claro. Preencha as envs **antes** de
> disparar o primeiro build; se mudar qualquer `NEXT_PUBLIC_*`, **rebuild**, não
> apenas restart.

### Opcionais — cada uma liga um recurso já pronto no código

| Env | O que liga | Sem ela |
|---|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` | e-mails automáticos (lead novo, imóvel aprovado/publicado/correção, encaminhamento a parceiro) | o app funciona, não envia e-mail |
| `ARINI_NOTIFY_EMAIL` | destino das notificações internas da Arini | cai no padrão do código |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` | botão "Cobrar via Asaas" + baixa automática em `/api/asaas/webhook` | cobrança só manual |
| `NEXT_PUBLIC_ARCGIS_KEY` | satélite Esri **licenciado** (ArcGIS Location Platform, 2 milhões de tiles/mês grátis). Crie a chave com o privilégio *Basemaps* e restrinja aos domínios do site | usa Esri Wayback 20512, sem licença comercial |
| `NEXT_PUBLIC_WHATSAPP_ARINI` | número do botão de WhatsApp | botão sem número |
| `ANTHROPIC_API_KEY` | assistente de IA do site (`/api/ia/chat`, botão "Pergunte à Arini"). Só no servidor — **nunca** com prefixo `NEXT_PUBLIC_` | botão mostra "Assistente em configuração"; a rota responde 503 `ia_desligada` |
| `ARINI_IA_MODELO` | modelo do assistente (padrão `claude-haiku-5-5`; `claude-sonnet-5-5` custa ~20× mais) | usa o padrão |
| `ARINI_IA_ESFORCO` | `low` / `medium` / `high` — profundidade de raciocínio (padrão `low`, conversa curta) | usa `low` |
| `CAMPO_CRIPTO_CHAVE` | CPF/CNPJ cifrado no banco + hash para busca (`openssl rand -base64 32`; guardar cópia no cofre — perder a chave = perder os CPFs cifrados). Depois de criar: `node scripts/cifra-cpf.mjs --aplicar`. Rotação: `docs/SEGURANCA.md` §11 | CPF gravado em claro, como antes |
| `ORIGENS_PERMITIDAS` | outros endereços aceitos como origem de POST/PATCH/DELETE nas APIs (separados por vírgula), além de `NEXT_PUBLIC_SITE_URL` e do próprio host | só o próprio site |
| `ARINI_IA_COTACAO_USD` | cotação do dólar usada só para estimar o custo em R$ em Conhecimento e IA › Conversas (padrão 5,4) | usa o padrão |
| `NEXT_PUBLIC_CAR_NACIONAL_URL` | malha do CAR do **Brasil inteiro** a partir do arquivo PMTiles na Cloudflare R2 (ex.: `https://mapas.ariniimoveisbrasil.com.br/car/car-brasil.pmtiles`). Gerar e enviar: `scripts/car-nacional/LEIAME.md`. Vai **no build** (prefixo `NEXT_PUBLIC_`) | CAR do banco (região) + busca no SICAR sob demanda |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | envio do PMTiles nacional (`scripts/car-nacional/publicar.mjs`), só onde o job mensal roda | o arquivo não é publicado |
| `ARINI_IA_MAX_SIMULTANEAS` | conversas de IA ao mesmo tempo no servidor (padrão 20); acima disso responde `ia_ocupada` | usa 20 |
| `ARINI_CONSULTAS_MAX_SIMULTANEAS`, `ARINI_CONSULTAS_FILA_MAX`, `ARINI_CONSULTAS_ESPERA_MS` | fila das consultas de área (padrão 8 rodando, 40 na fila, 30 s de espera) | usa o padrão |
| `ARINI_FONTES_MAX_SIMULTANEOS`, `ARINI_FONTES_ESPERA_MS` | pedidos simultâneos a cada órgão (SICAR, INCRA, IBAMA…; padrão 4, espera 25 s) | usa o padrão |
| `SAUDE_TOKEN` | detalhe de cada componente em `/api/saude` (monitor do worker e diagnóstico). Gerar com `openssl rand -hex 24`; o mesmo valor no worker | `/api/saude` só responde ok/falha |
| `BACKUP_CHAVE` | criptografia dos backups (`docs/BACKUP.md`); guardar cópia fora do servidor | o backup não roda |

O painel de **Admin › Configurações** mostra o estado de cada uma depois que o
app subir.

---

## 3. Worker (opcional nesta rodada)

Segundo serviço, a partir de `deploy/worker-compose.yml`. Envs: `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` e, se precisar,
`CHROMIUM_PATH` e `WORKER_INTERVALO_MS`.

O worker também gera os **lotes urbanos clicáveis** (job `gerar_lotes`) quando uma
planta é enviada ou recalibrada. Sem ele, rode `node scripts/gera-lotes.mjs` na
sua máquina depois de enviar ou calibrar uma planta.

Sem o worker ficam pendentes: vídeo automático, tiles de imagem georreferenciada
e imagem de compartilhamento. **Todo o resto funciona sem ele** — inclusive a
planta urbana em DXF, que é convertida pela própria aplicação.

---

## 4. Banco

Nada a fazer. As migrations 0001–0017 já estão aplicadas no Supabase
`qtpjryvqifcmmabebccf`, que é o mesmo banco em dev e em produção. Migration nova
se aplica com `node scripts/migrate.mjs` daqui, não pelo Dokploy.

---

## 5. Conferir depois que subir

Na ordem, porque cada uma isola uma camada diferente:

1. `GET /api/geo/municipios` devolve um FeatureCollection → **servidor e banco ok**.
2. `/mapa` desenha os municípios → **`NEXT_PUBLIC_*` entraram no build**.
3. Zoom em Iturama até a cidade aparecer → a planta urbana entra. Se ficar sem
   planta, veja se `/api/geo/cartografia` responde e traz `bbox` preenchido.
4. Botão **Satélite** → os tiles devem vir de `wayback.maptiles.arcgis.com/...
   /tile/20512/...`. É esse release fixo que tira a nuvem; se a URL estiver
   apontando para `server.arcgisonline.com` ou `clarity.`, o build é antigo.
5. Entrar com `admin@arinimaps.com.br` → **auth ok**.
6. Admin › Cartografia › **Calibrar sobre o satélite**: arrastar a planta deve
   acompanhar o cursor. Se arrastar aos solavancos, o build é anterior a
   `f3858bd`.

---

## 6. Domínio

O sistema se chama **Arini Imóveis Brasil** e atende em **`ariniimoveisbrasil.com.br`**
(decisão de 08/10/2026; o nome antigo era Arini Maps e o domínio `arinimaps.com.br`).
O deploy vai para uma **VPS exclusiva** do projeto, não para o App Hosting compartilhado.

1. No Registro.br, registro **A** de `ariniimoveisbrasil.com.br` e de `www` para o IP da VPS.
2. `NEXT_PUBLIC_SITE_URL=https://ariniimoveisbrasil.com.br` no app e `SITE_URL` no worker.
3. No Resend, verificar o domínio de envio `ariniimoveisbrasil.com.br` e usar
   `RESEND_FROM="Arini Imóveis Brasil <naoresponda@ariniimoveisbrasil.com.br>"`.
4. No Supabase › Authentication › URL Configuration, Site URL e Redirect URLs com o domínio novo
   (o link de recuperação de senha depende disso).

O repositório no GitHub e a pasta local continuam com o nome técnico `arinimaps` / `arini-maps`;
isso não aparece para o usuário.

---

## 6b. Cloudflare (DNS, cache do mapa e R2)

1. **DNS:** domínio na Cloudflare, registro `A` para o IP da VPS com o proxy (nuvem laranja) ligado.
2. **Cache do mapa:** Caching › Cache Rules › regra "URI Path starts with `/api/tiles/`" → *Eligible for cache*,
   *Edge TTL: respeitar o cabeçalho de origem* (o app já manda `s-maxage=86400`). Com 500+ pessoas
   simultâneas é o que tira os tiles do banco (`docs/INFRA-NACIONAL.md` §5).
3. **R2 (CAR nacional e, depois, vídeos):** criar o bucket `arini-mapas`, ligar um domínio próprio
   (ex.: `mapas.ariniimoveisbrasil.com.br`) e a política de CORS:
   ```json
   [{ "AllowedOrigins": ["https://ariniimoveisbrasil.com.br"], "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["Range", "If-Match"], "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"], "MaxAgeSeconds": 86400 }]
   ```
   Criar um token de API do R2 (Object Read & Write, só esse bucket) → `R2_*` (§2).
4. **Primeira carga do CAR nacional** (na VPS, ~1 h 30 no total): `scripts/car-nacional/LEIAME.md`.
   Depois, `NEXT_PUBLIC_CAR_NACIONAL_URL` no app e novo build.
5. **IP real:** com o proxy da Cloudflare ligado, o app usa `cf-connecting-ip` para os limites por IP
   (`src/lib/seguranca/limite.ts`). Não desligar o proxy só para alguns subdomínios do app.

## 7. Se der errado

| Sintoma | Causa provável |
|---|---|
| Build falha logo no início | Node < 20.9 — confira se o Nixpacks respeitou `engines` |
| App sobe, navegador não loga nem carrega mapa | `NEXT_PUBLIC_*` ausentes **no build** (§2) |
| Mapa em branco, canvas de 300 px | container do mapa sem altura — já corrigido no código; se voltar, é CSS do MapLibre vencendo o Tailwind |
| Upload de DXF grande morre | corpo limitado no proxy. O Next já aceita 220 MB (`proxyClientMaxBodySize`); o limite restante seria do Traefik |
| Planta não aparece no zoom da cidade | `diagnostico.bbox` vazio na camada — rode `node scripts/completa-bbox.mjs` |
