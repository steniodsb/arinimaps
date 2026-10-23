// Carrega do IBGE para o banco (migration 0051): biomas oficiais, malha dos
// municípios e indicadores municipais. Itens 4 e 8 do levantamento do Carlos.
//
// Uso: node scripts/ibge-importa.mjs [biomas] [municipios] [indicadores]   (sem argumento = tudo)
//
// Quando rodar de novo: biomas só se o IBGE publicar edição nova (rara);
// municípios quando surgir município novo; indicadores uma vez por ano, depois
// que o IBGE divulga a estimativa de população (ago) e o PIB dos Municípios (dez).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const partes = process.argv.slice(2);
const tudo = !partes.length;
const UA = { "User-Agent": "AriniImoveisBrasil/1.0 (contato@arinibrasil.com.br)" };

async function conectar() {
  const ref = process.env.SUPABASE_PROJECT_REF;
  for (const h of [
    { host: `db.${ref}.supabase.co`, user: "postgres" },
    { host: "aws-0-sa-east-1.pooler.supabase.com", user: `postgres.${ref}` },
    { host: "aws-1-sa-east-1.pooler.supabase.com", user: `postgres.${ref}` },
  ]) {
    const c = new pg.Client({ ...h, port: 5432, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres",
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000, statement_timeout: 600_000 });
    try { await c.connect(); return c; } catch { /* próximo */ }
  }
  throw new Error("nenhum host de banco acessível");
}

async function json(url, tentativas = 3) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(600_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 3000 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${ultimo?.message ?? ultimo}`);
}

const db = await conectar();
const t0 = Date.now();
const passo = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

// ---------------------------------------------------------------------------
// Biomas (CREN:lm_bioma_250, 6 feições, ~33 MB)
// ---------------------------------------------------------------------------
if (tudo || partes.includes("biomas")) {
  passo("biomas: baixando do GeoServer do IBGE…");
  const fc = await json("https://geoservicos.ibge.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetFeature" +
    "&typeName=CREN:lm_bioma_250&outputFormat=application/json");
  if (fc.features?.length !== 6) throw new Error(`esperava 6 biomas, vieram ${fc.features?.length}`);
  const fonte = "IBGE — Biomas do Brasil, escala 1:250.000 (CREN:lm_bioma_250)";
  for (const f of fc.features) {
    const { bioma, cd_bioma, area_km } = f.properties;
    // SIRGAS 2000 (4674) e WGS 84 diferem em centímetros: gravado como 4326, como o resto do sistema
    await db.query(`
      insert into ibge_biomas (cd_bioma, nome, geom, area_km2, fonte, importado_em)
      values ($1, $2, st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson($3), 4326)), 3)), $4, $5, now())
      on conflict (cd_bioma) do update set nome = excluded.nome, geom = excluded.geom,
        area_km2 = excluded.area_km2, fonte = excluded.fonte, importado_em = now()`,
      [cd_bioma, bioma, JSON.stringify(f.geometry), area_km ?? null, fonte]);
    await db.query(`update ibge_biomas set geom_mapa =
      st_multi(st_collectionextract(st_makevalid(st_simplifypreservetopology(geom, 0.008)), 3)) where cd_bioma = $1`, [cd_bioma]);
    await db.query(`delete from ibge_biomas_partes where cd_bioma = $1`, [cd_bioma]);
    const { rowCount } = await db.query(`
      insert into ibge_biomas_partes (cd_bioma, nome, geom)
      select cd_bioma, nome, d.geom from ibge_biomas, lateral st_subdivide(geom, 256) as d(geom)
      where cd_bioma = $1 and st_geometrytype(d.geom) = 'ST_Polygon'`, [cd_bioma]);
    passo(`  ${bioma}: ${rowCount} pedaços`);
  }
}

// ---------------------------------------------------------------------------
// Municípios: nome e UF (localidades) + malha intermediária do país inteiro
// ---------------------------------------------------------------------------
if (tudo || partes.includes("municipios")) {
  passo("municípios: baixando localidades e malha…");
  const [lista, malha] = await Promise.all([
    json("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"),
    json("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=intermediaria&formato=application/vnd.geo+json"),
  ]);
  const geoPor = new Map(malha.features.map((f) => [Number(f.properties.codarea), f.geometry]));
  const linhas = lista.map((m) => ({
    cod: Number(m["municipio-id"]), nome: String(m["municipio-nome"]), uf: String(m["UF-sigla"]),
    geo: geoPor.get(Number(m["municipio-id"])) ?? null,
  }));
  const semMalha = linhas.filter((l) => !l.geo).map((l) => `${l.nome}/${l.uf}`);
  for (let i = 0; i < linhas.length; i += 250) {
    await db.query(`
      insert into ibge_municipios (cod_ibge, nome, uf, geom, malha_em)
      select (x->>'cod')::int, x->>'nome', x->>'uf',
             case when x->'geo' = 'null'::jsonb then null
                  else st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(x->>'geo'), 4326)), 3)) end,
             case when x->'geo' = 'null'::jsonb then null else now() end
      from jsonb_array_elements($1::jsonb) x
      on conflict (cod_ibge) do update set nome = excluded.nome, uf = excluded.uf,
        geom = coalesce(excluded.geom, ibge_municipios.geom), malha_em = coalesce(excluded.malha_em, ibge_municipios.malha_em)`,
      [JSON.stringify(linhas.slice(i, i + 250))]);
  }
  passo(`  ${linhas.length} municípios; sem malha no IBGE: ${semMalha.length ? semMalha.join(", ") : "nenhum"}`);
}

// ---------------------------------------------------------------------------
// Indicadores (SIDRA): cada um guarda valor, ano, unidade e a tabela de origem
// ---------------------------------------------------------------------------
if (tudo || partes.includes("indicadores")) {
  passo("indicadores: baixando do SIDRA…");
  const sidra = (caminho) => json(`https://apisidra.ibge.gov.br/values/${caminho}`).then((rs) => rs.slice(1));
  const [censo, estimada, pib] = await Promise.all([
    sidra("t/4714/n6/all/v/93,6318,614/p/2022"),
    sidra("t/6579/n6/all/v/9324/p/last"),
    sidra("t/5938/n6/all/v/37,516/p/last%203"),
  ]);
  // "..." (não disponível), "-" (zero ou não se aplica) e "X" (sigilo) viram vazio
  const num = (v) => (/^-?\d+(\.\d+)?$/.test(String(v ?? "")) ? Number(v) : null);
  const ind = new Map();
  const por = (cod) => { if (!ind.has(cod)) ind.set(cod, {}); return ind.get(cod); };
  const CHAVE = {
    "4714:93": ["populacao_censo", "pessoas", "IBGE — Censo Demográfico (tabela 4714)"],
    "4714:6318": ["area_km2", "km²", "IBGE — Censo Demográfico (tabela 4714)"],
    "4714:614": ["densidade", "hab/km²", "IBGE — Censo Demográfico (tabela 4714)"],
    "6579:9324": ["populacao_estimada", "pessoas", "IBGE — Estimativas da população (tabela 6579)"],
    "5938:37": ["pib_mil_reais", "mil R$", "IBGE — PIB dos Municípios (tabela 5938)"],
    "5938:516": ["agropecuaria_pct", "% do valor adicionado", "IBGE — PIB dos Municípios (tabela 5938)"],
  };
  const juntar = (tabela, linhas) => {
    for (const r of linhas) {
      const v = num(r.V);
      const def = CHAVE[`${tabela}:${r.D2C}`];
      if (!def || v == null) continue;
      const alvo = por(Number(r.D1C));
      const ano = Number(r.D3C);
      // várias janelas de ano (PIB): fica o ano mais recente que tem valor
      if (alvo[def[0]] && alvo[def[0]].ano >= ano) continue;
      alvo[def[0]] = { valor: v, ano, unidade: def[1], fonte: def[2] };
    }
  };
  juntar("4714", censo); juntar("6579", estimada); juntar("5938", pib);

  // PIB per capita do mesmo ano do Censo (2022): PIB e população contados no mesmo ano
  for (const r of pib.filter((x) => x.D2C === "37" && x.D3C === "2022")) {
    const alvo = por(Number(r.D1C));
    const v = num(r.V);
    const pop = alvo.populacao_censo?.valor;
    if (v != null && pop) {
      alvo.pib_per_capita = { valor: Math.round((v * 1000) / pop), ano: 2022, unidade: "R$ por habitante",
        fonte: "IBGE — PIB dos Municípios (5938) ÷ Censo 2022 (4714)" };
    }
  }

  const linhas = [...ind.entries()].map(([cod, i]) => ({ cod, i }));
  let atualizados = 0;
  for (let k = 0; k < linhas.length; k += 500) {
    const { rowCount } = await db.query(`
      update ibge_municipios m set indicadores = x.i, indicadores_em = now()
      from jsonb_to_recordset($1::jsonb) as x(cod int, i jsonb) where m.cod_ibge = x.cod`,
      [JSON.stringify(linhas.slice(k, k + 500))]);
    atualizados += rowCount;
  }
  const { rows: [conf] } = await db.query(`select indicadores from ibge_municipios where cod_ibge = 3134400`);
  passo(`  ${atualizados} municípios com indicadores. Iturama: ${JSON.stringify(Object.fromEntries(
    Object.entries(conf?.indicadores ?? {}).map(([k, v]) => [k, `${v.valor} (${v.ano})`])))}`);
}

await db.end();
passo("pronto.");
