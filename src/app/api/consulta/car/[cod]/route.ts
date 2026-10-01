import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { ADAPTADORES, type Bbox, type ResultadoFonte } from "@/lib/rural/adaptadores";
import { ipDoPedido, limitar, respostaLimite } from "@/lib/seguranca/limite";

export const maxDuration = 120;

/** Resultado em cache vale por 7 dias: as bases oficiais não mudam de hora em hora. */
const VALIDADE_MS = 7 * 86_400_000;
const RAIO_M = 2000;

/**
 * "Consultar informações" de uma área do CAR (pedido do Carlos, 01/10/2026).
 *
 * Cruza a área com as fontes oficiais ao vivo. Exige conta: cada consulta bate
 * em nove serviços públicos, e sem login viraria um jeito de usar o sistema
 * como robô contra os órgãos. Toda consulta fica registrada (usuário, área,
 * data, IP) — o histórico serve à auditoria e, depois, à cobrança por consulta.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/consulta/car/[cod]">) {
  const cod = decodeURIComponent((await ctx.params).cod);
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para consultar as informações da área." }, { status: 401 });
  }

  const limite = await limitar(`consulta:${user.id}`, 20, 3600);
  if (!limite.permitido) return respostaLimite(limite, "consulta");

  const admin = supabaseAdmin();
  const chave = `car:${cod}`;
  const { data: bboxRaw } = await admin.rpc("fn_car_bbox_imovel", { p_cod: cod, p_buffer_m: RAIO_M });
  if (!bboxRaw) return NextResponse.json({ error: "Área não encontrada no CAR importado." }, { status: 404 });

  await admin.from("consultas_area_log").insert({ user_id: user.id, chave, acao: "consulta", ip: ipDoPedido(request) });

  // só refaz as fontes vencidas ou que falharam na última vez
  const { data: emCache } = await admin.from("consultas_area")
    .select("fonte_id, erro, consultado_em").eq("chave", chave).eq("raio_m", RAIO_M);
  const frescas = new Set(
    (emCache ?? [])
      .filter((c) => !c.erro && Date.now() - new Date(c.consultado_em).getTime() < VALIDADE_MS)
      .map((c) => c.fonte_id)
  );
  const pendentes = ADAPTADORES.filter((a) => a.id !== "car" && !frescas.has(a.id));

  const resultados: ResultadoFonte[] = await Promise.all(pendentes.map((a) => a.fn(bboxRaw as Bbox)));
  for (const r of resultados) {
    await admin.from("consultas_area").upsert({
      chave, fonte_id: r.fonte_id, raio_m: RAIO_M,
      resultado: { itens: r.itens }, quantidade: r.quantidade, incide: r.incide,
      erro: r.erro ?? null, consultado_em: new Date().toISOString(),
    }, { onConflict: "chave,fonte_id,raio_m" });
  }

  return NextResponse.json({
    ok: true,
    consultadas: resultados.length,
    do_cache: frescas.size,
    falharam: resultados.filter((r) => r.erro).map((r) => r.fonte_id),
  });
}
