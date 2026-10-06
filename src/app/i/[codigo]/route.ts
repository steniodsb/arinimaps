import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

// Link curto de compartilhamento: /i/ARINI-MAP-000001 → página do imóvel
export async function GET(request: Request, ctx: RouteContext<"/i/[codigo]">) {
  const { codigo } = await ctx.params;
  // §1.1: cada abertura do link compartilhado conta como evento do imóvel
  const { data: prop } = await supabaseAdmin().from("properties").select("id").eq("codigo", codigo).maybeSingle();
  if (prop?.id) {
    await registrarEventoImovel({
      propertyId: prop.id, tipo: "compartilhamento", request,
      detalhe: { codigo, referer: request.headers.get("referer") ?? null },
    });
  }
  redirect(`/imovel/${codigo}`);
}
