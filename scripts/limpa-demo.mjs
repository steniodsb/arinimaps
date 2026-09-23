// Limpa os dados de demonstração antes de mostrar ou de abrir ao público.
//
// Dois níveis:
//   --vitrine  (padrão) desfaz só a negociação do teste E2E: a Fazenda Boa Vista
//              ficou "vendida" com comissão de R$ 36 mil. Apaga lead,
//              oportunidade, visita, propostas, contrato, venda e comissão, e
//              devolve o imóvel a "publicado". Os 3 imóveis demo continuam no
//              mapa para a apresentação.
//   --tudo     para a abertura ao público: o anterior + apaga os 3 imóveis demo,
//              as mensalidades deles e as contas proprietario.teste e
//              corretor.teste. A conta admin@ fica (troque a senha no painel).
//
// SEM --executar É ENSAIO: roda tudo dentro de uma transação, mostra o que
// seria apagado e desfaz (ROLLBACK). Nada muda no banco.
// A auditoria (audit_log) é append-only por desenho e não é tocada.
//
// Uso: node scripts/limpa-demo.mjs [--vitrine|--tudo] [--executar]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const tudo = process.argv.includes("--tudo");
const executar = process.argv.includes("--executar");

const DEMO = ["ARINI-MAP-000001", "ARINI-MAP-000002", "ARINI-MAP-000003"];
const CONTAS_TESTE = ["proprietario.teste@arinimaps.com.br", "corretor.teste@arinimaps.com.br"];

const c = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
await c.connect();

const passos = [];
const rodar = async (rotulo, sql, params = []) => {
  const r = await c.query(sql, params);
  passos.push([rotulo, r.rowCount]);
};

try {
  await c.query("begin");
  const { rows } = await c.query("select id from properties where codigo = any($1)", [DEMO]);
  const ids = rows.map((r) => r.id);
  const opps = `select id from opportunities where property_id = any($1)`;

  await rodar("comissões", `delete from commissions where sale_id in (select id from sales where property_id = any($1))`, [ids]);
  await rodar("vendas", `delete from sales where property_id = any($1)`, [ids]);
  await rodar("contratos", `delete from contracts where opportunity_id in (${opps})`, [ids]);
  await rodar("visitas", `delete from visits where opportunity_id in (${opps})`, [ids]);
  await rodar("propostas", `delete from proposals where opportunity_id in (${opps})`, [ids]);
  await rodar("oportunidades (e seus eventos)", `delete from opportunities where property_id = any($1)`, [ids]);
  await rodar("leads", `delete from leads where property_id = any($1)`, [ids]);
  // a máquina de estados (trg_property_transition) proíbe vendido → publicado,
  // com razão: em produção isso é fraude. Aqui é desfazer um teste, então os
  // gatilhos ficam desligados SÓ neste update. Não pode valer para os deletes:
  // o modo replica desliga também as cascatas de chave estrangeira, e apagar
  // a oportunidade deixaria visitas, propostas e eventos órfãos.
  await c.query("set local session_replication_role = replica");
  await rodar("imóvel vendido devolvido a publicado",
    `update properties set status = 'publicado', sold_at = null where id = any($1) and status in ('vendido', 'em_negociacao')`, [ids]);
  await c.query("set local session_replication_role = origin");

  if (tudo) {
    await rodar("mensalidades dos imóveis demo", `delete from subscriptions where property_id = any($1)`, [ids]);
    await rodar("imóveis demo", `delete from properties where id = any($1)`, [ids]);
    await rodar("contas de teste (auth + perfil)", `delete from auth.users where email = any($1)`, [CONTAS_TESTE]);
  }

  console.log(`\n${executar ? "EXECUTADO" : "ENSAIO (nada foi gravado)"} — nível ${tudo ? "tudo" : "vitrine"}\n`);
  for (const [r, n] of passos) console.log(`  ${String(n).padStart(3)}  ${r}`);

  await c.query(executar ? "commit" : "rollback");
  if (!executar) console.log("\nPara gravar, repita com --executar.");
  if (tudo && executar) console.log("\nFotos dos imóveis demo continuam no storage (bucket media/properties/) — apague pelo painel do Supabase se quiser.");
} catch (e) {
  await c.query("rollback");
  console.error("Falhou e nada foi gravado:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
