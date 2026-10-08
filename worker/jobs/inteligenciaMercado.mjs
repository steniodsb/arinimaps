// Inteligência de mercado do assistente (docs/INFRA-NACIONAL.md §4, migration 0040).
//
// Recalcula ia_mercado_municipio — preço por ha/m² por município e tipo, a
// partir dos anúncios publicados e das vendas registradas. Todo o cálculo mora
// no banco (fn_recalcular_inteligencia_mercado), inclusive o mínimo de 3 por
// grupo; aqui só disparamos. Agendado uma vez por dia em worker/index.mjs —
// o projeto não usa pg_cron, as rotinas periódicas passam todas pela fila `jobs`.
export async function inteligenciaMercado(_payload, db) {
  const { rows: [r] } = await db.query(`select fn_recalcular_inteligencia_mercado() as resultado`);
  console.log(`[mercado] ${r.resultado.grupos} grupo(s) recalculado(s) em ${r.resultado.calculado_em}`);
}
