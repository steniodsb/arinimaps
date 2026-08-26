// Retry de POIs quando o Overpass falhou no momento da publicação.
const CATEGORIAS = [
  { categoria: "combustivel", seletor: '"amenity"="fuel"' },
  { categoria: "farmacia", seletor: '"amenity"="pharmacy"' },
  { categoria: "supermercado", seletor: '"shop"="supermarket"' },
  { categoria: "hospital", seletor: '"amenity"~"hospital|clinic"' },
  { categoria: "escola", seletor: '"amenity"="school"' },
  { categoria: "acesso_rodovia", seletor: '"highway"~"motorway|trunk|primary"' },
];

export async function fetchPois(payload, db) {
  const { property_id } = payload;
  const { rows: [prop] } = await db.query(`
    select p.tipo, st_x(g.centroid) as lng, st_y(g.centroid) as lat
    from properties p join property_geometries g on g.property_id = p.id
    where p.id = $1`, [property_id]);
  if (!prop) throw new Error("imóvel sem geometria");

  const { rows: [cfg] } = await db.query(
    `select valor from settings where chave = $1`,
    [prop.tipo === "rural" ? "poi_raio_rural_m" : "poi_raio_urbano_m"]);
  const raio = Number(cfg?.valor ?? 10000);

  const blocos = CATEGORIAS.map((c) => `nwr[${c.seletor}](around:${raio},${prop.lat},${prop.lng});`).join("");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(`[out:json][timeout:25];(${blocos});out center 120;`),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AriniMaps/1.0 (contato@arinimaps.com.br)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = await res.json();

  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const tags = el.tags ?? {};
    const categoria =
      tags.amenity === "fuel" ? "combustivel" :
      tags.amenity === "pharmacy" ? "farmacia" :
      tags.shop === "supermarket" ? "supermercado" :
      tags.amenity === "hospital" || tags.amenity === "clinic" ? "hospital" :
      tags.amenity === "school" ? "escola" :
      tags.highway ? "acesso_rodovia" : null;
    if (!categoria) continue;
    await db.query(`
      insert into pois (categoria, nome, geom, fonte, osm_id)
      values ($1, $2, st_setsrid(st_point($3, $4), 4326), 'osm', $5)
      on conflict (fonte, osm_id) do nothing`,
      [categoria, tags.name ?? null, lng, lat, `${el.type}/${el.id}`]);
  }
  await db.query(`select fn_semear_pois_centro()`);
  await db.query(`select fn_vincular_pois($1, $2)`, [property_id, raio]);
}
