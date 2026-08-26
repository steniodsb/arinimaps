import "server-only";
import DxfParser from "dxf-parser";
import proj4 from "proj4";

/**
 * Converte planta CAD (DXF) georreferenciada em GeoJSON WGS84.
 *
 * As plantas da região vêm em UTM SIRGAS 2000 (zona 22S para o Pontal do
 * Triângulo). A zona é detectada pela faixa de coordenadas — se o arquivo
 * já vier em graus, passa direto.
 */

const ZONAS: Record<number, string> = {
  21: "+proj=utm +zone=21 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  22: "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  23: "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  24: "+proj=utm +zone=24 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};

export type ResultadoDxf = {
  geojson: GeoJSON.FeatureCollection;
  linhas: number;
  layersCad: number;
  bbox: [number, number, number, number];
  zona: number | "graus";
};

const arred = (n: number) => Math.round(n * 1e6) / 1e6;
const ehUtmPlausivel = (x: number, y: number) =>
  x > 100_000 && x < 900_000 && y > 6_000_000 && y < 10_000_000;
const ehGrausBrasil = (x: number, y: number) =>
  x > -75 && x < -33 && y > -34 && y < 6;

export function converterDxf(conteudo: string, zonaForcada?: number): ResultadoDxf {
  const dxf = new DxfParser().parseSync(conteudo) as {
    entities?: { type: string; layer?: string; vertices?: { x: number; y: number }[]; closed?: boolean; shape?: boolean }[];
  };
  const entidades = dxf?.entities ?? [];
  if (!entidades.length) throw new Error("DXF sem entidades — confira a exportação do CAD.");

  // amostra para descobrir o sistema de coordenadas
  const amostra: [number, number][] = [];
  for (const e of entidades) {
    for (const v of e.vertices ?? []) {
      if (Number.isFinite(v.x) && Number.isFinite(v.y)) amostra.push([v.x, v.y]);
      if (amostra.length > 500) break;
    }
    if (amostra.length > 500) break;
  }
  if (!amostra.length) throw new Error("DXF sem coordenadas utilizáveis.");

  const mediaX = amostra.reduce((s, p) => s + p[0], 0) / amostra.length;
  const mediaY = amostra.reduce((s, p) => s + p[1], 0) / amostra.length;

  let zona: number | "graus";
  let transformar: (p: [number, number]) => [number, number];
  let valido: (p: [number, number]) => boolean;

  if (ehGrausBrasil(mediaX, mediaY)) {
    zona = "graus";
    transformar = (p) => p;
    valido = (p) => ehGrausBrasil(p[0], p[1]);
  } else if (ehUtmPlausivel(mediaX, mediaY)) {
    // zona informada, ou deduzida testando qual devolve longitude no Brasil
    zona = zonaForcada ?? 22;
    if (!zonaForcada) {
      for (const z of [22, 23, 21, 24]) {
        const [lng, lat] = proj4(ZONAS[z], "EPSG:4326", [mediaX, mediaY]);
        if (ehGrausBrasil(lng, lat)) { zona = z; break; }
      }
    }
    const def = ZONAS[zona as number];
    transformar = (p) => proj4(def, "EPSG:4326", p) as [number, number];
    valido = (p) => ehUtmPlausivel(p[0], p[1]);
  } else {
    throw new Error(
      "O DXF não parece georreferenciado (coordenadas fora de UTM e de graus). " +
      "No CAD, verifique se o desenho está em coordenadas do terreno."
    );
  }

  const porLayer = new Map<string, [number, number][][]>();
  let linhas = 0;
  const bbox: [number, number, number, number] = [180, 90, -180, -90];

  const adicionar = (layer: string, pontos: [number, number][]) => {
    const validos = pontos.filter(valido);
    if (validos.length < 2) return;
    const linha = validos.map((p) => {
      const [lng, lat] = transformar(p);
      const c: [number, number] = [arred(lng), arred(lat)];
      if (c[0] < bbox[0]) bbox[0] = c[0];
      if (c[1] < bbox[1]) bbox[1] = c[1];
      if (c[0] > bbox[2]) bbox[2] = c[0];
      if (c[1] > bbox[3]) bbox[3] = c[1];
      return c;
    });
    if (!porLayer.has(layer)) porLayer.set(layer, []);
    porLayer.get(layer)!.push(linha);
    linhas++;
  };

  for (const e of entidades) {
    const layer = e.layer ?? "0";
    const pts = (e.vertices ?? [])
      .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y))
      .map((v) => [v.x, v.y] as [number, number]);
    if (e.type === "LINE" && pts.length >= 2) adicionar(layer, pts);
    else if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && pts.length >= 2) {
      if ((e.closed || e.shape) && pts.length > 2) pts.push(pts[0]);
      adicionar(layer, pts);
    }
  }

  if (!linhas) throw new Error("Nenhuma linha aproveitável no DXF (só blocos, textos ou hachuras?).");

  return {
    geojson: {
      type: "FeatureCollection",
      features: [...porLayer.entries()].map(([layer, l]) => ({
        type: "Feature",
        geometry: { type: "MultiLineString", coordinates: l },
        properties: { layer },
      })),
    },
    linhas,
    layersCad: porLayer.size,
    bbox,
    zona,
  };
}
