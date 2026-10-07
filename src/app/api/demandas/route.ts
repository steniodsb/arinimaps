import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { validarDemanda } from "@/lib/demandas";

/**
 * Demandas sem imóvel (5.16 · Fluxograma §12) — setor Comercial.
 * POST cria; a lista mora em /admin/demandas; fechar/editar em /api/demandas/[id].
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "comercial")) return falha(403, "sem_setor", "Demandas são do setor Comercial.");
  const b = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();

  // veio da oportunidade: puxa o cliente do lead se o formulário não trouxe
  let oppId: string | null = null;
  if (b.opportunity_id) {
    const { data: opp } = await admin.from("opportunities")
      .select("id, lead:leads(nome, telefone, email), property:properties(tipo, municipality_id)").eq("id", String(b.opportunity_id)).maybeSingle();
    if (!opp) return falha(404, "oportunidade_nao_encontrada", "Oportunidade não encontrada.");
    oppId = opp.id;
    const lead = opp.lead as unknown as { nome: string; telefone: string | null; email: string | null } | null;
    b.cliente_nome ??= lead?.nome;
    b.cliente_contato ??= [lead?.telefone, lead?.email].filter(Boolean).join(" · ") || null;
  }

  const v = await validarDemanda(b, false);
  if ("erro" in v) return falha(400, "dados_invalidos", v.erro);
  const { data, error } = await admin.from("demandas").insert({
    ...v.dados, opportunity_id: oppId, criado_por: a.userId,
    responsavel: v.dados.responsavel ?? a.userId,
  }).select("id, codigo").single();
  if (error) return falha(500, "erro_banco", "Não foi possível registrar a demanda.", { motivo: error.message });

  await logAudit({ user_id: a.userId, acao: "demanda_registrada", entidade: "demandas", entidade_id: data.id, opportunity_id: oppId, dados_depois: v.dados });
  if (oppId) {
    await admin.from("opportunity_events").insert({
      opportunity_id: oppId, tipo: "nota", autor: a.userId,
      descricao: `Demanda ${data.codigo} registrada: o cliente segue procurando imóvel com este perfil.`,
    }).then(() => undefined, () => undefined);
  }
  return NextResponse.json({ ok: true, id: data.id, codigo: data.codigo });
}
