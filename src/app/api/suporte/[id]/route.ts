import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { limitar, respostaLimite } from "@/lib/seguranca/limite";

/** O dono do chamado responde na conversa. Reabre o chamado se estava resolvido. */
export async function POST(request: Request, ctx: RouteContext<"/api/suporte/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para responder." }, { status: 401 });

  const limite = await limitar(`suporte:msg:${user.id}`, 20, 3600);
  if (!limite.permitido) return respostaLimite(limite, "envio");

  const corpo = String((await request.json().catch(() => ({}))).mensagem ?? "").trim();
  if (corpo.length < 2) return NextResponse.json({ error: "Escreva a mensagem." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: ticket } = await admin.from("support_tickets").select("id, user_id, status").eq("id", id).single();
  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  await admin.from("support_messages").insert({
    ticket_id: id, autor_id: user.id, autor_nome: user.nome || "Cliente", corpo: corpo.slice(0, 6000),
  });
  if (ticket.status !== "aberto") {
    await admin.from("support_tickets").update({ status: "em_atendimento", resolvido_em: null }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
