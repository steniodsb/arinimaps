import type { StyleSpecification, RasterSourceSpecification } from "maplibre-gl";

/** Cores por status no mapa (legenda fixa). */
export const STATUS_CORES: Record<string, string> = {
  publicado: "#3FCF7F",
  em_negociacao: "#E0B341",
  vendido: "#7E9187",
};

export const CENTRO_REGIAO: [number, number] = [-50.196, -19.728]; // Iturama

/**
 * Fonte de satélite, em ordem de preferência:
 *
 * 1. MapTiler (env NEXT_PUBLIC_MAPTILER_KEY) — licença própria para uso
 *    comercial, alta resolução até z20. Free tier cobre bem a região piloto.
 * 2. Esri World Imagery via **Wayback**, com o release fixado — alta resolução,
 *    mas os termos exigem uso via tecnologia Esri; serve para desenvolvimento e
 *    demonstração (a licença comercial segue pendente, ver PENDENCIAS.md).
 *
 * POR QUE UM RELEASE FIXO DO WAYBACK, E NÃO O MOSAICO "ATUAL"
 * -----------------------------------------------------------
 * O World_Imagery padrão (server.arcgisonline.com) serve o mosaico corrente, e
 * o mosaico corrente MUDA sem aviso. Medição de 10/09/2026 no tile do centro de
 * Iturama (z16/23630/36432), contando pixel claro e sem cor:
 *
 *   World Imagery atual   = Wayback 2026-08-05 ... 44,2% de nuvem
 *   Wayback 2026-04-30 .................................. 3,5%
 *   Wayback 2025-10-23 .................................. 2,6%   ← escolhido
 *   Wayback 2023-10-11 .................................. 2,9%
 *
 * Ou seja: a nuvem sobre Iturama ENTROU na atualização de agosto/2026. Trocar
 * para o Clarity (30/08/2026) resolveu porque o Clarity serve outra passagem —
 * mas ele é igualmente um alvo móvel, e no pior tile de Limeira do Oeste ainda
 * media 4,6% de nuvem, enquanto qualquer release do Wayback ali dá 0,0%.
 *
 * O Wayback existe justamente para isso: cada release é uma foto congelada do
 * mosaico, imutável por definição. Fixando o release 20512 (2025-10-23), a
 * imagem não volta a ficar nublada na próxima atualização da Esri. O preço é
 * que a imagem também não rejuvenesce sozinha — para cartografia urbana é troca
 * boa: nuvem sobre o lote atrapalha mais do que imagem de um ano atrás.
 *
 * MAXZOOM 17 NÃO É CHUTE: medido em 26/08, reconfirmado em 30/08 e de novo no
 * release 20512 em 10/09/2026 — há imagem até z17 nos três municípios e z18
 * devolve 404. Declarar 19 fazia o mapa pedir tiles inexistentes e a tela ficava
 * cinza justamente no zoom do lote; com 17, o MapLibre amplia o último tile real
 * (overzoom).
 *
 * Para trocar de release: a lista está em
 * https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json
 * (196 releases). Meça antes de trocar — `scripts/mede-nuvem.mjs`.
 */
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/**
 * Release do Wayback em uso. Trocar aqui troca em todo lugar — inclusive no
 * medidor de nuvem do painel (src/lib/map/nuvem.ts), que confere este mesmo
 * release sobre os municípios cadastrados.
 */
export const SATELITE_RELEASE = "20512"; // World Imagery (Wayback 2025-10-23)

export const urlTileSatelite = (
  z: number | string, x: number | string, y: number | string, release = SATELITE_RELEASE
) =>
  `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${release}/${z}/${y}/${x}`;

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
      // os {z}/{x}/{y} são substituídos pelo MapLibre na hora de pedir o tile
      tiles: [urlTileSatelite("{z}", "{x}", "{y}")],
      tileSize: 256,
      maxzoom: 17,
      attribution: "Imagery © Esri (World Imagery, 2025-10-23)",
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
