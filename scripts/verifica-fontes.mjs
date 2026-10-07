// Teste de queda e lentidão das fontes oficiais (PENDENCIAS 3.16), à mão.
// Faz o mesmo que o job `verificar_fontes` do worker (a cada 6 h) e o botão
// "Verificar agora" de /admin/fontes: sonda cada fonte ativa com um envelope de
// ~2 km, grava em fontes_saude e recalcula a situação (3 falhas seguidas →
// instável).
//
// Uso: node scripts/verifica-fontes.mjs
//      node scripts/verifica-fontes.mjs --sem-gravar   (só mede, não toca no banco além de ler)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sondarFontes } from "../worker/jobs/sondaFonte.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
const gravar = !process.argv.includes("--sem-gravar");

// mesma ordem de tentativa do scripts/sql.mjs
const candidatos = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  { host: "aws-0-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
  { host: "aws-1-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
];
let db = null;
for (const c of candidatos) {
  const cl = new pg.Client({ ...c, password, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
  try { await cl.connect(); db = cl; break; } catch { /* próximo */ }
}
if (!db) { console.error("nenhum host de banco acessível"); process.exit(1); }

try {
  const { rows: fontes } = await db.query(
    "select id, nome, sonda_url from fontes_externas where ativa and sonda_url is not null order by prioridade");
  const resultados = await sondarFontes(fontes);
  console.log("FONTE".padEnd(16), "OK".padEnd(4), "HTTP".padEnd(5), "TEMPO".padStart(8), " SITUAÇÃO   ERRO");
  console.log("-".repeat(90));
  for (const r of resultados) {
    let situacao = "(não gravado)";
    if (gravar) {
      const { rows: [s] } = await db.query("select fn_fonte_saude_registrar($1,$2,$3,$4,$5,'script') as s",
        [r.fonte_id, r.ok, r.status_http, r.ms, r.erro]);
      situacao = s.s;
    }
    console.log(r.fonte_id.padEnd(16), (r.ok ? "sim" : "NÃO").padEnd(4), String(r.status_http ?? "—").padEnd(5),
      `${r.ms} ms`.padStart(8), "", situacao.padEnd(10), r.erro ?? "");
  }
  const ok = resultados.filter((r) => r.ok).length;
  const media = Math.round(resultados.filter((r) => r.ok).reduce((s, r) => s + r.ms, 0) / Math.max(1, ok));
  console.log(`\n${ok}/${resultados.length} fontes no ar · latência média ${media} ms`);
  process.exitCode = ok === resultados.length ? 0 : 1;
} finally {
  await db.end();
}
