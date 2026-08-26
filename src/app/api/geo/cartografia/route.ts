import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Camadas de cartografia prontas: raster (pirâmide de tiles) e vetorial
// (plantas DWG convertidas para GeoJSON), ambas servidas do storage público.
export async function GET() {
  const { data } = await supabaseAdmin()
    .from("cartography_layers")
    .select("id, nome, tipo, tiles_path, min_zoom, max_zoom, opacidade_padrao")
    .eq("status", "pronto")
    .not("tiles_path", "is", null);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media`;
  return NextResponse.json(
    (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      tiles: c.tipo === "raster" ? `${base}/${c.tiles_path}/{z}/{x}/{y}.png` : undefined,
      geojson: c.tipo === "vector" ? `${base}/${c.tiles_path}` : undefined,
      min_zoom: c.min_zoom,
      max_zoom: c.max_zoom,
      opacidade: Number(c.opacidade_padrao),
    })),
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
