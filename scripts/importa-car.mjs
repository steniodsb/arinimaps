// Importa a malha do CAR (SICAR) dos municípios cadastrados para car_imoveis.
//
// Mesma regra de src/lib/geo/car.ts (que atende o botão em Admin › Regiões):
// pagina de 2.000 em 2.000 e confere o total contra `numberMatched` — se o
// SICAR informar N imóveis e menos forem gravados, o município acusa erro.
//
// Uso: node scripts/importa-car.mjs [codigo_ibge ...]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WFS = "https://geoserver.car.gov.br/geoserver/sicar/ows";
const PAGINA = 2000;
const so = process.argv.slice(2);

let q = admin.from("municipalities").select("nome, uf, codigo_ibge").order("nome");
if (so.length) q = q.in("codigo_ibge", so);
const { data: ms, error } = await q;
if (error) throw error;

for (const m of ms) {
  const t0 = Date.now();
  let inicio = 0, total = Infinity, gravados = 0;
  try {
    while (inicio < total) {
      const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=sicar:sicar_imoveis_${m.uf.toLowerCase()}` +
        `&outputFormat=application/json&count=${PAGINA}&startIndex=${inicio}&sortBy=cod_imovel&CQL_FILTER=cod_municipio_ibge=${Number(m.codigo_ibge)}`;
      const r = await fetch(url, { headers: { "User-Agent": "AriniMaps/1.0" }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`SICAR HTTP ${r.status}`);
      const fc = await r.json();
      total = Number(fc.numberMatched ?? fc.totalFeatures ?? fc.features.length);
      const { data, error: e } = await admin.rpc("fn_car_upsert", { p_fc: fc });
      if (e) throw new Error(e.message);
      gravados += Number(data ?? 0);
      if (!fc.features.length) break;
      inicio += fc.features.length;
    }
    const ok = gravados >= total;
    console.log(`${ok ? "✓" : "✗"} ${m.nome}: ${gravados}/${total} imóveis em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.log(`✗ ${m.nome}: ${e.message}`);
  }
}
