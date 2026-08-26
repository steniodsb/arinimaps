import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Camadas de cartografia prontas: raster (pirâmide de tiles) e vetorial
// (plantas CAD convertidas). O ajuste fino vai em graus, já convertido dos
// metros salvos na calibração — o mapa desloca a planta ao carregar.
export async function GET() {
  const { data } = await supabaseAdmin()
    .from("cartography_layers")
    .select("id, nome, tipo, tiles_path, min_zoom, max_zoom, opacidade_padrao, datum, offset_leste_m, offset_norte_m, municipality:municipalities(nome)")
    .eq("status", "pronto")
    .not("tiles_path", "is", null);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media`;
  return NextResponse.json(
    (data ?? []).map((c) => {
      const mun = c.municipality as unknown as { nome: string } | null;
      // metros → graus (latitude ~-19.5): 1° lat ≈ 110.540 m, 1° lng ≈ 104.900 m
      const offLat = Number(c.offset_norte_m) / 110540;
      const offLng = Number(c.offset_leste_m) / (111320 * Math.cos((-19.5 * Math.PI) / 180));
      return {
        id: c.id,
        nome: c.nome,
        municipio: mun?.nome ?? null,
        tipo: c.tipo,
        tiles: c.tipo === "raster" ? `${base}/${c.tiles_path}/{z}/{x}/{y}.png` : undefined,
        geojson: c.tipo === "vector" ? `${base}/${c.tiles_path}` : undefined,
        min_zoom: c.min_zoom,
        max_zoom: c.max_zoom,
        opacidade: Number(c.opacidade_padrao),
        datum: c.datum,
        offset: { lng: offLng, lat: offLat, leste_m: Number(c.offset_leste_m), norte_m: Number(c.offset_norte_m) },
      };
    }),
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
