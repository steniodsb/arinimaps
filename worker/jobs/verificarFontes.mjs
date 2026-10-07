// Job `verificar_fontes`: sonda todas as fontes ativas e grava em fontes_saude.
// Três falhas seguidas deixam a fonte 'instavel' (fn_fonte_saude_registrar);
// o relatório passa a mostrar "fonte com instabilidade", nunca "nada encontrado".
import { sondarFontes } from "./sondaFonte.mjs";

export async function verificarFontes(payload, db) {
  const { rows: fontes } = await db.query(
    `select id, sonda_url from fontes_externas where ativa and sonda_url is not null order by prioridade`);
  const resultados = await sondarFontes(fontes);
  for (const r of resultados) {
    const { rows: [s] } = await db.query(
      `select fn_fonte_saude_registrar($1, $2, $3, $4, $5, $6) as situacao`,
      [r.fonte_id, r.ok, r.status_http, r.ms, r.erro, payload?.origem ?? "worker"]);
    r.situacao = s?.situacao ?? null;
  }
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`[verificar_fontes] ${resultados.length - falhas.length}/${resultados.length} ok` +
    (falhas.length ? ` · fora: ${falhas.map((f) => `${f.fonte_id} (${f.erro})`).join(", ")}` : ""));
  return resultados;
}
