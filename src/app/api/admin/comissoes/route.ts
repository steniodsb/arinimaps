import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";

const TRANSICOES: Record<string, string[]> = {
  registrada: ["cobrada"],
  cobrada: ["paga"],
  paga: ["conciliada"],
};

export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") {
    return falha(403, "sem_permissao", "Comissões são restritas à diretoria.", { solucao: "Peça a alguém da diretoria." });
  }
  const { commission_id, status } = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("commissions").select("status").eq("id", commission_id).single();
  if (!antes) return falha(404, "comissao_sumiu", "Comissão não encontrada.", { motivo: "Ela pode ter sido removida enquanto a tela estava aberta.", solucao: "Recarregue a página." });
  if (!TRANSICOES[antes.status]?.includes(status)) {
    return falha(400, "transicao_invalida", "Essa comissão não pode ir direto para esse estado.", { motivo: `Ela está em "${antes.status}" e a esteira só permite o passo seguinte, não pular etapa.`, solucao: "Avance um passo por vez: registrada → cobrada → paga → conciliada." });
  }
  await admin.from("commissions").update({
    status,
    pago_em: status === "paga" ? new Date().toISOString().slice(0, 10) : undefined,
  }).eq("id", commission_id);
  await logAudit({ user_id: a.userId, acao: `comissao_${status}`, entidade: "commissions", entidade_id: commission_id, dados_antes: { status: antes.status }, dados_depois: { status } });
  return NextResponse.json({ ok: true });
}
