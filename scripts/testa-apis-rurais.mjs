// Roda os adaptadores REAIS de src/lib/rural/adaptadores.ts contra a região de
// Iturama e imprime a tabela: quantidade, tempo, erro e a origem carimbada.
//
// Uso: node scripts/testa-apis-rurais.mjs              (todas)
//      node scripts/testa-apis-rurais.mjs sigef dnit   (só essas)
//      BBOX=-50.25,-19.75,-50.15,-19.65 node scripts/testa-apis-rurais.mjs
//
// Usa o jiti (já vem com o Next) para carregar o TypeScript; o "server-only"
// é trocado por um módulo vazio porque aqui não há React Server Components.
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const jiti = createJiti(import.meta.url, {
  alias: { "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)) },
});
const { ADAPTADORES } = await jiti.import(fileURLToPath(new URL("../src/lib/rural/adaptadores.ts", import.meta.url)));

const [xmin, ymin, xmax, ymax] = (process.env.BBOX ?? "-50.6,-20.0,-49.8,-19.4").split(",").map(Number);
const bbox = { xmin, ymin, xmax, ymax, lng: (xmin + xmax) / 2, lat: (ymin + ymax) / 2 };
const filtro = process.argv.slice(2);
const detalhar = process.env.DETALHE === "1";

console.log(`Envelope: ${xmin},${ymin},${xmax},${ymax}\n`);
const linhas = await Promise.all(ADAPTADORES.filter((a) => !filtro.length || filtro.includes(a.id)).map(async (a) => {
  const t0 = Date.now();
  const r = await a.fn(bbox);
  return { a, r, ms: Date.now() - t0 };
}));

console.log("FONTE".padEnd(16), "QTD".padStart(6), "TEMPO".padStart(8), " ORIGEM / ERRO");
console.log("-".repeat(110));
for (const { a, r, ms } of linhas) {
  const o = r.origem ?? {};
  const base = [o.orgao, o.tipo, o.versao, o.atualizado_em && `base atualizada em ${o.atualizado_em.slice(0, 10)}`]
    .filter(Boolean).join(" · ");
  console.log(
    a.id.padEnd(16),
    String(r.erro ? "—" : r.quantidade).padStart(6),
    `${(ms / 1000).toFixed(1)}s`.padStart(8),
    "", r.erro ? `ERRO: ${r.erro}` : base,
  );
  if (detalhar) for (const i of r.itens.slice(0, 3)) console.log("".padEnd(33), "·", i.titulo, i.detalhe ? `— ${i.detalhe}` : "");
}
const falhas = linhas.filter((l) => l.r.erro).length;
const semOrigem = linhas.filter((l) => l.r.itens.some((i) => !i.origem?.consultado_em)).length;
console.log(`\n${linhas.length - falhas}/${linhas.length} fontes responderam; itens sem origem carimbada: ${semOrigem}.`);
process.exit(falhas ? 1 : 0);
