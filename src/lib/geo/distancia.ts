/**
 * Distâncias e pontos de interesse — formatação comum ao mapa, à ficha do
 * imóvel e à consulta do lote. Pode ser importado no cliente e no servidor.
 */

/** Rótulo de cada categoria de ponto de interesse (OpenStreetMap + IBGE). */
export const CATEGORIA_POI_LABEL: Record<string, string> = {
  combustivel: "Posto de combustível", farmacia: "Farmácia", supermercado: "Supermercado",
  hospital: "Hospital ou clínica", escola: "Escola", centro: "Centro da cidade", acesso_rodovia: "Acesso à rodovia",
};

/** Ícone curto por categoria, para listas compactas. */
export const CATEGORIA_POI_ICONE: Record<string, string> = {
  combustivel: "⛽", farmacia: "✚", supermercado: "🛒", hospital: "🏥", escola: "🎓", centro: "🏛", acesso_rodovia: "🛣",
};

/**
 * Distância em linha reta, como gente lê: "350 m", "1,2 km", "18 km".
 * Abaixo de 1 km arredonda para 10 m; até 10 km, uma casa decimal.
 */
export function formatDistancia(metros: number | null | undefined): string {
  if (metros == null || !Number.isFinite(Number(metros))) return "—";
  const m = Number(metros);
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10).toLocaleString("pt-BR")} m`;
  const km = m / 1000;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/** Distância geodésica (haversine) entre dois pontos [lng, lat], em metros. */
export function distanciaM(a: [number, number], b: [number, number]): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type PoiDistancia = { nome: string | null; categoria: string; distancia_m: number; destaque?: boolean };
