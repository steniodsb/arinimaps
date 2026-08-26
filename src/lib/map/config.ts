import type { StyleSpecification, RasterSourceSpecification } from "maplibre-gl";

/** Cores por status no mapa (legenda fixa). */
export const STATUS_CORES: Record<string, string> = {
  publicado: "#2E9E6B",
  em_negociacao: "#D9A62E",
  vendido: "#8E9B93",
};

export const CENTRO_REGIAO: [number, number] = [-50.196, -19.728]; // Iturama

/**
 * Fonte de satélite, em ordem de preferência:
 *
 * 1. MapTiler (env NEXT_PUBLIC_MAPTILER_KEY) — licença própria para uso
 *    comercial, alta resolução até z20. Free tier cobre bem a região piloto.
 * 2. Esri World Imagery — alta resolução, mas os termos exigem uso via
 *    tecnologia Esri; serve para desenvolvimento e demonstração.
 *
 * MAXZOOM 17 NÃO É CHUTE: medido em 26/08/2026, o Esri tem imagem até z17
 * em Iturama, Limeira do Oeste e União de Minas, e devolve placeholder
 * ("Map data not yet available") em z18. Declarar 19 fazia o mapa pedir
 * tiles inexistentes e a tela ficava cinza justamente no zoom do lote;
 * com 17, o MapLibre amplia o último tile real (overzoom).
 */
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export const SATELITE: RasterSourceSpecification = MAPTILER_KEY
  ? {
      type: "raster",
      tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© MapTiler © OpenStreetMap contributors",
    }
  : {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 17,
      attribution: "Imagery © Esri",
    };

/**
 * Sentinel-2 cloudless (EOX) — imagem de satélite verdadeiramente aberta
 * (CC BY 4.0, uso comercial permitido). Resolução de 10 m: mostra a divisa
 * de uma fazenda, mas não resolve lote urbano. Fica como camada alternativa.
 */
export const SATELITE_ABERTO: RasterSourceSpecification = {
  type: "raster",
  tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Sentinel-2 cloudless por <a href="https://s2maps.eu">EOX</a> (CC BY 4.0)',
};

/** Um único style com as duas bases raster; alternamos por visibility. */
export const ESTILO_BASE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    ruas: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
    satelite: SATELITE,
  },
  layers: [
    { id: "base-ruas", type: "raster", source: "ruas", layout: { visibility: "visible" } },
    { id: "base-satelite", type: "raster", source: "satelite", layout: { visibility: "none" } },
  ],
};

export type BaseMapa = "ruas" | "satelite";
