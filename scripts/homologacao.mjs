// Monta o ambiente de homologação num projeto Supabase NOVO (roadmap 1.5).
//
// Um comando faz tudo o que docs/HOMOLOGACAO.md descreve, sem trocar o
// .env.local de produção: lê as credenciais do projeto de homologação de um
// arquivo à parte (.env.homolog) e roda, nessa ordem:
//   1. todas as migrations;
//   2. a seed (região, municípios, contas de teste, 3 imóveis);
//   3. o CAR dos municípios da seed (para os imóveis de teste terem divisa);
//   4. os 40 imóveis de teste com divisa da base oficial.
// Nunca copia dado da produção (LGPD): a homologação só tem dado de teste.
//
// Trava de segurança: recusa se o projeto do .env.homolog for o mesmo da
// produção (o do .env.local).
//
// Uso:
//   1. crie o projeto no Supabase (região São Paulo) e ligue a extensão PostGIS;
//   2. crie .env.homolog com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD e
//      SEED_USER_PASSWORD (senha das contas de teste);
//   3. node scripts/homologacao.mjs [--env .env.homolog] [--sem-car]
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const i = args.indexOf("--env");
const arquivo = join(raiz, i >= 0 ? args[i + 1] : ".env.homolog");
if (!existsSync(arquivo)) {
  console.error(`não achei ${arquivo} — crie com as credenciais do projeto de homologação (ver o cabeçalho deste script)`);
  process.exit(1);
}
const ler = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n")
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

const homolog = ler(arquivo);
const producao = existsSync(join(raiz, ".env.local")) ? ler(join(raiz, ".env.local")) : {};
const faltam = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD", "SEED_USER_PASSWORD"]
  .filter((v) => !homolog[v]);
if (faltam.length) { console.error(`faltam no ${arquivo}: ${faltam.join(", ")}`); process.exit(1); }
if (homolog.SUPABASE_PROJECT_REF === producao.SUPABASE_PROJECT_REF) {
  console.error("RECUSADO: o .env.homolog aponta para o MESMO projeto da produção. Homologação é outro projeto.");
  process.exit(1);
}

// os scripts só leem do .env.local o que NÃO veio no ambiente: o da homologação manda
const env = { ...process.env, ...homolog };
const passos = [
  ["migrations", ["scripts/migrate.mjs"]],
  ["seed (região, municípios, contas e imóveis de teste)", ["scripts/seed.mjs"]],
  ...(args.includes("--sem-car") ? [] : [["CAR dos municípios da seed", ["scripts/importa-car.mjs"]]]),
  ["40 imóveis de teste com divisa oficial", ["scripts/seed-imoveis-teste.mjs"]],
];
for (const [nome, cmd] of passos) {
  console.log(`\n=== ${nome}`);
  const r = spawnSync(process.execPath, cmd, { cwd: raiz, env, stdio: "inherit" });
  if (r.status !== 0) { console.error(`falhou em: ${nome}`); process.exit(r.status ?? 1); }
}
console.log(`\nHomologação pronta em ${homolog.NEXT_PUBLIC_SUPABASE_URL}.
Próximos passos (docs/HOMOLOGACAO.md §2 e §3): segundo app no Dokploy com estas variáveis,
Asaas em sandbox, e "npm run testa" apontando para a URL da homologação.`);
