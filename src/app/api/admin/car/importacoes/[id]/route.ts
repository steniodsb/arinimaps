import { NextResponse } from "next/server";
import { ator, temSetor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { falha } from "@/lib/erros";
import { semPermissaoCartografia } from "@/lib/geo/carImportacao";

/** Descarta uma importação não concluída (envio interrompido ou arquivo errado). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/car/importacoes/[id]">) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) return semPermissaoCartografia();
  const { id } = await ctx.params;

  const { error } = await supabaseAdmin().rpc("fn_car_importacao_descartar", { p_importacao: id });
  if (error) return falha(409, "descarte_recusado", "Não deu para descartar.", { motivo: error.message });

  await logAudit({ user_id: a.userId, acao: "car_importacao_descartada", entidade: "car_importacoes", entidade_id: id });
  return NextResponse.json({ ok: true });
}
