import { NextResponse } from "next/server";
import { garantirCarJanela } from "@/lib/geo/carSobDemanda";
import { limitarEmMemoria } from "@/lib/geo/limiteMemoria";
import { ipDoPedido, respostaLimite } from "@/lib/seguranca/limite";

/**
 * POST /api/car/janela {xmin, ymin, xmax, ymax}
 *
 * O mapa chama ao parar num zoom ≥ 11: garante que o CAR daquela janela está
 * no banco (busca no SICAR o que faltar, src/lib/geo/carSobDemanda.ts) e diz
 * se entrou coisa nova — aí o mapa recarrega os tiles do CAR.
 *
 * Público como o próprio mapa (o CAR é dado aberto), com limite por IP: cada
 * célula nova custa uma ida ao SICAR.
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  const l = limitarEmMemoria(`car-janela:${ipDoPedido(request)}`, 60, 300);
  if (!l.permitido) return respostaLimite(l, "busca do CAR");

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const env = {
    xmin: Number(b?.xmin), ymin: Number(b?.ymin), xmax: Number(b?.xmax), ymax: Number(b?.ymax),
  };
  const valido = Object.values(env).every(Number.isFinite)
    && env.xmin < env.xmax && env.ymin < env.ymax
    // só o Brasil (com folga): o SICAR não tem nada fora
    && env.xmin >= -75 && env.xmax <= -28 && env.ymin >= -35 && env.ymax <= 7;
  if (!valido) return NextResponse.json({ error: "Janela inválida." }, { status: 400 });

  try {
    return NextResponse.json(await garantirCarJanela(env));
  } catch (e) {
    console.error("CAR sob demanda falhou:", e);
    return NextResponse.json({ error: "O SICAR não respondeu agora. Tente de novo em instantes." }, { status: 502 });
  }
}
