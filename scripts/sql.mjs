// Roda um SQL direto no banco (mesma conexão do migrate.mjs) e imprime as linhas.
// Uso: node scripts/sql.mjs "select count(*) from plans"
//      node scripts/sql.mjs --file consulta.sql
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const ref = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;
const sql = process.argv[2] === "--file" ? readFileSync(process.argv[3], "utf8") : process.argv.slice(2).join(" ");
if (!sql.trim()) { console.error("informe o SQL"); process.exit(1); }

const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  { host: "aws-0-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
  { host: "aws-1-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
];
let client = null;
for (const c of candidates) {
  const cl = new pg.Client({ host: c.host, port: c.port, user: c.user, password, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
  try { await cl.connect(); client = cl; break; } catch { /* tenta o próximo */ }
}
if (!client) { console.error("nenhum host de banco acessível"); process.exit(1); }
try {
  const r = await client.query(sql);
  const res = Array.isArray(r) ? r : [r];
  for (const x of res) if (x.rows) console.log(JSON.stringify(x.rows, null, 1));
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
