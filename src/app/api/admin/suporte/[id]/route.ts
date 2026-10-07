import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { lerSince, marcarVisto, usuarioOnline } from "@/lib/suporte";

/**
 * Conversa ao vivo do lado da equipe (10.2): mensagens novas depois de
 * `since` (inclui notas internas), situação do chamado e se o cliente está
 * com a página aberta agora. Cada consulta conta como presença da equipe.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/suporte/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a || !temSetor(a, "suporte")) return NextResponse.json({ error: "Restrito ao setor de Suporte." }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: ticket } = await admin.from("support_tickets").select("id, user_id, status, responsavel").eq("id", id).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });

  const since = lerSince(request);
  let q = admin.from("support_messages")
    .select("id, autor_nome, da_equipe, interno, corpo, created_at").eq("ticket_id", id).order("created_at").limit(300);
  if (since) q = q.gt("created_at", since);
  const [{ data: mensagens }, clienteOnline] = await Promise.all([q, usuarioOnline(ticket.user_id), marcarVisto(a.userId)]);

  return NextResponse.json(
    { mensagens: mensagens ?? [], status: ticket.status, responsavel: ticket.responsavel, cliente_online: clienteOnline },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
