import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { asaasConfigurado, asaasCriarCliente, asaasCriarCobranca } from "@/lib/asaas";
import { emailDoProfile } from "@/lib/notify";

// Ações de mensalidade: gerar_faturas | marcar_paga | marcar_inadimplentes | cobrar_asaas
export async function POST(request: Request) {
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Acesso restrito à Arini." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();

  if (body.acao === "gerar_faturas") {
    const competencia = body.competencia ?? new Date().toISOString().slice(0, 8) + "01";
    const { data: n, error } = await admin.rpc("fn_gerar_faturas", { p_competencia: competencia });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAudit({ user_id: a.userId, acao: "faturas_geradas", entidade: "invoices", dados_depois: { competencia, geradas: n } });
    return NextResponse.json({ ok: true, geradas: n });
  }

  if (body.acao === "marcar_paga") {
    const { error } = await admin.from("invoices")
      .update({ status: "paga", pago_em: new Date().toISOString().slice(0, 10) })
      .eq("id", body.invoice_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // se não sobrou fatura vencida, assinatura volta a ativa
    const { data: inv } = await admin.from("invoices").select("subscription_id").eq("id", body.invoice_id).single();
    if (inv) {
      const { count } = await admin.from("invoices").select("id", { count: "exact", head: true })
        .eq("subscription_id", inv.subscription_id).eq("status", "vencida");
      if (!count) await admin.from("subscriptions").update({ status: "ativa" })
        .eq("id", inv.subscription_id).eq("status", "inadimplente");
    }
    await logAudit({ user_id: a.userId, acao: "fatura_paga", entidade: "invoices", entidade_id: body.invoice_id });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "marcar_inadimplentes") {
    const { data: cfg } = await admin.from("settings").select("valor").eq("chave", "suspensao_dias").single();
    const { data: n, error } = await admin.rpc("fn_marcar_inadimplentes", { p_dias: Number(cfg?.valor ?? 15) });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAudit({ user_id: a.userId, acao: "inadimplencia_processada", entidade: "invoices", dados_depois: { vencidas: n } });
    return NextResponse.json({ ok: true, vencidas: n });
  }

  if (body.acao === "atualizar_valor") {
    const { error } = await admin.from("subscriptions")
      .update({ valor_mensal: Number(body.valor_mensal ?? 0) })
      .eq("id", body.subscription_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAudit({ user_id: a.userId, acao: "mensalidade_valor", entidade: "subscriptions", entidade_id: body.subscription_id, dados_depois: { valor_mensal: body.valor_mensal } });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "cobrar_asaas") {
    if (!asaasConfigurado()) {
      return NextResponse.json({ error: "ASAAS_API_KEY não configurada — cobre manualmente ou configure a chave." }, { status: 400 });
    }
    const { data: inv } = await admin.from("invoices")
      .select("id, valor, competencia, subscription:subscriptions(dia_vencimento, property:properties(codigo, titulo, owner_id, partner_id))")
      .eq("id", body.invoice_id).single();
    if (!inv) return NextResponse.json({ error: "Fatura não encontrada." }, { status: 404 });
    const sub = inv.subscription as unknown as { dia_vencimento: number; property: { codigo: string; titulo: string; owner_id: string | null; partner_id: string | null } };

    // cliente = proprietário ou parceiro responsável
    let profileId: string | null = null;
    let nome = "Anunciante";
    if (sub.property.owner_id) {
      const { data: o } = await admin.from("owners").select("profile_id, profile:profiles(nome)").eq("id", sub.property.owner_id).single();
      profileId = o?.profile_id ?? null;
      nome = (o?.profile as unknown as { nome: string } | null)?.nome ?? nome;
    } else if (sub.property.partner_id) {
      const { data: p } = await admin.from("partners").select("profile_id, razao_social").eq("id", sub.property.partner_id).single();
      profileId = p?.profile_id ?? null;
      nome = p?.razao_social ?? nome;
    }
    const email = profileId ? await emailDoProfile(profileId) : null;

    const cliente = await asaasCriarCliente({ name: nome, email: email ?? undefined });
    const comp = new Date(inv.competencia);
    const due = new Date(comp.getFullYear(), comp.getMonth(), sub.dia_vencimento);
    const cobranca = await asaasCriarCobranca({
      customer: cliente!.id,
      value: Number(inv.valor),
      dueDate: due.toISOString().slice(0, 10),
      description: `Mensalidade Arini Imóveis Brasil — ${sub.property.codigo} ${sub.property.titulo}`,
      externalReference: inv.id,
    });
    await admin.from("invoices").update({ gateway_id: cobranca!.id }).eq("id", inv.id);
    await logAudit({ user_id: a.userId, acao: "cobranca_asaas_criada", entidade: "invoices", entidade_id: inv.id, dados_depois: { gateway_id: cobranca!.id } });
    return NextResponse.json({ ok: true, url: cobranca!.invoiceUrl });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
