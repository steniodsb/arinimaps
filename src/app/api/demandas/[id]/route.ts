import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { validarDemanda } from "@/lib/demandas";

const STATUS = ["aberta", "atendida", "cancelada"];

/** Edita a demanda, troca o responsável ou fecha (atendida/cancelada) — setor Comercial. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/demandas/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "comercial")) return falha(403, "sem_setor", "Demandas são do setor Comercial.");

  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("demandas").select("*").eq("id", id).maybeSingle();
  if (!antes) return falha(404, "demanda_nao_encontrada", "Demanda não encontrada.");

  const b = await request.json().catch(() => ({}));
  const v = await validarDemanda(b, true);
  if ("erro" in v) return falha(400, "dados_invalidos", v.erro);
  const patch: Record<string, unknown> = { ...v.dados };
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return falha(400, "status_invalido", "Situação inválida.");
    patch.status = b.status;
    patch.fechada_em = b.status === "aberta" ? null : new Date().toISOString();
    patch.motivo_fechamento = b.status === "aberta" ? null : String(b.motivo ?? "").trim().slice(0, 500) || null;
  }
  if (!Object.keys(patch).length) return falha(400, "nada_para_alterar", "Nada para alterar.");

  const { error } = await admin.from("demandas").update(patch).eq("id", id);
  if (error) return falha(500, "erro_banco", "Não foi possível salvar.", { motivo: error.message });
  await logAudit({
    user_id: a.userId, acao: patch.status && patch.status !== antes.status ? `demanda_${patch.status}` : "demanda_alterada",
    entidade: "demandas", entidade_id: id, opportunity_id: antes.opportunity_id, dados_antes: antes, dados_depois: patch,
  });
  return NextResponse.json({ ok: true });
}
