// Converte planta DXF georreferenciada em GeoJSON WGS84, sobe para o storage
// e registra como camada vetorial de cartografia.
//
// Uso: node scripts/converte-dxf.mjs <arquivo.dxf> "<Município>" ["<Nome>"] [datum] [zona]
//   datum: sirgas (padrão) | sad69 | corrego
//   zona:  22 (padrão para o Pontal do Triângulo)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import DxfParser from "dxf-parser";
import proj4 from "proj4";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const [, , arquivoDxf, nomeMunicipio, nomeCamada, datumArg = "sirgas", zonaArg = "22"] = process.argv;
if (!arquivoDxf || !nomeMunicipio) {
  console.error('Uso: node scripts/converte-dxf.mjs <arquivo.dxf> "<Município>" ["<Nome>"] [sirgas|sad69|corrego] [zona]');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const z = Number(zonaArg);
const DATUMS = {
  sirgas: `+proj=utm +zone=${z} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
  sad69: `+proj=utm +zone=${z} +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs`,
  corrego: `+proj=utm +zone=${z} +south +ellps=intl +towgs84=-206,172,-6,0,0,0,0 +units=m +no_defs`,
};
const projDef = DATUMS[datumArg] ?? DATUMS.sirgas;
const paraWgs84 = ([x, y]) => proj4(projDef, "EPSG:4326", [x, y]);

const dentro = ([x, y]) => x > 100000 && x < 900000 && y > 6000000 && y < 10000000;
const arred = (n) => Math.round(n * 1e6) / 1e6;

console.log(`lendo ${arquivoDxf} · datum ${datumArg} · zona ${z}…`);
const dxf = new DxfParser().parseSync(readFileSync(arquivoDxf, "utf8"));

const porLayer = new Map();
let total = 0, descartadas = 0;

function adicionar(layer, pontos) {
  const validos = pontos.filter(dentro);
  if (validos.length < 2) { descartadas++; return; }
  const linha = validos.map((p) => paraWgs84(p).map(arred));
  if (!porLayer.has(layer)) porLayer.set(layer, []);
  porLayer.get(layer).push(linha);
  total++;
}

for (const e of dxf.entities ?? []) {
  const layer = e.layer ?? "0";
  if (e.type === "LINE" && e.vertices?.length >= 2) {
    adicionar(layer, e.vertices.map((v) => [v.x, v.y]));
  } else if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && e.vertices?.length >= 2) {
    const pts = e.vertices.map((v) => [v.x, v.y]);
    if (e.shape || e.closed) pts.push(pts[0]);
    adicionar(layer, pts);
  }
}
console.log(`linhas: ${total} (descartadas: ${descartadas})`);
if (!total) { console.error("nenhuma geometria útil — abortando"); process.exit(1); }

const fc = {
  type: "FeatureCollection",
  features: [...porLayer.entries()].map(([layer, linhas]) => ({
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: linhas },
    properties: { layer },
  })),
};
const json = JSON.stringify(fc);
console.log(`geojson: ${(json.length / 1024 / 1024).toFixed(1)} MB, ${fc.features.length} layers do CAD`);

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const slug = nomeMunicipio.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-");
const path = `cartografia/vetor/${slug}-${datumArg}.geojson`;
const { error: upErr } = await supa.storage.from("media").upload(path, Buffer.from(json), {
  contentType: "application/geo+json", upsert: true,
});
if (upErr) { console.error("upload falhou:", upErr.message); process.exit(1); }
console.log(`no storage: ${path}`);

const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
  user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();
const { rows: [mun] } = await db.query(`select id from municipalities where nome ilike $1`, [nomeMunicipio]);
if (!mun) { console.error(`município "${nomeMunicipio}" não cadastrado`); process.exit(1); }

await db.query(`delete from cartography_layers where municipality_id = $1 and tipo = 'vector'`, [mun.id]);
await db.query(
  `insert into cartography_layers (municipality_id, nome, tipo, source_path, tiles_path, status, min_zoom, max_zoom, opacidade_padrao, datum)
   values ($1, $2, 'vector', $3, $3, 'pronto', 12, 19, 0.85, $4)`,
  [mun.id, nomeCamada ?? `Planta ${nomeMunicipio}`, path, datumArg]);
await db.end();
console.log(`camada registrada para ${nomeMunicipio} (datum ${datumArg}) — já aparece no mapa`);
