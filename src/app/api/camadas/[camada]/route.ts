import { NextResponse } from "next/server";
import { camadaNaJanela, JanelaGrande } from "@/lib/geo/camadasMapa";
import { camadaOficialPorId, type CamadaOficialId } from "@/lib/map/camadasOficiais";
import { currentUser } from "@/lib/supabase/server";
import { conferirRecurso } from "@/lib/planos-servidor";
import { limitarEmMemoria } from "@/lib/geo/limiteMemoria";
import { ipDoPedido, respostaLimite } from "@/lib/seguranca/limite";

/**
 * GET /api/camadas/{camada}?bbox=xmin,ymin,xmax,ymax — geometria de uma camada
 * oficial (SIGEF, embargos, ANM, FUNAI, UCs, quilombolas, PRODES) na janela do
 * mapa, para desenhar. Recurso `camadas_oficiais` (plano profissional): o
 * mapa só pede quando o plano libera; aqui é a trava de verdade.
 */
export const maxDuration = 90;

export async function GET(request: Request, ctx: RouteContext<"/api/camadas/[camada]">) {
  const { camada } = await ctx.params;
  if (!camadaOficialPorId(camada)) return NextResponse.json({ error: "Camada desconhecida." }, { status: 404 });

  const l = limitarEmMemoria(`camadas:${ipDoPedido(request)}`, 300, 300);
  if (!l.permitido) return respostaLimite(l, "camadas do mapa");

  const user = await currentUser();
  const { negacao } = await conferirRecurso(request, user ? { id: user.id, role: user.role } : null, "camadas_oficiais");
  if (negacao) return NextResponse.json({ error: negacao.mensagem, solucao: negacao.solucao, codigo: negacao.codigo }, { status: 403 });

  const [xmin, ymin, xmax, ymax] = (new URL(request.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  const env = { xmin, ymin, xmax, ymax };
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmin >= xmax || ymin >= ymax || xmin < -75 || xmax > -28 || ymin < -35 || ymax > 7) {
    return NextResponse.json({ error: "Janela inválida." }, { status: 400 });
  }

  try {
    const fc = await camadaNaJanela(camada as CamadaOficialId, env);
    return NextResponse.json(fc, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    if (e instanceof JanelaGrande) return NextResponse.json({ error: "Aproxime o mapa para ver esta camada.", codigo: "aproxime" }, { status: 422 });
    console.error(`camada ${camada} falhou:`, e);
    return NextResponse.json({ error: "O órgão não respondeu agora. Tente de novo em instantes." }, { status: 502 });
  }
}
