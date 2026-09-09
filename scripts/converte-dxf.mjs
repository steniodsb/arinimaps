// Converte planta DXF georreferenciada em GeoJSON WGS84, sobe para o storage
// e registra como camada vetorial de cartografia.
//
// Uso: node --max-old-space-size=8192 scripts/converte-dxf.mjs <arquivo.dxf> "<Município>" ["<Nome>"] [datum] [zona]
//   datum: sirgas (padrão) | sad69 | corrego
//   zona:  22 (padrão para o Pontal do Triângulo)
//   DRY=1 → só converte e grava o GeoJSON em <arquivo>.geojson; não sobe nem registra.
//
// O que entra no mapa: LINE, LWPOLYLINE/POLYLINE (com bulge → arco), ARC e
// CIRCLE do model space, mais o conteúdo dos blocos inseridos (INSERT), com
// blocos aninhados resolvidos e a transformação posição/escala/rotação
// aplicada. Paper space, textos e hachuras ficam de fora.
import { readFileSync, writeFileSync } from "node:fs";
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
const DRY = process.env.DRY === "1";

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
const blocos = dxf.blocks ?? {};

// ---------- geometria em coordenadas UTM ----------

// Arco de círculo discretizado: um ponto a cada ~PASSO_M metros, entre 6 e 64 pontos.
const PASSO_M = 1.0;
function arco(cx, cy, r, a0, a1) {
  let delta = a1 - a0;
  if (delta <= 0) delta += Math.PI * 2;
  const n = Math.max(6, Math.min(64, Math.ceil((delta * r) / PASSO_M)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (delta * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Trecho entre dois vértices de polilinha: reto, ou arco se houver bulge.
function trecho(p, q, bulge) {
  if (!bulge) return [p, q];
  const [x1, y1] = p, [x2, y2] = q;
  const dx = x2 - x1, dy = y2 - y1;
  const corda = Math.hypot(dx, dy);
  if (corda < 1e-9) return [p, q];
  const theta = 4 * Math.atan(bulge); // ângulo total do arco (sinal = sentido)
  const r = corda / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (corda / 2) ** 2)); // centro ao meio da corda
  const sinal = theta > 0 ? 1 : -1;
  const cx = mx - (sinal * h * dy) / corda;
  const cy = my + (sinal * h * dx) / corda;
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const n = Math.max(2, Math.min(48, Math.ceil((Math.abs(theta) * r) / PASSO_M)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (theta * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function polilinha(vs, fechada) {
  const out = [];
  for (let i = 0; i < vs.length - 1; i++) {
    const seg = trecho([vs[i].x, vs[i].y], [vs[i + 1].x, vs[i + 1].y], vs[i].bulge);
    if (out.length) seg.shift();
    out.push(...seg);
  }
  if (fechada && vs.length > 2) {
    const seg = trecho([vs[vs.length - 1].x, vs[vs.length - 1].y], [vs[0].x, vs[0].y], vs[vs.length - 1].bulge);
    seg.shift();
    out.push(...seg);
  }
  return out;
}

// Transformação afim 2D (matriz [a b c d] + translação [tx ty]) para blocos.
const IDENT = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const aplicar = (T, [x, y]) => [T.a * x + T.b * y + T.tx, T.c * x + T.d * y + T.ty];
// compõe: primeiro U (interna), depois T (externa)
const compor = (T, U) => ({
  a: T.a * U.a + T.b * U.c, b: T.a * U.b + T.b * U.d,
  c: T.c * U.a + T.d * U.c, d: T.c * U.b + T.d * U.d,
  tx: T.a * U.tx + T.b * U.ty + T.tx, ty: T.c * U.tx + T.d * U.ty + T.ty,
});
function transformInsert(ins, bloco) {
  const sx = ins.xScale ?? 1, sy = ins.yScale ?? 1;
  const rot = ((ins.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const bx = bloco.position?.x ?? 0, by = bloco.position?.y ?? 0;
  const px = ins.position?.x ?? 0, py = ins.position?.y ?? 0;
  // p' = ins + R·S·(p − base)
  const a = cos * sx, b = -sin * sy, c = sin * sx, d = cos * sy;
  return { a, b, c, d, tx: px - (a * bx + b * by), ty: py - (c * bx + d * by) };
}

// ---------- símbolos ----------
// Bloco pequeno inserido muitas vezes é símbolo decorativo (árvore, palmeira,
// mesa, etiqueta de lote) e não vai para o mapa. Loteamento é grande e entra
// uma vez. IGNORAR="nome1,nome2" força a exclusão pelo nome.
const SIMBOLO_MAX_M = Number(process.env.SIMBOLO_MAX_M ?? 30);
const SIMBOLO_MIN_INSERTS = Number(process.env.SIMBOLO_MIN_INSERTS ?? 2);
const ignorarNomes = new Set((process.env.IGNORAR ?? "").split(",").map((s) => s.trim()).filter(Boolean));
// Layers de paisagismo/arborização (por nome) também ficam de fora — o mapa
// imobiliário precisa de ruas, quadras e lotes, não das copas das árvores.
const LAYERS_IGNORAR = new RegExp(
  process.env.LAYERS_IGNORAR ??
    "paisagismo|jardin|arbor|arvore|árvore|tronco|copa|folhag|vegeta|grama|palm|coqueiro|coco|pau_brasil|acerola|amora|quaresmeira|ipe|ipê|sibipiruna|oiti|manga",
  "i"
);

function extensaoBloco(nome, prof = 0) {
  const b = blocos[nome];
  if (!b?.entities || prof > 8) return 0;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  };
  for (const e of b.entities) {
    if (e.vertices) for (const v of e.vertices) add(v.x, v.y);
    else if (e.center && e.radius) { add(e.center.x - e.radius, e.center.y - e.radius); add(e.center.x + e.radius, e.center.y + e.radius); }
    else if (e.type === "INSERT" && e.position) { const s = extensaoBloco(e.name, prof + 1); add(e.position.x, e.position.y); add(e.position.x + s, e.position.y + s); }
  }
  return minx === Infinity ? 0 : Math.max(maxx - minx, maxy - miny);
}
// usos de cada bloco em toda a árvore (um bloco de árvore repetido 5× dentro
// de um loteamento inserido 1× conta 5)
const insertsPorBloco = new Map();
function contarUsos(entidades, mult, prof) {
  for (const e of entidades ?? []) {
    if (e.type !== "INSERT" || !e.name || e.inPaperSpace) continue;
    insertsPorBloco.set(e.name, (insertsPorBloco.get(e.name) ?? 0) + mult);
    if (prof < 8 && blocos[e.name]?.entities) contarUsos(blocos[e.name].entities, mult, prof + 1);
  }
}
contarUsos(dxf.entities, 1, 0);
const simbolos = new Set(ignorarNomes);
for (const [nome, n] of insertsPorBloco) {
  if (n >= SIMBOLO_MIN_INSERTS && extensaoBloco(nome) < SIMBOLO_MAX_M) simbolos.add(nome);
}
if (simbolos.size) console.log(`símbolos ignorados (${simbolos.size}): ${[...simbolos].map((n) => `${n} ×${insertsPorBloco.get(n) ?? 0}`).join(", ")}`);
const layersIgnorados = new Map();

// ---------- varredura ----------

const porLayer = new Map();
const stats = { modelo: 0, blocos: 0, descartadas: 0, inserts: 0, blocosSemDef: new Set(), porBloco: new Map(), tipos: {} };

function adicionar(layer, pontos, origem, tipo) {
  const validos = pontos.filter(dentro);
  if (validos.length < 2) { stats.descartadas++; return; }
  const linha = validos.map((p) => paraWgs84(p).map(arred));
  if (!porLayer.has(layer)) porLayer.set(layer, []);
  porLayer.get(layer).push(linha);
  stats[origem]++;
  stats.tipos[tipo] = (stats.tipos[tipo] ?? 0) + 1;
}

function varrer(entidades, T, layerHerdado, origem, profundidade, blocoPai) {
  for (const e of entidades ?? []) {
    if (e.inPaperSpace) continue;
    // dentro de bloco, layer "0" herda o layer do INSERT (convenção do DXF)
    const layer = layerHerdado && (!e.layer || e.layer === "0") ? layerHerdado : (e.layer ?? "0");
    let pts = null;
    if (e.type === "LINE" && e.vertices?.length >= 2) {
      pts = e.vertices.map((v) => [v.x, v.y]);
    } else if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && e.vertices?.length >= 2) {
      pts = polilinha(e.vertices, !!(e.shape || e.closed));
    } else if (e.type === "ARC" && e.center && e.radius > 0) {
      pts = arco(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? Math.PI * 2);
    } else if (e.type === "CIRCLE" && e.center && e.radius > 0) {
      pts = arco(e.center.x, e.center.y, e.radius, 0, Math.PI * 2);
    } else if (e.type === "INSERT" && e.name) {
      if (profundidade > 8) continue; // proteção contra ciclos
      if (simbolos.has(e.name)) continue;
      const bloco = blocos[e.name];
      if (!bloco?.entities) { stats.blocosSemDef.add(e.name); continue; }
      stats.inserts++;
      const cols = Math.max(1, e.columnCount ?? 1), rows = Math.max(1, e.rowCount ?? 1);
      const layerIns = e.layer && e.layer !== "0" ? e.layer : layerHerdado;
      for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
        const ins = cols > 1 || rows > 1
          ? { ...e, position: { x: (e.position?.x ?? 0) + ci * (e.columnSpacing ?? 0), y: (e.position?.y ?? 0) + ri * (e.rowSpacing ?? 0) } }
          : e;
        const antes = stats.blocos;
        varrer(bloco.entities, compor(T, transformInsert(ins, bloco)), layerIns, "blocos", profundidade + 1, e.name);
        const raiz = blocoPai ?? e.name;
        stats.porBloco.set(raiz, (stats.porBloco.get(raiz) ?? 0) + (stats.blocos - antes));
      }
      continue;
    }
    if (!pts) continue;
    if (LAYERS_IGNORAR.test(layer)) { layersIgnorados.set(layer, (layersIgnorados.get(layer) ?? 0) + 1); continue; }
    adicionar(layer, pts.map((p) => aplicar(T, p)), origem, e.type);
  }
}

varrer(dxf.entities, IDENT, null, "modelo", 0, null);

if (layersIgnorados.size) {
  const lista = [...layersIgnorados.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ");
  console.log(`layers de vegetação ignorados (${layersIgnorados.size}): ${lista}`);
}
const total = stats.modelo + stats.blocos;
console.log(`linhas: ${total} (model space: ${stats.modelo} · via ${stats.inserts} blocos inseridos: ${stats.blocos} · descartadas fora da zona: ${stats.descartadas})`);
console.log(`por tipo: ${Object.entries(stats.tipos).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
const topBlocos = [...stats.porBloco.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
if (topBlocos.length) console.log(`blocos que mais contribuem: ${topBlocos.map(([k, v]) => `${k} (${v})`).join(", ")}`);
if (stats.blocosSemDef.size) console.log(`blocos referenciados sem definição (ignorados): ${[...stats.blocosSemDef].join(", ")}`);
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

if (DRY) {
  const saida = arquivoDxf.replace(/\.dxf$/i, "") + ".geojson";
  writeFileSync(saida, json);
  console.log(`DRY=1 — gravado em ${saida}; nada enviado.`);
  process.exit(0);
}

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
