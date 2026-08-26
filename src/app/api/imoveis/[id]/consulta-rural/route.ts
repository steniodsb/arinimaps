import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { consultarAnm, consultarFunai, consultarProdes, type Bbox, type ResultadoFonte } from "@/lib/rural/adaptadores";
import { buscarEVincularPois } from "@/lib/overpass";

export const maxDuration = 120;

/** Roda a consulta territorial: cruza a geometria do imóvel com as fontes oficiais. */
export async function POST(request: Request, ctx: RouteContext<"/api/imoveis/[id]/consulta-rural">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Consulta territorial é da equipe Arini." }, { status: 403 });

  const { raio_m = 5000 } = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data: bboxRaw, error: bboxErro } = await admin.rpc("fn_property_bbox", {
    p_property_id: id, p_buffer_m: raio_m,
  });
  if (bboxErro || !bboxRaw) {
    return NextResponse.json({ error: "Imóvel sem geometria — desenhe a área antes de consultar." }, { status: 400 });
  }
  const bbox = bboxRaw as Bbox;

  // as três fontes ao vivo em paralelo; nenhuma derruba a consulta
  const resultados: ResultadoFonte[] = await Promise.all([
    consultarAnm(bbox),
    consultarFunai(bbox),
    consultarProdes(bbox),
  ]);

  for (const r of resultados) {
    await admin.from("consultas_rurais").upsert({
      property_id: id,
      fonte_id: r.fonte_id,
      raio_m,
      resultado: { itens: r.itens },
      quantidade: r.quantidade,
      incide: r.incide,
      erro: r.erro ?? null,
      consultado_em: new Date().toISOString(),
    }, { onConflict: "property_id,fonte_id,raio_m" });
    await admin.from("fontes_externas")
      .update({ ultima_consulta: new Date().toISOString() })
      .eq("id", r.fonte_id);
  }

  // POIs e acessos reaproveitam o motor que já alimenta a página do imóvel
  const pois = await buscarEVincularPois(id).catch(() => 0);

  await logAudit({
    user_id: a.userId, acao: "consulta_rural_executada",
    entidade: "consultas_rurais", property_id: id,
    dados_depois: { raio_m, fontes: resultados.map((r) => ({ id: r.fonte_id, n: r.quantidade, erro: r.erro })) },
  });

  return NextResponse.json({
    ok: true,
    raio_m,
    pois_vinculados: pois,
    fontes: resultados.map((r) => ({ id: r.fonte_id, quantidade: r.quantidade, incide: r.incide, erro: r.erro })),
  });
}

/** Relatório territorial consolidado (o que já foi consultado). */
export async function GET(_request: Request, ctx: RouteContext<"/api/imoveis/[id]/consulta-rural">) {
  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin().rpc("fn_consulta_rural", { p_property_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
