import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { falha } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { assinatura } from "@/lib/juridico";
import { limitar, respostaLimite } from "@/lib/seguranca/limite";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Falar com um avaliador" (CTA obrigatório da pré-avaliação): vira lead +
 * oportunidade no funil, marcados `pre_avaliacao`, para a equipe Comercial
 * encaminhar a um avaliador. Usa o nome e o e-mail da conta; telefone opcional.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/avaliacao/[propertyId]/avaliador">) {
  const { propertyId } = await ctx.params;
  if (!UUID.test(propertyId)) return falha(400, "id_invalido", "Imóvel inválido.");

  const user = await currentUser();
  if (!user) return falha(401, "sem_sessao", "Entre na sua conta para pedir um avaliador.");

  const limite = await limitar(`avaliador:${user.id}`, 3, 3600);
  if (!limite.permitido) return respostaLimite(limite, "pedido de avaliador");

  const corpo = await request.json().catch(() => ({})) as { telefone?: string; mensagem?: string; consentimento?: boolean; avaliacaoId?: string };
  if (!corpo.consentimento) return falha(400, "sem_consentimento", "É preciso autorizar o contato.");
  const telefone = String(corpo.telefone ?? "").replace(/[^\d+() -]/g, "").slice(0, 30) || null;
  const mensagem = String(corpo.mensagem ?? "").trim().slice(0, 1000);
  const avaliacaoId = corpo.avaliacaoId && UUID.test(corpo.avaliacaoId) ? corpo.avaliacaoId : null;

  const admin = supabaseAdmin();
  const { data: imovel } = await admin.from("properties").select("id, codigo, titulo, status")
    .eq("id", propertyId).in("status", ["publicado", "em_negociacao"]).maybeSingle();
  if (!imovel) return falha(404, "nao_encontrado", "Imóvel não disponível.");

  const { data: lead, error: e1 } = await admin.from("leads").insert({
    property_id: imovel.id,
    nome: user.nome || "Conta sem nome",
    email: user.email ?? null,
    telefone,
    mensagem: `[Pré-avaliação] Pediu para falar com um avaliador.${mensagem ? `\n\n${mensagem}` : ""}`,
    origem: "pre_avaliacao",
    canal: "site",
    consentimento_lgpd: true,
    consentimento_versao: assinatura("privacidade"),
    status: "em_oportunidade",
  }).select("id").single();
  if (e1) return falha(500, "lead_falhou", "Não foi possível registrar o pedido.", { motivo: e1.message });

  const { data: opp, error: e2 } = await admin.from("opportunities").insert({
    lead_id: lead.id, property_id: imovel.id, comprador_profile_id: user.id,
    qualificacao: { tag: "pre_avaliacao", avaliacao_id: avaliacaoId },
  }).select("id, codigo").single();
  if (e2) return falha(500, "oportunidade_falhou", "Não foi possível registrar o pedido.", { motivo: e2.message });

  await admin.from("opportunity_events").insert({
    opportunity_id: opp.id, tipo: "contato",
    descricao: `Pedido de avaliador a partir da pré-avaliação de ${imovel.codigo}${avaliacaoId ? ` (avaliação ${avaliacaoId})` : ""}`,
  });
  void registrarEventoImovel({ propertyId: imovel.id, tipo: "lead", request, userId: user.id, detalhe: { origem: "pre_avaliacao", opportunity: opp.codigo } });
  await logAudit({
    user_id: user.id, acao: "lead_criado", entidade: "leads", entidade_id: lead.id,
    property_id: imovel.id, opportunity_id: opp.id, dados_depois: { origem: "pre_avaliacao", avaliacao_id: avaliacaoId },
  });

  return NextResponse.json({ ok: true, oportunidade: opp.codigo });
}
