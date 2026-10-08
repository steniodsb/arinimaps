// Expansão para uma nova região (roadmap 2.13): todos os municípios num raio a
// partir de uma cidade-polo, com a malha oficial do IBGE.
//
// Por padrão é ENSAIO: lista o que entraria (nome, UF, distância) e não grava.
// A malha do CAR não é importada no banco: o mapa usa o arquivo nacional
// (scripts/car-nacional) e, sem ele, a busca sob demanda no SICAR. Importar o
// CAR de 100+ municípios no banco custaria centenas de MB (docs/DIMENSIONAMENTO.md).
//
// Uso:
//   node scripts/nova-regiao.mjs --polo 3127107 --raio 150                  # ensaio (Frutal, 150 km)
//   node scripts/nova-regiao.mjs --polo 3127107 --raio 150 --nome "Região de Frutal" --executar
//   node scripts/nova-regiao.mjs ... --executar --inativa     # grava sem aparecer no site (municípios ativo = false)
//   node scripts/nova-regiao.mjs --remover "Região de Frutal" # desfaz (só municípios sem imóvel/planta)
//
// Depois de gravar: Central › Regiões e CAR mostra a região; ativar = marcar os
// municípios como ativos ali (ou rodar de novo sem --inativa). Plantas urbanas
// entram pela Cartografia, cidade a cidade.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { centroid, distance } from "@turf/turf";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const args = process.argv.slice(2);
const opcao = (n, p) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : p; };
const EXECUTAR = args.includes("--executar");
const INATIVA = args.includes("--inativa");
const REMOVER = opcao("remover", null);

const IBGE = "https://servicodados.ibge.gov.br/api";
const json = async (url) => {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.ok) return r.json();
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 1500 * (t + 1)));
  }
  throw new Error(`IBGE não respondeu: ${url}`);
};
const geometria = (malha) => malha?.features?.[0]?.geometry ?? malha?.geometry
  ?? (["Polygon", "MultiPolygon"].includes(malha?.type) ? malha : null);

const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

// ---------------------------------------------------------------- remover
if (REMOVER) {
  const { rows: [r] } = await db.query(`select id from regions where nome = $1`, [REMOVER]);
  if (!r) { console.log(`região "${REMOVER}" não existe`); process.exit(0); }
  const { rowCount } = await db.query(`
    delete from municipalities m where m.region_id = $1
      and not exists (select 1 from properties p where p.municipality_id = m.id)
      and not exists (select 1 from cartography_layers c where c.municipality_id = m.id)`, [r.id]);
  const { rows: [{ n }] } = await db.query(`select count(*)::int n from municipalities where region_id = $1`, [r.id]);
  if (!n) await db.query(`delete from regions where id = $1`, [r.id]);
  console.log(`${rowCount} município(s) removido(s)${n ? `; ${n} ficaram (têm imóvel ou planta)` : "; região removida"}`);
  await db.end();
  process.exit(0);
}

// ---------------------------------------------------------------- levantar
const POLO = opcao("polo", null);
const RAIO = Number(opcao("raio", 150));
if (!/^\d{7}$/.test(POLO ?? "")) { console.error("informe --polo <código IBGE de 7 dígitos>"); process.exit(1); }

const meta = await json(`${IBGE}/v1/localidades/municipios/${POLO}`);
const ufPolo = meta.microrregiao?.mesorregiao?.UF?.sigla ?? meta["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla;
const centro = centroid(geometria(await json(`${IBGE}/v3/malhas/municipios/${POLO}?formato=application/vnd.geo+json`)));
const NOME = opcao("nome", `Região de ${meta.nome}`);

// UFs cujo território pode estar no raio: a do polo e as vizinhas (o raio de
// 150 km de Frutal pega SP e GO; o IBGE devolve a malha de uma UF por pedido)
const VIZINHAS = {
  MG: ["SP", "GO", "MS", "RJ", "ES", "BA", "DF"], SP: ["MG", "PR", "MS", "RJ"], GO: ["MG", "MS", "MT", "TO", "BA", "DF"],
  MS: ["MG", "SP", "GO", "MT", "PR"], PR: ["SP", "MS", "SC"], MT: ["GO", "MS", "RO", "AM", "PA", "TO"],
};
const ufs = [ufPolo, ...(VIZINHAS[ufPolo] ?? [])];
const nomes = new Map();
const candidatos = [];
for (const uf of ufs) {
  const malha = await json(`${IBGE}/v3/malhas/estados/${uf}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`);
  for (const f of malha.features ?? []) {
    const d = distance(centro, centroid(f), { units: "kilometers" });
    if (d <= RAIO) candidatos.push({ codigo: String(f.properties.codarea), uf, d });
  }
  for (const m of await json(`${IBGE}/v1/localidades/estados/${uf}/municipios`)) nomes.set(String(m.id), m.nome);
}
candidatos.sort((a, b) => a.d - b.d);
const { rows: existentes } = await db.query(`select codigo_ibge from municipalities`);
const ja = new Set(existentes.map((e) => e.codigo_ibge));

console.log(`${NOME}: ${candidatos.length} municípios a até ${RAIO} km de ${meta.nome}/${ufPolo} (sede pelo centro da malha)`);
const porUf = {};
for (const c of candidatos) porUf[c.uf] = (porUf[c.uf] ?? 0) + 1;
console.log("por UF:", JSON.stringify(porUf), `· já cadastrados: ${candidatos.filter((c) => ja.has(c.codigo)).length}`);
for (const c of candidatos.slice(0, 12)) console.log(`  ${Math.round(c.d).toString().padStart(3)} km  ${nomes.get(c.codigo)}/${c.uf}${ja.has(c.codigo) ? " (já existe)" : ""}`);
if (candidatos.length > 12) console.log(`  … e mais ${candidatos.length - 12}`);

if (!EXECUTAR) {
  console.log("\nENSAIO — nada gravado. Para gravar: --executar (e --inativa para não aparecer no site ainda).");
  await db.end();
  process.exit(0);
}

// ---------------------------------------------------------------- gravar
let { rows: [regiao] } = await db.query(`select id from regions where nome = $1`, [NOME]);
if (!regiao) ({ rows: [regiao] } = await db.query(`insert into regions (nome, ativa) values ($1, $2) returning id`, [NOME, !INATIVA]));
let gravados = 0, falhas = 0;
for (const c of candidatos.filter((x) => !ja.has(x.codigo))) {
  try {
    const geom = geometria(await json(`${IBGE}/v3/malhas/municipios/${c.codigo}?formato=application/vnd.geo+json&qualidade=intermediaria`));
    if (!geom) throw new Error("malha vazia");
    await db.query(`select fn_inserir_municipio($1, $2, $3, $4, $5::jsonb)`,
      [regiao.id, nomes.get(c.codigo), c.uf, c.codigo, JSON.stringify(geom)]);
    if (INATIVA) await db.query(`update municipalities set ativo = false where codigo_ibge = $1`, [c.codigo]);
    gravados++;
    process.stdout.write(`\r${gravados} gravados`);
  } catch (e) {
    falhas++;
    console.error(`\n${nomes.get(c.codigo)}: ${e.message}`);
  }
}
console.log(`\n${gravados} município(s) gravado(s) em "${NOME}"${INATIVA ? " (inativos: não aparecem no site)" : ""}, ${falhas} falha(s).`);
await db.end();
