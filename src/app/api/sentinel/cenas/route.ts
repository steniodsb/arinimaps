import { NextResponse } from "next/server";
import { buscarCenas, processamentoLigado } from "@/lib/sentinel/copernicus";
import { podeUsarCenas } from "@/lib/sentinel/acesso";
import { currentUser } from "@/lib/supabase/server";
import { limitarEmMemoria } from "@/lib/geo/limiteMemoria";
import { ipDoPedido, respostaLimite } from "@/lib/seguranca/limite";

/**
 * GET /api/sentinel/cenas?bbox=xmin,ymin,xmax,ymax&de=AAAA-MM-DD&ate=AAAA-MM-DD&nuvem=20
 * Cenas Sentinel-2 L2A da janela do mapa, pelo catálogo aberto do Copernicus.
 * `processamento` diz se a conta do Copernicus está configurada (sem ela a
 * lista aparece, mas a cena não abre).
 */
export async function GET(request: Request) {
  const l = limitarEmMemoria(`sentinel-cenas:${ipDoPedido(request)}`, 60, 300);
  if (!l.permitido) return respostaLimite(l, "busca de cenas");
  const acesso = await podeUsarCenas(request, await currentUser());
  if (!acesso.ok) return NextResponse.json({ error: acesso.mensagem }, { status: acesso.status });

  const q = new URL(request.url).searchParams;
  const bbox = (q.get("bbox") ?? "").split(",").map(Number) as [number, number, number, number];
  const hoje = new Date().toISOString().slice(0, 10);
  const de = q.get("de") ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const ate = q.get("ate") ?? hoje;
  const nuvem = Math.min(100, Math.max(0, Number(q.get("nuvem") ?? 20)));
  const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "2017-03-28" && d <= hoje;
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]
    || bbox[0] < -75 || bbox[2] > -28 || bbox[1] < -35 || bbox[3] > 7) {
    return NextResponse.json({ error: "Janela inválida." }, { status: 400 });
  }
  if (!dataOk(de) || !dataOk(ate) || de > ate) {
    return NextResponse.json({ error: "Período inválido.", solucao: "Use datas entre 28/03/2017 (início do Sentinel-2 L2A) e hoje, com o início antes do fim." }, { status: 400 });
  }
  // mais de ~1,5° de lado: dezenas de quadrículas e a nuvem perde o sentido para o lugar
  if (bbox[2] - bbox[0] > 1.5 || bbox[3] - bbox[1] > 1.5) {
    return NextResponse.json({ error: "Aproxime o mapa para buscar cenas.", codigo: "aproxime" }, { status: 422 });
  }
  try {
    const cenas = await buscarCenas(bbox, { de, ate, nuvemMax: nuvem });
    return NextResponse.json({ cenas, processamento: processamentoLigado(), de, ate, nuvem },
      { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    console.error("cenas do Copernicus:", e);
    return NextResponse.json({ error: "O catálogo do Copernicus não respondeu agora. Tente de novo em instantes." }, { status: 502 });
  }
}
