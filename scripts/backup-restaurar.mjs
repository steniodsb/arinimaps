// Restauração do backup (roadmap 1.6 e 9.6).
//
//   node scripts/backup-restaurar.mjs <arquivo.dump.enc> --conferir
//       decifra e confere o arquivo (integridade AES-GCM + índice do pg_restore),
//       sem gravar em banco nenhum. Rodar todo mês: backup que não abre não é backup.
//   node scripts/backup-restaurar.mjs <public.dump.enc> --destino <postgres://...>
//       restaura num banco VAZIO com PostGIS (projeto Supabase novo ou o container
//       postgis/postgis na VPS). Nunca na homologação: lá não entra dado real (LGPD).
//
// Variáveis: BACKUP_CHAVE (a mesma do backup), PG_RESTORE (caminho, se não estiver no PATH).
import { createDecipheriv, scryptSync } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, statSync, createReadStream, createWriteStream, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const l of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* ambiente */ }
const [arquivo, ...resto] = process.argv.slice(2);
const iDestino = resto.indexOf("--destino");
const destino = iDestino >= 0 ? resto[iDestino + 1] : null;
const PG_RESTORE = process.env.PG_RESTORE ?? "pg_restore";
if (!arquivo || !process.env.BACKUP_CHAVE) { console.error("uso: backup-restaurar.mjs <arquivo.enc> --conferir | --destino <url>  (com BACKUP_CHAVE)"); process.exit(1); }

// cabeçalho: "ARINIBK1" + sal(16) + iv(12); no fim, tag(16)
const tamanho = statSync(arquivo).size;
const fd = openSync(arquivo, "r");
const cab = Buffer.alloc(36); readSync(fd, cab, 0, 36, 0);
const tag = Buffer.alloc(16); readSync(fd, tag, 0, 16, tamanho - 16);
closeSync(fd);
if (cab.subarray(0, 8).toString() !== "ARINIBK1") { console.error("não é um backup do Arini (cabeçalho errado)"); process.exit(1); }
const decifra = createDecipheriv("aes-256-gcm", scryptSync(process.env.BACKUP_CHAVE, cab.subarray(8, 24), 32), cab.subarray(24, 36));
decifra.setAuthTag(tag);
const dump = arquivo.replace(/\.enc$/, "") + ".restaurar";
try {
  await pipeline(createReadStream(arquivo, { start: 36, end: tamanho - 17 }), decifra, createWriteStream(dump));
} catch {
  unlinkSync(dump);
  console.error("FALHOU: chave errada ou arquivo corrompido (a verificação AES-GCM não bateu).");
  process.exit(1);
}

const lista = spawnSync(PG_RESTORE, ["--list", dump], { encoding: "utf8", maxBuffer: 1 << 28 });
if (lista.status !== 0) { unlinkSync(dump); console.error("FALHOU: o pg_restore não reconhece o arquivo:", lista.stderr.slice(-400)); process.exit(1); }
const linhas = lista.stdout.split("\n");
const conta = (tipo) => linhas.filter((l) => new RegExp(`\\b${tipo}\\b`).test(l)).length;
console.log(`OK: decifrado e íntegro · ${conta("TABLE DATA")} tabelas com dados · ${conta("TABLE")} tabelas · ${conta("FUNCTION")} funções · ${conta("INDEX")} índices`);

if (destino) {
  console.log("restaurando…");
  const r = spawnSync(PG_RESTORE, ["--no-owner", "--no-privileges", "-d", destino, dump], { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"] });
  if (r.status !== 0) console.error("terminou com avisos/erros:", (r.stderr ?? "").slice(-1500));
  else console.log("restaurado.");
}
unlinkSync(dump);
