import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Lotes urbanos no retângulo da tela (`?bbox=oeste,sul,leste,norte`).
 * Só atende do zoom de bairro em diante: um retângulo de até ~6 km de lado.
 * Mais afastado que isso seriam dezenas de milhares de lotes que ninguém
 * distingue na tela.
 */
export async function GET(request: Request) {
  const b = (new URL(request.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite)) {
    return NextResponse.json({ error: "Informe bbox=oeste,sul,leste,norte." }, { status: 400 });
  }
  const [x0, y0, x1, y1] = b;
  if (x1 - x0 > 0.06 || y1 - y0 > 0.06) {
    return NextResponse.json({ type: "FeatureCollection", features: [], aproxime: true });
  }
  const { data, error } = await supabaseAdmin().rpc("fn_lotes_bbox", { p_x0: x0, p_y0: y0, p_x1: x1, p_y1: y1, p_limite: 9000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
}
