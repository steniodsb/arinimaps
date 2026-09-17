// Preenche o retângulo (bbox) e o tamanho das plantas urbanas já publicadas.
//
// POR QUE EXISTE. O mapa só baixa a planta quando a cidade está na tela — e
// para saber isso ele precisa do retângulo dela. Plantas convertidas pelo
// conversor atual já gravam `diagnostico.bbox` no envio; as publicadas antes
// dele (Limeira do Oeste e União de Minas, agosto/2026) não têm diagnóstico
// nenhum, e sem retângulo o mapa carrega por precaução — que era justamente o
// peso que queríamos tirar.
//
// Lê o GeoJSON que já está no storage, mede, e grava. Não altera geometria.
//
// Uso: node scripts/completa-bbox.mjs [--forcar]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const forcar = process.argv.includes("--forcar");
const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media`;

const cliente = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await cliente.connect();

const { rows } = await cliente.query(`
  select id, nome, tiles_path, bytes, diagnostico
  from cartography_layers
  where tipo = 'vector' and status = 'pronto' and tiles_path is not null
  order by nome
`);

/** Percorre coordenadas aninhadas sem montar array intermediário. */
function medir(fc) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90, pontos = 0;
  const olhar = (c) => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [x, y] = c;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      pontos++;
      return;
    }
    if (Array.isArray(c)) for (const f of c) olhar(f);
  };
  const porLayer = new Map();
  for (const f of fc.features ?? []) {
    if (f.geometry?.coordinates) olhar(f.geometry.coordinates);
    const nome = String(f.properties?.layer ?? "(sem camada)");
    // conta segmentos, que é o que pesa no navegador — não feições
    const linhas = f.geometry?.type === "MultiLineString" ? f.geometry.coordinates.length : 1;
    porLayer.set(nome, (porLayer.get(nome) ?? 0) + linhas);
  }
  if (x0 > x1) return null;
  return {
    bbox: [x0, y0, x1, y1],
    pontos,
    layers: [...porLayer].map(([nome, linhas]) => ({ nome, linhas })).sort((a, b) => b.linhas - a.linhas),
  };
}

const kmEntre = (a, b) => {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  return Math.round(R * Math.hypot(dLng * Math.cos(lat), dLat) * 10) / 10;
};

for (const c of rows) {
  const jaTem = Array.isArray(c.diagnostico?.bbox) && c.diagnostico.bbox.length === 4;
  if (jaTem && !forcar) {
    console.log(`· ${c.nome} — já tem bbox, pulando (use --forcar para refazer)`);
    continue;
  }
  const url = `${base}/${c.tiles_path}`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    console.log(`! ${c.nome} — storage respondeu ${resposta.status} em ${c.tiles_path}`);
    continue;
  }
  const texto = await resposta.text();
  let fc;
  try { fc = JSON.parse(texto); } catch {
    console.log(`! ${c.nome} — o arquivo no storage não é JSON válido`);
    continue;
  }
  const m = medir(fc);
  if (!m) {
    console.log(`! ${c.nome} — nenhuma coordenada utilizável no arquivo`);
    continue;
  }
  const [x0, y0, x1, y1] = m.bbox;
  const diagnostico = {
    ...(c.diagnostico ?? {}),
    bbox: m.bbox,
    centro: [(x0 + x1) / 2, (y0 + y1) / 2],
    pontos: m.pontos,
    // só preenche a lista de camadas se ainda não houver uma vinda da conversão
    layers: c.diagnostico?.layers ?? m.layers,
    extensao_km: [kmEntre([x0, y0], [x1, y0]), kmEntre([x0, y0], [x0, y1])],
    medido_por: "scripts/completa-bbox.mjs",
    medido_em: new Date().toISOString(),
  };
  await cliente.query(
    `update cartography_layers set diagnostico = $2::jsonb, bytes = coalesce(bytes, $3) where id = $1`,
    [c.id, JSON.stringify(diagnostico), texto.length]
  );
  console.log(
    `✓ ${c.nome} — ${(texto.length / 1048576).toFixed(2)} MB · ` +
    `${diagnostico.extensao_km[0]}×${diagnostico.extensao_km[1]} km · ` +
    `${m.layers.length} camadas do CAD · ${m.pontos.toLocaleString("pt-BR")} pontos`
  );
}

await cliente.end();
