// Roda o worker fora do Docker, com as variáveis do .env.local (teste local ou
// emergência). Uso: node scripts/worker-local.mjs [--uma-vez]
//   --uma-vez  processa o que está na fila e sai (sem ficar em loop)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const l of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim();
}
env.DATABASE_URL ??= `postgres://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@db.${env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;
env.SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
env.SITE_URL ??= "http://localhost:3000";
if (process.argv.includes("--uma-vez")) env.WORKER_UMA_VEZ = "1";

const filho = spawn(process.execPath, ["index.mjs"], { cwd: join(raiz, "worker"), env, stdio: "inherit" });
filho.on("exit", (c) => process.exit(c ?? 0));
