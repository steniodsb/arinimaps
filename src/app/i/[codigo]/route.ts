import { redirect } from "next/navigation";

// Link curto de compartilhamento: /i/ARINI-MAP-000001 → página do imóvel
export async function GET(_request: Request, ctx: RouteContext<"/i/[codigo]">) {
  const { codigo } = await ctx.params;
  redirect(`/imovel/${codigo}`);
}
