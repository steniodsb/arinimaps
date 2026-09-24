import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Imóveis do CAR no retângulo da tela (`?bbox=oeste,sul,leste,norte`).
 *
 * Só atende a partir de uma área de ~0,5° de lado: a malha é para o zoom de
 * município em diante — pedir a região inteira seriam 10 mil polígonos para o
 * navegador desenhar sem ninguém conseguir clicar em nenhum.
 */
export async function GET(request: Request) {
  const b = (new URL(request.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite)) {
    return NextResponse.json({ error: "Informe bbox=oeste,sul,leste,norte." }, { status: 400 });
  }
  const [x0, y0, x1, y1] = b;
  if (x1 - x0 > 0.6 || y1 - y0 > 0.6) {
    return NextResponse.json({ type: "FeatureCollection", features: [], aproxime: true });
  }
  const { data, error } = await supabaseAdmin().rpc("fn_car_bbox", { p_x0: x0, p_y0: y0, p_x1: x1, p_y1: y1 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
}
