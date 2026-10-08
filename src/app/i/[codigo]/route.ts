import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

// Link curto de compartilhamento: /i/AIB-000001 → página do imóvel
export async function GET(request: Request, ctx: RouteContext<"/i/[codigo]">) {
  const { codigo: pedido } = await ctx.params;
  // links antigos (ARINI-MAP-000001) seguem valendo
  const codigo = pedido.replace(/^ARINI-MAP-(\d{6})$/i, "AIB-$1");
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
