import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, temSetor } from "@/lib/authz";
import { sendEmail } from "@/lib/notify";

const STATUS = ["recebido", "em_analise", "atendido", "negado"];
const TIPOS = ["acesso", "correcao", "exclusao", "portabilidade", "revogacao", "informacao", "outro"];

/** Registra à mão um pedido que chegou por outro canal (telefone, e-mail, balcão). */
export async function POST(request: Request) {
  const a = await ator();
  if (!a || !temSetor(a, "juridico")) return NextResponse.json({ error: "Restrito ao setor Jurídico." }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (nome.length < 2 || !email.includes("@") || !TIPOS.includes(b.tipo)) {
    return NextResponse.json({ error: "Informe nome, e-mail e o tipo do pedido." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().from("lgpd_requests").insert({
    nome, email, tipo: b.tipo, descricao: b.descricao ? String(b.descricao).slice(0, 4000) : null,
    cpf: b.cpf ? String(b.cpf).replace(/\D/g, "").slice(0, 14) : null,
  }).select("id, codigo").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ user_id: a.userId, acao: "lgpd_registrado", entidade: "lgpd_requests", entidade_id: data.id, dados_depois: { tipo: b.tipo } });
  return NextResponse.json({ ok: true, codigo: data.codigo });
}

/** Anda o pedido e registra a resposta dada ao titular. */
export async function PATCH(request: Request) {
  const a = await ator();
  if (!a || !temSetor(a, "juridico")) return NextResponse.json({ error: "Restrito ao setor Jurídico." }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  if (!STATUS.includes(b.status)) return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  const resposta = b.resposta ? String(b.resposta).trim().slice(0, 6000) : null;
  const encerra = ["atendido", "negado"].includes(b.status);
  if (encerra && !resposta) {
    return NextResponse.json({ error: "Para encerrar o pedido, registre a resposta dada ao titular." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("lgpd_requests").select("codigo, email, status").eq("id", b.id).single();
  if (!antes) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const { error } = await admin.from("lgpd_requests").update({
    status: b.status,
    resposta: resposta ?? undefined,
    atendido_em: encerra ? new Date().toISOString() : null,
    atendido_por: encerra ? a.userId : null,
  }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (encerra && b.avisar !== false) {
    sendEmail(antes.email, `Resposta ao pedido ${antes.codigo} — Arini Imóveis Brasil`, resposta!).catch(() => undefined);
  }
  await logAudit({
    user_id: a.userId, acao: "lgpd_" + b.status, entidade: "lgpd_requests", entidade_id: b.id,
    dados_antes: { status: antes.status }, dados_depois: { status: b.status },
  });
  return NextResponse.json({ ok: true });
}
