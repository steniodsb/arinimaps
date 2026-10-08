// CAR nacional — passo 3: envia o PMTiles para a Cloudflare R2.
//
// Envio em partes (multipart, 64 MB cada): o arquivo do Brasil tem ~3–4 GB e
// uma conexão que cai no meio não perde o que já subiu. Grava com nome datado
// e só depois troca o `car-brasil.pmtiles` (cópia do lado do R2): quem está com
// o mapa aberto continua lendo um arquivo inteiro, nunca um pela metade.
//
// Variáveis: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// O endereço público (domínio ligado ao bucket) vai em NEXT_PUBLIC_CAR_NACIONAL_URL.
// Uso: node scripts/car-nacional/publicar.mjs [arquivo] [--dados ../dados]
import { createReadStream, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const raiz = resolve(import.meta.dirname, "../..");
try {
  for (const l of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* na VPS as variáveis vêm do ambiente */ }

const args = process.argv.slice(2);
const i = args.indexOf("--dados");
const DADOS = resolve(i >= 0 ? args[i + 1] : process.env.CAR_DADOS ?? "../dados");
const arquivo = resolve(args.find((a) => a.endsWith(".pmtiles")) ?? join(DADOS, "car-brasil.pmtiles"));

const faltam = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((v) => !process.env[v]);
if (faltam.length) {
  console.error(`Faltam variáveis da Cloudflare R2: ${faltam.join(", ")}`);
  process.exit(1);
}
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = process.env.R2_BUCKET;
const datado = `car/car-brasil-${new Date().toISOString().slice(0, 10)}.pmtiles`;
const tamanho = statSync(arquivo).size;

console.log(`enviando ${(tamanho / 1e9).toFixed(2)} GB para r2://${Bucket}/${datado}`);
const envio = new Upload({
  client: s3,
  params: { Bucket, Key: datado, Body: createReadStream(arquivo), ContentType: "application/octet-stream" },
  partSize: 64 * 1024 * 1024,
  queueSize: 4,
});
envio.on("httpUploadProgress", (p) => process.stdout.write(`\r${((p.loaded ?? 0) / tamanho * 100).toFixed(1)}%   `));
await envio.done();

// troca o nome fixo que o mapa lê; cache curto para a troca chegar em minutos
await s3.send(new CopyObjectCommand({
  Bucket, Key: "car/car-brasil.pmtiles", CopySource: `${Bucket}/${datado}`,
  MetadataDirective: "REPLACE", ContentType: "application/octet-stream", CacheControl: "public, max-age=3600",
}));
console.log(`\npublicado: car/car-brasil.pmtiles (cópia de ${datado})`);
