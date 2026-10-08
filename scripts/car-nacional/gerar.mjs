// CAR nacional — passo 2: gera o arquivo de mapa (PMTiles) a partir do que o
// baixar.mjs gravou. Sem tippecanoe: geojson-vt corta e simplifica, vt-pbf
// codifica o MVT e pmtiles-escrita.mjs monta o arquivo.
//
// Como cabe na memória: o Brasil é dividido em blocos (tiles z7, ~300 km). Cada
// feição vai para todo bloco que o seu retângulo toca; cada bloco é processado
// sozinho e só emite os tiles que estão DENTRO dele — feição na divisa entre
// dois blocos é cortada certo nos dois. Um bloco denso de MG tem ~100 mil
// imóveis, que o geojson-vt indexa com 1–2 GB.
//
// De longe só as áreas grandes, com traço mais simples e só os campos do
// clique básico; de perto, tudo. Meta: tile abaixo de ~300 KB em qualquer
// zoom, para o mapa ficar fluido (medido em GO: z7 com o corte de 200 ha
// dava 885 KB). Faixas: z7 ≥ 1.000 ha, z8 ≥ 500, z9 ≥ 200, z10 ≥ 50,
// z11 ≥ 5, z12+ todas.
//
// Uso: node --max-old-space-size=8192 scripts/car-nacional/gerar.mjs [--dados ../dados] [--saida <arquivo>] [uf ...]
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createGunzip, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { once } from "node:events";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";
import { EscritorPMTiles } from "./pmtiles-escrita.mjs";

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
};
const DADOS = resolve(opcao("dados", process.env.CAR_DADOS ?? "../dados"));
const SAIDA = resolve(opcao("saida", join(DADOS, "car-brasil.pmtiles")));
const so = args.filter((a, i) => /^[a-z]{2}$/i.test(a) && !args[i - 1]?.startsWith("--")).map((u) => u.toLowerCase());

const Z_BLOCO = 7, Z_MIN = 7, Z_MAX = 13;
const FAIXA_DO_ZOOM = { 7: 1000, 8: 500, 9: 200, 10: 50, 11: 5, 12: 0, 13: 0 };
const AREA_MIN = (z) => FAIXA_DO_ZOOM[z];
const FAIXAS = [...new Set(Object.values(FAIXA_DO_ZOOM))]; // um índice por faixa de área
// tolerância de simplificação (unidades de tile de 4096): mais grossa de longe
const TOLERANCIA = { 1000: 8, 500: 6, 200: 5, 50: 4, 5: 3, 0: 3 };
// longe (faixas ≥ 50 ha): só o que o cartão precisa para mostrar e abrir o imóvel
const enxuto = (f) => ({ ...f, properties: { cod: f.properties.cod, area_ha: f.properties.area_ha, municipio: f.properties.municipio, uf: f.properties.uf } });

const lon2x = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
function bbox(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const andar = (c) => {
    if (typeof c[0] === "number") {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
    } else c.forEach(andar);
  };
  andar(geom.coordinates);
  return [x0, y0, x1, y1];
}

async function* linhas(arquivo) {
  const rl = createInterface({ input: createReadStream(arquivo).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield l;
}

// ---------- 1. particiona em blocos ----------
const pastaBlocos = join(DADOS, "car", "_blocos");
rmSync(pastaBlocos, { recursive: true, force: true });
mkdirSync(pastaBlocos, { recursive: true });
const abertos = new Map();
const limites = [Infinity, Infinity, -Infinity, -Infinity];
let total = 0, descartadas = 0;
const ufs = readdirSync(join(DADOS, "car"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[a-z]{2}$/.test(d.name) && (!so.length || so.includes(d.name)))
  .map((d) => d.name);
console.log(`particionando ${ufs.length} UF(s): ${ufs.join(", ")}`);
for (const uf of ufs) {
  for (const arq of readdirSync(join(DADOS, "car", uf)).filter((a) => a.endsWith(".geojsonl.gz"))) {
    for await (const l of linhas(join(DADOS, "car", uf, arq))) {
      const f = JSON.parse(l);
      const [x0, y0, x1, y1] = bbox(f.geometry);
      // o SICAR tem feições com coordenadas fora de grau (projeção trocada ou
      // lixo de cadastro): fora do Brasil não entra — senão vira um bloco por
      // feição e estoura os arquivos abertos (EMFILE, medido em 08/10/2026)
      if (!(x0 >= -75 && x1 <= -28 && y0 >= -35 && y1 <= 7) || x1 - x0 > 5 || y1 - y0 > 5) { descartadas++; continue; }
      limites[0] = Math.min(limites[0], x0); limites[1] = Math.min(limites[1], y0);
      limites[2] = Math.max(limites[2], x1); limites[3] = Math.max(limites[3], y1);
      for (let x = lon2x(x0, Z_BLOCO); x <= lon2x(x1, Z_BLOCO); x++) {
        for (let y = lat2y(y1, Z_BLOCO); y <= lat2y(y0, Z_BLOCO); y++) {
          const chave = `${x}_${y}`;
          let s = abertos.get(chave);
          if (!s) { s = createWriteStream(join(pastaBlocos, `${chave}.jsonl`)); abertos.set(chave, s); }
          if (!s.write(l + "\n")) await once(s, "drain");
        }
      }
      total++;
    }
  }
}
await Promise.all([...abertos.values()].map((s) => { s.end(); return once(s, "close"); }));
console.log(`${total} imóveis em ${abertos.size} blocos · ${descartadas} descartados por coordenada fora do Brasil`);

// ---------- 2. gera os tiles bloco a bloco ----------
const escritor = new EscritorPMTiles(SAIDA);
const estat = {};
const t0 = Date.now();
let feitos = 0, tilesGerados = 0;
for (const chave of abertos.keys()) {
  const [bx, by] = chave.split("_").map(Number);
  const feicoes = [];
  const rl = createInterface({ input: createReadStream(join(pastaBlocos, `${chave}.jsonl`)), crlfDelay: Infinity });
  for await (const l of rl) if (l) feicoes.push(JSON.parse(l));

  const indices = new Map();
  for (const faixa of FAIXAS) {
    let sub = faixa ? feicoes.filter((f) => (f.properties.area_ha ?? 0) >= faixa) : feicoes;
    if (!sub.length) continue;
    if (faixa >= 50) sub = sub.map(enxuto);
    indices.set(faixa, geojsonvt({ type: "FeatureCollection", features: sub }, {
      maxZoom: Z_MAX, indexMaxZoom: Z_BLOCO, indexMaxPoints: 0, tolerance: TOLERANCIA[faixa], extent: 4096, buffer: 64,
    }));
  }

  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const indice = indices.get(AREA_MIN(z));
    if (!indice) continue;
    const lado = 2 ** (z - Z_BLOCO);
    for (let x = bx * lado; x < (bx + 1) * lado; x++) {
      for (let y = by * lado; y < (by + 1) * lado; y++) {
        const tile = indice.getTile(z, x, y);
        if (!tile || !tile.features.length) continue;
        const pbf = vtpbf.fromGeojsonVt({ car: tile }, { version: 2, extent: 4096 });
        const gz = gzipSync(Buffer.from(pbf));
        escritor.adicionar(z, x, y, gz);
        tilesGerados++;
        const e = estat[z] ??= { n: 0, soma: 0, max: 0 };
        e.n++; e.soma += gz.length; e.max = Math.max(e.max, gz.length);
      }
    }
  }
  feitos++;
  process.stdout.write(`\rbloco ${feitos}/${abertos.size} · ${feicoes.length} imóveis · ${tilesGerados} tiles · ${Math.round((Date.now() - t0) / 1000)}s   `);
}

const r = await escritor.finalizar({
  minZoom: Z_MIN, maxZoom: Z_MAX,
  bounds: limites,
  centro: [(limites[0] + limites[2]) / 2, (limites[1] + limites[3]) / 2, Z_MIN],
  metadados: {
    name: "CAR — imóveis rurais (SICAR)",
    attribution: "CAR/SICAR — Serviço Florestal Brasileiro",
    gerado_em: new Date().toISOString(),
    ufs,
    imoveis: total,
    descartados: descartadas,
    vector_layers: [{
      id: "car", minzoom: Z_MIN, maxzoom: Z_MAX,
      fields: { cod: "String", area_ha: "Number", condicao: "String", status: "String", tipo: "String", municipio: "String", uf: "String" },
    }],
  },
});
rmSync(pastaBlocos, { recursive: true, force: true });
console.log("");
for (const [z, e] of Object.entries(estat)) {
  console.log(`  z${z}: ${e.n} tiles · média ${(e.soma / e.n / 1024).toFixed(0)} KB · maior ${(e.max / 1024).toFixed(0)} KB (gzip)`);
}
console.log(`${SAIDA}: ${r.tiles} tiles (${r.conteudos} distintos), ${(r.bytes / 1e6).toFixed(1)} MB`);
if (!existsSync(SAIDA)) process.exit(1);
