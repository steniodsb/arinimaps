# CAR nacional — arquivo de mapa (PMTiles)

A malha do CAR do Brasil inteiro (~7,5 milhões de imóveis) não fica no banco: vira um único arquivo
PMTiles na Cloudflare R2, e o mapa lê só os pedaços da tela (Range request), direto da CDN. O mapa
nacional não depende do SICAR estar no ar; o SICAR só é consultado na atualização mensal.

| Passo | Script | Tempo (medido em GO, 244 mil imóveis) |
|---|---|---|
| 1. Baixar do SICAR, município por município (retomável) | `baixar.mjs` | Brasil: 37 min, 27 UFs, 0 falhas, 1,6 GB (08/10/2026) |
| 2. Gerar o PMTiles (geojson-vt + vt-pbf, sem tippecanoe) | `gerar.mjs` | Brasil: ~10 min, 8.536.801 imóveis, 432.570 tiles, 2,4 GB |
| 3. Enviar para a R2 e trocar o arquivo publicado | `publicar.mjs` | depende do link |
| Conferir um arquivo (cabeçalho e tiles) | `conferir.mjs` | — |

```bash
node scripts/car-nacional/baixar.mjs --paralelo 4            # todas as UFs, região da Arini primeiro
node --max-old-space-size=8192 scripts/car-nacional/gerar.mjs
node scripts/car-nacional/publicar.mjs
```

Dados em `../dados/car/<uf>/<cod_ibge>.geojsonl.gz` (fora do repositório; `--dados` ou `CAR_DADOS`
mudam a pasta). Rodar o `baixar.mjs` de novo só refaz municípios com mais de 30 dias.

**Tamanho dos tiles** (meta: abaixo de ~300 KB para o mapa ficar fluido). Brasil, com gzip: média de
3 a 47 KB por zoom, maior tile 147 KB (z11). 2 feições descartadas por coordenada fora do Brasil. De longe entram só as áreas grandes
(z7 ≥ 1.000 ha … z11 ≥ 5 ha, z12+ todas) e só os campos do cartão.

**No mapa:** `NEXT_PUBLIC_CAR_NACIONAL_URL` = endereço público do arquivo
(ex.: `https://mapas.ariniimoveisbrasil.com.br/car/car-brasil.pmtiles`). Sem a variável, o mapa usa
o banco (base regional) e busca no SICAR sob demanda (`/api/car/janela`). Em teste local, copie um
arquivo para `public/dev/` e use `NEXT_PUBLIC_CAR_NACIONAL_URL=/dev/car-go.pmtiles` em
`.env.development.local`.

**R2:** bucket público por domínio próprio, com CORS liberando `GET`/`HEAD` e o cabeçalho `Range`
para o domínio do site. Variáveis do envio: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

**Atualização mensal (VPS):** cron no dia 1, fora do worker comum (precisa de ~8 GB de RAM por ~20 min):

```
0 3 1 * * cd /app && node scripts/car-nacional/baixar.mjs --paralelo 4 && node --max-old-space-size=8192 scripts/car-nacional/gerar.mjs && node scripts/car-nacional/publicar.mjs
```
