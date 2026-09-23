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

O painel de **Admin › Configurações** mostra o estado de cada uma depois que o
app subir.

---

## 3. Worker (opcional nesta rodada)

Segundo serviço, a partir de `deploy/worker-compose.yml`. Envs: `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` e, se precisar,
`CHROMIUM_PATH` e `WORKER_INTERVALO_MS`.

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

`arinimaps.com.br` **já existe e já resolve**, mas em 17/09/2026 estava servindo
um **WordPress em Apache**, não esta aplicação. Apontar o domínio para o Dokploy
tira aquele site do ar — decisão sua, feita à parte deste deploy.

Enquanto isso, use a URL interna do Dokploy (ou um subdomínio tipo
`app.arinimaps.com.br`) e ponha o mesmo valor em `NEXT_PUBLIC_SITE_URL`.

---

## 7. Se der errado

| Sintoma | Causa provável |
|---|---|
| Build falha logo no início | Node < 20.9 — confira se o Nixpacks respeitou `engines` |
| App sobe, navegador não loga nem carrega mapa | `NEXT_PUBLIC_*` ausentes **no build** (§2) |
| Mapa em branco, canvas de 300 px | container do mapa sem altura — já corrigido no código; se voltar, é CSS do MapLibre vencendo o Tailwind |
| Upload de DXF grande morre | corpo limitado no proxy. O Next já aceita 220 MB (`proxyClientMaxBodySize`); o limite restante seria do Traefik |
| Planta não aparece no zoom da cidade | `diagnostico.bbox` vazio na camada — rode `node scripts/completa-bbox.mjs` |
