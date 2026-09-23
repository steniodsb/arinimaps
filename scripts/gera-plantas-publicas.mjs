// Gera a versão pública (já filtrada) das plantas que têm camadas do CAD ocultas.
//
// POR QUE EXISTE. A partir da 0019, salvar a seleção de camadas na calibração
// grava um GeoJSON sem as camadas escondidas (src/lib/geo/plantaPublica.ts).
// Plantas calibradas ANTES disso — Iturama, com as 10 camadas de paisagismo
// ocultas — só ganham o arquivo filtrado quando alguém salva de novo. Este
// script faz isso de uma vez, com a mesma regra da rota.
//
// Uso: node scripts/gera-plantas-publicas.mjs [--forcar] [--ensaio]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const forcar = process.argv.includes("--forcar");
const ensaio = process.argv.includes("--ensaio");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Mesmo cálculo de centroDe() em src/lib/geo/deslocar.ts: média do bbox. */
function centroDe(fc) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const olhar = (c) => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [x, y] = c;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      return;
    }
    if (Array.isArray(c)) for (const f of c) olhar(f);
  };
  for (const f of fc.features) if (f.geometry && "coordinates" in f.geometry) olhar(f.geometry.coordinates);
  return x0 > x1 ? [0, 0] : [(x0 + x1) / 2, (y0 + y1) / 2];
}

const { data: camadas, error } = await admin.from("cartography_layers")
  .select("id, nome, tiles_path, bytes, layers_ocultos, publico_path")
  .eq("tipo", "vector").eq("status", "pronto").not("tiles_path", "is", null);
if (error) throw error;

for (const c of camadas) {
  const ocultos = c.layers_ocultos ?? [];
  if (!ocultos.length) { console.log(`— ${c.nome}: nenhuma camada oculta, o público é o original`); continue; }
  if (c.publico_path && !forcar) { console.log(`— ${c.nome}: já tem versão pública (use --forcar)`); continue; }

  const { data: arq, error: e1 } = await admin.storage.from("media").download(c.tiles_path);
  if (e1) { console.log(`✗ ${c.nome}: ${e1.message}`); continue; }
  const fc = JSON.parse(await arq.text());
  const centro = centroDe(fc);
  const esconder = new Set(ocultos);
  const features = fc.features.filter((f) => !esconder.has(String(f.properties?.layer ?? "")));
  const corpo = Buffer.from(JSON.stringify({ ...fc, features }));
  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  console.log(`• ${c.nome}: ${fc.features.length} → ${features.length} linhas, ${mb(c.bytes ?? 0)} → ${mb(corpo.length)} (centro ${centro.map((n) => n.toFixed(5)).join(", ")})`);
  if (ensaio) continue;

  const path = c.tiles_path.replace(/\.geojson$/, "") + `.publico-${Date.now()}.geojson`;
  const { error: e2 } = await admin.storage.from("media").upload(path, corpo, { contentType: "application/geo+json", upsert: true });
  if (e2) { console.log(`✗ upload: ${e2.message}`); continue; }
  const { error: e3 } = await admin.from("cartography_layers")
    .update({ publico_path: path, publico_bytes: corpo.length, publico_centro: centro }).eq("id", c.id);
  if (e3) { console.log(`✗ banco: ${e3.message}`); continue; }
  if (c.publico_path) await admin.storage.from("media").remove([c.publico_path]);
  console.log(`  ✓ publicado em ${path}`);
}
