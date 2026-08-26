import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// Webhook do Asaas: confirma pagamento de mensalidade/comissão.
// Configure no Asaas com o header de autenticação = ASAAS_WEBHOOK_TOKEN.
export async function POST(request: Request) {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token) return NextResponse.json({ error: "Webhook desativado." }, { status: 503 });
  if (request.headers.get("asaas-access-token") !== token) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const evento = body?.event as string | undefined;
  const pagamento = body?.payment as { id: string; externalReference?: string } | undefined;
  if (!evento || !pagamento) return NextResponse.json({ ok: true, ignorado: true });

  const admin = supabaseAdmin();
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(evento) && pagamento.externalReference) {
    const hoje = new Date().toISOString().slice(0, 10);
    // fatura de mensalidade
    const { data: inv } = await admin.from("invoices")
      .update({ status: "paga", pago_em: hoje })
      .eq("id", pagamento.externalReference)
      .select("id, subscription_id").maybeSingle();
    if (inv) {
      await admin.from("subscriptions").update({ status: "ativa" }).eq("id", inv.subscription_id).eq("status", "inadimplente");
      await logAudit({ acao: "fatura_paga_asaas", entidade: "invoices", entidade_id: inv.id, dados_depois: { gateway: pagamento.id } });
      return NextResponse.json({ ok: true });
    }
    // comissão
    const { data: com } = await admin.from("commissions")
      .update({ status: "paga", pago_em: hoje })
      .eq("id", pagamento.externalReference)
      .select("id").maybeSingle();
    if (com) {
      await logAudit({ acao: "comissao_paga_asaas", entidade: "commissions", entidade_id: com.id, dados_depois: { gateway: pagamento.id } });
    }
  }
  return NextResponse.json({ ok: true });
}
