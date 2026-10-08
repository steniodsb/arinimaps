// Backup dos ARQUIVOS (fotos, vídeos, documentos, selfies, plantas) — o
// pg_dump só guarda o registro de cada arquivo, não o conteúdo.
//
// Cópia incremental de todos os buckets do Supabase Storage para a Cloudflare
// R2 (`backups/arquivos/<bucket>/<caminho>`): só sobe o que ainda não está lá
// ou mudou de tamanho. Arquivo apagado no Supabase NÃO é apagado na cópia por
// 30 dias (proteção contra exclusão por engano); depois sai.
// Os documentos e selfies vão para um bucket PRIVADO da R2, como estão no Supabase.
//
// Sem as variáveis da R2: modo ensaio (lista o que seria copiado).
// Variáveis: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_BACKUP (ou R2_BUCKET).
// Uso: node scripts/backup-arquivos.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const l of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* ambiente */ }

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

async function listar(bucket, prefixo = "") {
  const saida = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supa.storage.from(bucket).list(prefixo, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefixo}: ${error.message}`);
    for (const item of data ?? []) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      if (item.id === null) saida.push(...await listar(bucket, caminho)); // pasta
      else saida.push({ caminho, tamanho: Number(item.metadata?.size ?? 0) });
    }
    if ((data ?? []).length < 1000) break;
  }
  return saida;
}

const { data: buckets, error } = await supa.storage.listBuckets();
if (error) throw error;
const todos = [];
for (const b of buckets) {
  const arquivos = await listar(b.name);
  todos.push(...arquivos.map((a) => ({ ...a, bucket: b.name })));
  console.log(`${b.name}: ${arquivos.length} arquivos, ${(arquivos.reduce((s, a) => s + a.tamanho, 0) / 1e6).toFixed(1)} MB`);
}

const r2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].every((v) => process.env[v]);
const Bucket = process.env.R2_BUCKET_BACKUP ?? process.env.R2_BUCKET;
if (!r2 || !Bucket) {
  console.log("ENSAIO: R2 não configurada — nada copiado. Configure R2_* para a cópia externa.");
  process.exit(0);
}

const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const naCopia = new Map(); // chave → { tamanho, data }
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: "backups/arquivos/", ContinuationToken: token }));
  for (const o of r.Contents ?? []) naCopia.set(o.Key, { tamanho: o.Size, data: o.LastModified });
  token = r.NextContinuationToken;
} while (token);

let enviados = 0, bytes = 0;
const vivos = new Set();
for (const a of todos) {
  const chave = `backups/arquivos/${a.bucket}/${a.caminho}`;
  vivos.add(chave);
  if (naCopia.get(chave)?.tamanho === a.tamanho) continue;
  const { data, error: e } = await supa.storage.from(a.bucket).download(a.caminho);
  if (e) { console.error(`baixar ${a.bucket}/${a.caminho}: ${e.message}`); continue; }
  const corpo = Buffer.from(await data.arrayBuffer());
  await s3.send(new PutObjectCommand({ Bucket, Key: chave, Body: corpo, ContentType: data.type || undefined }));
  enviados++; bytes += corpo.length;
}

// apagados no Supabase há mais de 30 dias: saem da cópia (a marca é a data da última cópia)
const LIMITE = Date.now() - 30 * 86_400_000;
const orfaos = [...naCopia.entries()].filter(([k, v]) => !vivos.has(k) && new Date(v.data).getTime() < LIMITE).map(([k]) => ({ Key: k }));
for (let i = 0; i < orfaos.length; i += 1000) {
  await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: orfaos.slice(i, i + 1000) } }));
}
console.log(`${enviados} arquivo(s) novo(s)/alterado(s) copiado(s) (${(bytes / 1e6).toFixed(1)} MB) · ${orfaos.length} removido(s) da cópia`);
