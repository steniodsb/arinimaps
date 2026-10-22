import { NextResponse } from "next/server";
import { ator, temSetor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { falha } from "@/lib/erros";
import { limiteMunicipio, semPermissaoCartografia } from "@/lib/geo/carImportacao";

export const maxDuration = 120;

/**
 * Encerra a importação: as feições novas passam a valer e as anteriores do
 * mesmo município e tema viram histórico. O limite do município vem do IBGE
 * para o relatório saber que parte de uma consulta tem dado importado.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/admin/car/importacoes/[id]/concluir">) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) return semPermissaoCartografia();
  const { id } = await ctx.params;

  const admin = supabaseAdmin();
  const { data: imp } = await admin.from("car_importacoes").select("cod_ibge, municipio, status").eq("id", id).maybeSingle();
  if (!imp) return falha(404, "importacao_nao_encontrada", "Importação não encontrada.", {});

  const { data: jaTem } = await admin.from("car_cobertura").select("limite").eq("cod_ibge", imp.cod_ibge).maybeSingle();
  const limite = jaTem?.limite ? null : await limiteMunicipio(imp.cod_ibge);

  const { data, error } = await admin.rpc("fn_car_importacao_concluir", { p_importacao: id, p_limite: limite });
  if (error) return falha(409, "conclusao_recusada", "Não consegui concluir a importação.", { motivo: error.message });
  // resultado em cache da fonte ficou velho: a próxima consulta lê a base nova
  await admin.from("consultas_area").delete().eq("fonte_id", "car_ambiental");

  await logAudit({
    user_id: a.userId, acao: "car_importacao_concluida", entidade: "car_importacoes", entidade_id: id,
    dados_depois: { municipio: imp.municipio, ...(data as object) },
  });
  return NextResponse.json({ ok: true, ...(data as object), sem_limite: !jaTem?.limite && !limite });
}
