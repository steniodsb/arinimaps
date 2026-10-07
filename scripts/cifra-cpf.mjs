// Cifra os CPF/CNPJ que ainda estão em claro em `profiles` e, na rotação de
// chave, regrava os cifrados com a chave nova (item 6.5 — docs/SEGURANCA.md §11).
//
// Uso (com CAMPO_CRIPTO_CHAVE no .env.local ou no ambiente):
//   node scripts/cifra-cpf.mjs            → simula: diz quantos seriam regravados
//   node scripts/cifra-cpf.mjs --aplicar  → regrava
//
// Na rotação: CAMPO_CRIPTO_CHAVE = nova, CAMPO_CRIPTO_CHAVE_ANTERIOR = velha.
// A derivação das chaves é a MESMA de src/lib/seguranca/cripto.ts — se mudar
// lá, muda aqui.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const aplicar = process.argv.includes("--aplicar");

function derivar(segredo) {
  const bruto = Buffer.from(segredo, "base64").length >= 32 ? Buffer.from(segredo, "base64") : Buffer.from(segredo, "utf8");
  const cifra = Buffer.from(hkdfSync("sha256", bruto, "arini-maps", "campo:cifra:v1", 32));
  const hmac = Buffer.from(hkdfSync("sha256", bruto, "arini-maps", "campo:hmac:v1", 32));
  return { id: createHash("sha256").update(cifra).digest("hex").slice(0, 8), cifra, hmac };
}
const atualBruta = process.env.CAMPO_CRIPTO_CHAVE ?? "";
if (atualBruta.length < 16) { console.error("CAMPO_CRIPTO_CHAVE ausente ou curta (use: openssl rand -base64 32)."); process.exit(1); }
const atual = derivar(atualBruta);
const anterior = (process.env.CAMPO_CRIPTO_CHAVE_ANTERIOR ?? "").length >= 16 ? derivar(process.env.CAMPO_CRIPTO_CHAVE_ANTERIOR) : null;

const cifrar = (texto) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", atual.cifra, iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["enc1", atual.id, iv.toString("base64url"), c.getAuthTag().toString("base64url"), corpo.toString("base64url")].join(":");
};
const decifrar = (valor) => {
  const [, id, iv, tag, corpo] = valor.split(":");
  const k = [atual, anterior].find((x) => x?.id === id);
  if (!k) throw new Error(`chave ${id} desconhecida — configure CAMPO_CRIPTO_CHAVE_ANTERIOR`);
  const d = createDecipheriv("aes-256-gcm", k.cifra, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8");
};
const hash = (v) => createHmac("sha256", atual.hmac).update(v.normalize("NFKC")).digest("hex");

const ref = process.env.SUPABASE_PROJECT_REF;
const candidatos = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  { host: "aws-0-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
  { host: "aws-1-sa-east-1.pooler.supabase.com", port: 5432, user: `postgres.${ref}` },
];
let db = null;
for (const c of candidatos) {
  const cl = new pg.Client({ ...c, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
  try { await cl.connect(); db = cl; break; } catch { /* próximo */ }
}
if (!db) { console.error("nenhum host de banco acessível"); process.exit(1); }

const { rows } = await db.query(`
  select user_id, cpf_cnpj, cpf_cnpj_cifrado from profiles
  where cpf_cnpj is not null or (cpf_cnpj_cifrado is not null and split_part(cpf_cnpj_cifrado, ':', 2) <> $1)`, [atual.id]);
console.log(`${rows.length} perfil(is) a regravar com a chave ${atual.id}.`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para gravar."); await db.end(); process.exit(0); }

let ok = 0, erro = 0;
await db.query("begin");
try {
  for (const r of rows) {
    const valor = r.cpf_cnpj ?? decifrar(r.cpf_cnpj_cifrado);
    await db.query(`update profiles set cpf_cnpj = null, cpf_hash = $2, cpf_cnpj_cifrado = $3 where user_id = $1`,
      [r.user_id, hash(valor), cifrar(valor)]);
    ok++;
  }
  await db.query("commit");
} catch (e) {
  erro++;
  await db.query("rollback");
  console.error("ERRO — nada foi gravado:", e.message);
}
console.log(erro ? "Abortado." : `${ok} perfil(is) regravado(s).`);
await db.end();
