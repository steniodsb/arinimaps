import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Camadas de cartografia prontas, com URL de tiles no storage público.
export async function GET() {
  const { data } = await supabaseAdmin()
    .from("cartography_layers")
    .select("id, nome, tiles_path, min_zoom, max_zoom, opacidade_padrao")
    .eq("status", "pronto")
    .not("tiles_path", "is", null);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media`;
  return NextResponse.json(
    (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      tiles: `${base}/${c.tiles_path}/{z}/{x}/{y}.png`,
      min_zoom: c.min_zoom,
      max_zoom: c.max_zoom,
      opacidade: Number(c.opacidade_padrao),
    })),
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
