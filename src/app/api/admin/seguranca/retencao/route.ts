import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { registrarTentativa } from "@/lib/planos-servidor";
import { prazosRetencao } from "@/lib/seguranca/retencao";

/**
 * Retenção e descarte (item 6.4).
 *   POST { acao: "simular" } → calcula agora o que passou do prazo e registra
 *                              a simulação em descartes_log (não apaga nada);
 *   POST { acao: "agendar" } → põe a rotina na fila do worker agora, em vez
 *                              de esperar a rodada diária. Ela só apaga de
 *                              verdade se "Descartar de verdade" estiver ligado.
 * Só a Diretoria (os prazos e a chave de execução também são só dela).
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "diretoria")) {
    await registrarTentativa({ request, userId: a.userId, role: a.role, recurso: "setor:diretoria", motivo: "sem_setor" });
    return falha(403, "sem_setor", "A rotina de descarte é acionada pela Diretoria.");
  }
  const b = await request.json().catch(() => ({}));
  const prazos = await prazosRetencao();
  if (!prazos.selfie && !prazos.docs && !prazos.logs) {
    return falha(400, "sem_prazos", "Nenhum prazo de guarda definido.", {
      motivo: "Todos os prazos estão em 0 (não descartar).",
      solucao: "Defina os prazos em Configurações › Segurança depois da decisão 8.9.",
    });
  }
  const admin = supabaseAdmin();

  if (b?.acao === "simular") {
    const { data, error } = await admin.rpc("fn_descarte_simular", {
      p_selfie_dias: prazos.selfie, p_docs_dias: prazos.docs, p_logs_dias: prazos.logs, p_job_id: null,
    });
    if (error) return falha(500, "falha_banco", "A simulação falhou.", { motivo: error.message });
    const c = data as { selfies: unknown[]; documentos: unknown[]; logs: Record<string, number> };
    await logAudit({ user_id: a.userId, acao: "retencao_simulada", entidade: "descartes_log", dados_depois: { prazos, selfies: c.selfies.length, documentos: c.documentos.length, logs: c.logs } });
    return NextResponse.json({ ok: true, selfies: c.selfies.length, documentos: c.documentos.length, logs: c.logs });
  }

  if (b?.acao === "agendar") {
    const { error } = await admin.from("jobs").insert({ tipo: "descarte_retencao", payload: {} });
    if (error) return falha(500, "falha_banco", "Não foi possível agendar.", { motivo: error.message });
    await logAudit({ user_id: a.userId, acao: "retencao_agendada", entidade: "jobs", dados_depois: { prazos } });
    return NextResponse.json({ ok: true, executar: prazos.executar });
  }

  return falha(400, "acao_invalida", "Ação inválida.");
}
