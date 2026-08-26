import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CATEGORIAS: { categoria: string; seletor: string }[] = [
  { categoria: "combustivel", seletor: '"amenity"="fuel"' },
  { categoria: "farmacia", seletor: '"amenity"="pharmacy"' },
  { categoria: "supermercado", seletor: '"shop"="supermarket"' },
  { categoria: "hospital", seletor: '"amenity"~"hospital|clinic"' },
  { categoria: "escola", seletor: '"amenity"="school"' },
  { categoria: "acesso_rodovia", seletor: '"highway"~"motorway|trunk|primary"' },
];

type OsmEl = {
  type: string; id: number;
  lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Busca POIs no Overpass ao redor do centroide do imóvel, grava no cache (`pois`)
 * e vincula via fn_vincular_pois. Nunca lança — falha vira job para o worker.
 */
export async function buscarEVincularPois(propertyId: string): Promise<number> {
  const admin = supabaseAdmin();
  try {
    const { data: prop } = await admin
      .from("properties")
      .select("tipo, municipality_id")
      .eq("id", propertyId)
      .single();
    const { data: geo } = await admin.rpc("fn_property_admin_geometry", { p_property_id: propertyId });
    if (!prop || !geo) return 0;

    // centroide simples do geojson
    const coords: [number, number][] = [];
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    walk((geo as { coordinates: unknown }).coordinates);
    if (!coords.length) return 0;
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

    const { data: raioCfg } = await admin
      .from("settings").select("valor")
      .eq("chave", prop.tipo === "rural" ? "poi_raio_rural_m" : "poi_raio_urbano_m")
      .single();
    const raio = Number(raioCfg?.valor ?? 10000);

    const blocos = CATEGORIAS
      .map((c) => `nwr[${c.seletor}](around:${raio},${lat},${lng});`)
      .join("\n");
    const query = `[out:json][timeout:20];(${blocos});out center 120;`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AriniMaps/1.0 (contato@arinimaps.com.br)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as { elements: OsmEl[] };

    const rows = [];
    for (const el of json.elements ?? []) {
      const plat = el.lat ?? el.center?.lat;
      const plng = el.lon ?? el.center?.lon;
      if (plat == null || plng == null) continue;
      const tags = el.tags ?? {};
      const categoria =
        tags.amenity === "fuel" ? "combustivel" :
        tags.amenity === "pharmacy" ? "farmacia" :
        tags.shop === "supermarket" ? "supermercado" :
        tags.amenity === "hospital" || tags.amenity === "clinic" ? "hospital" :
        tags.amenity === "school" ? "escola" :
        tags.highway ? "acesso_rodovia" : null;
      if (!categoria) continue;
      rows.push({
        categoria,
        nome: tags.name ?? (categoria === "acesso_rodovia" ? `Rodovia ${tags.ref ?? ""}`.trim() : null),
        geom: `SRID=4326;POINT(${plng} ${plat})`,
        municipality_id: prop.municipality_id,
        fonte: "osm",
        osm_id: `${el.type}/${el.id}`,
      });
    }
    if (rows.length) {
      await admin.from("pois").upsert(rows, { onConflict: "fonte,osm_id", ignoreDuplicates: true });
    }
    const { error: e1 } = await admin.rpc("fn_semear_pois_centro");
    if (e1) console.error("fn_semear_pois_centro:", e1.message);
    const { data: n, error: e2 } = await admin.rpc("fn_vincular_pois", { p_property_id: propertyId, p_raio_m: raio });
    if (e2) throw new Error(`fn_vincular_pois: ${e2.message}`);
    return Number(n ?? 0);
  } catch (e) {
    console.error("Overpass falhou, delegando ao worker:", e);
    await admin.from("jobs").insert({ tipo: "fetch_pois", payload: { property_id: propertyId } });
    return 0;
  }
}
