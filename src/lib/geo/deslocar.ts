/** Desloca todas as coordenadas de um GeoJSON (ajuste fino da planta no mapa). */
export function deslocarGeoJSON<T extends GeoJSON.FeatureCollection>(
  fc: T,
  dLng: number,
  dLat: number
): T {
  if (!dLng && !dLat) return fc;
  const mover = (c: unknown): unknown => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      return [c[0] + dLng, c[1] + dLat];
    }
    return Array.isArray(c) ? c.map(mover) : c;
  };
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry && "coordinates" in f.geometry
        ? { ...f.geometry, coordinates: mover((f.geometry as { coordinates: unknown }).coordinates) }
        : f.geometry,
    })),
  } as T;
}

/** metros → graus na latitude informada. */
export function metrosParaGraus(leste: number, norte: number, lat = -19.5) {
  return {
    lng: leste / (111320 * Math.cos((lat * Math.PI) / 180)),
    lat: norte / 110540,
  };
}
