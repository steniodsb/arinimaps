import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

const TRANSICOES: Record<string, string[]> = {
  registrada: ["cobrada"],
  cobrada: ["paga"],
  paga: ["conciliada"],
};

export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") {
    return NextResponse.json({ error: "Comissões são restritas à diretoria." }, { status: 403 });
  }
  const { commission_id, status } = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("commissions").select("status").eq("id", commission_id).single();
  if (!antes) return NextResponse.json({ error: "Comissão não encontrada." }, { status: 404 });
  if (!TRANSICOES[antes.status]?.includes(status)) {
    return NextResponse.json({ error: `Transição inválida: ${antes.status} → ${status}` }, { status: 400 });
  }
  await admin.from("commissions").update({
    status,
    pago_em: status === "paga" ? new Date().toISOString().slice(0, 10) : undefined,
  }).eq("id", commission_id);
  await logAudit({ user_id: a.userId, acao: `comissao_${status}`, entidade: "commissions", entidade_id: commission_id, dados_antes: { status: antes.status }, dados_depois: { status } });
  return NextResponse.json({ ok: true });
}
