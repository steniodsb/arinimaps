import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

/** Calibração da planta: ajuste fino em metros, opacidade e faixa de zoom. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/cartografia/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Restrito à Arini." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, number> = {};
  if (Number.isFinite(body.offset_leste_m)) patch.offset_leste_m = Number(body.offset_leste_m);
  if (Number.isFinite(body.offset_norte_m)) patch.offset_norte_m = Number(body.offset_norte_m);
  if (Number.isFinite(body.opacidade)) patch.opacidade_padrao = Math.min(1, Math.max(0.05, Number(body.opacidade)));
  if (Number.isFinite(body.min_zoom)) patch.min_zoom = Number(body.min_zoom);
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nada para ajustar." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("cartography_layers").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    user_id: a.userId, acao: "cartografia_calibrada",
    entidade: "cartography_layers", entidade_id: id, dados_depois: patch,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/cartografia/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (a?.role !== "admin_central") {
    return NextResponse.json({ error: "Só a diretoria remove camadas." }, { status: 403 });
  }
  const admin = supabaseAdmin();
  const { data: camada } = await admin.from("cartography_layers").select("tiles_path, nome").eq("id", id).single();
  const { error } = await admin.from("cartography_layers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({
    user_id: a.userId, acao: "cartografia_removida",
    entidade: "cartography_layers", entidade_id: id, dados_antes: { nome: camada?.nome },
  });
  return NextResponse.json({ ok: true });
}
