// Rotina de testes antes de cada publicação (roadmap 9.7).
// Uso: npm run testa                      (precisa do `npm run dev` ou do site no ar em BASE_URL)
//      BASE_URL=https://homolog.x npm run testa
//
// 1. auditoria estática das rotas (não precisa de servidor);
// 2. testes de ponta a ponta com navegador real (criam e apagam o que usam).
import { spawnSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSOS = [
  ["Auditoria das rotas da API", "scripts/audita-rotas.mjs", false],
  ["Fontes oficiais ao vivo", "scripts/testa-apis-rurais.mjs", false],
  ["Planos, solicitações cartográficas, revisões", "scripts/testa-planos.mjs", true],
  ["Mapa com tiles vetoriais", "scripts/testa-tiles.mjs", true],
  ["Conta, organização, suporte, demandas", "scripts/testa-conta-suporte.mjs", true],
  ["Perfis, leilão, selfie, vídeo", "scripts/testa-perfis.mjs", true],
];

const somente = process.argv[2];
const resultados = [];
for (const [nome, arquivo, precisaServidor] of PASSOS) {
  if (somente && !arquivo.includes(somente)) continue;
  if (precisaServidor) {
    const ok = await fetch(`${BASE}/acesso`).then((r) => r.status < 500).catch(() => false);
    if (!ok) { resultados.push([nome, "pulado (servidor fora do ar em " + BASE + ")"]); continue; }
  }
  console.log(`\n━━ ${nome} (${arquivo})`);
  const t = Date.now();
  const r = spawnSync(process.execPath, [arquivo], { stdio: "inherit", env: { ...process.env, BASE_URL: BASE } });
  resultados.push([nome, r.status === 0 ? `ok em ${Math.round((Date.now() - t) / 1000)} s` : `FALHOU (código ${r.status})`]);
}

console.log("\n━━ Resumo");
for (const [nome, r] of resultados) console.log(`${r.startsWith("ok") ? "✓" : r.startsWith("pulado") ? "–" : "✗"} ${nome}: ${r}`);
process.exit(resultados.some(([, r]) => r.startsWith("FALHOU")) ? 1 : 0);
