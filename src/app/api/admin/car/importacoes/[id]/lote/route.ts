import { NextResponse } from "next/server";
import { ator, temSetor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { falha } from "@/lib/erros";
import { semPermissaoCartografia } from "@/lib/geo/carImportacao";
import { TEMAS_CAR } from "@/lib/geo/temasCar";

export const maxDuration = 120;

/** Um lote de feições de um tema. O banco valida cada uma e devolve as contagens. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/car/importacoes/[id]/lote">) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) return semPermissaoCartografia();
  const { id } = await ctx.params;

  const corpo = await request.json().catch(() => null) as { tema?: string; inicio?: number; feicoes?: unknown[] } | null;
  if (!corpo?.tema || !(corpo.tema in TEMAS_CAR)) return falha(400, "tema_invalido", "Tema do CAR desconhecido.", {});
  if (!Array.isArray(corpo.feicoes) || !corpo.feicoes.length || corpo.feicoes.length > 2000) {
    return falha(400, "lote_invalido", "Lote vazio ou grande demais (até 2.000 feições).", {});
  }

  const { data, error } = await supabaseAdmin().rpc("fn_car_importacao_lote", {
    p_importacao: id, p_tema: corpo.tema, p_inicio: Number(corpo.inicio) || 0,
    p_fc: { type: "FeatureCollection", features: corpo.feicoes },
  });
  if (error) {
    return falha(409, "lote_recusado", "O banco recusou o lote.", {
      motivo: error.message, solucao: "Se a importação foi encerrada, comece de novo com o arquivo.",
    });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, number>) });
}
