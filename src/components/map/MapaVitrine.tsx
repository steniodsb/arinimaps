"use client";

/**
 * Mapa-vitrine da página inicial: um MapLibre SEM interação que passeia em
 * loop por três cenas do Pontal — a malha rural do CAR, os lotes urbanos de
 * Iturama e os municípios da região — sobre o satélite.
 *
 * Custo: 2D (sem terreno), sem controles, vetoriais do CAR e dos lotes vindos
 * dos tiles já existentes em /api/tiles. O passeio é uma cadeia de `easeTo`
 * encadeada por `moveend` (nada de requestAnimationFrame próprio), pausa
 * quando a seção sai da tela e vira uma vista parada quando o visitante pede
 * menos movimento (prefers-reduced-motion).
 */

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from "maplibre-gl";
import { carregarMaplibre } from "@/lib/map/maplibre";
import { SATELITE, STATUS_CORES } from "@/lib/map/config";
import { CENAS } from "./cenasVitrine";

type Props = {
  /** Chamado quando a câmera chega numa cena (índice em CENAS). */
  onCena?: (indice: number) => void;
  /** Chamado quando o satélite da primeira cena está desenhado. */
  onPronto?: () => void;
};

const COR_CAR = "#FF9D3D";
const COR_LOTE = "#FFE9A8";
const COR_MUNICIPIO = "#3FCF7F";

/** Deriva lenta dentro da cena. */
const DURACAO_PASSEIO = 8000;
/** Transição entre uma cena e a seguinte. */
const DURACAO_TROCA = 3500;

const VAZIO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Cor do imóvel pelo status (a `cor` já vem calculada do banco; `status` é o reserva). */
const CORES_STATUS = [
  "match", ["coalesce", ["get", "cor"], ["get", "status"]],
  ...Object.entries(STATUS_CORES).flat(),
  STATUS_CORES.publicado,
];

const linear = (t: number) => t;
const suave = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Espera o mapa terminar de baixar e desenhar o que está na tela, com teto. */
function esperarMapa(map: MLMap, tetoMs: number) {
  return new Promise<void>((ok) => {
    if (map.loaded() && map.areTilesLoaded()) { ok(); return; }
    const fim = () => { clearTimeout(timer); map.off("idle", fim); ok(); };
    const timer = setTimeout(fim, tetoMs);
    map.on("idle", fim);
  });
}

/** Um ponto no centro da caixa de cada imóvel: de longe, o polígono vira marcador. */
function centrosDe(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features ?? []) {
    const pontos: number[][] = [];
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === "number") pontos.push(c as number[]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
    if (!pontos.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pontos) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [(minX + maxX) / 2, (minY + maxY) / 2] },
      properties: f.properties ?? {},
    });
  }
  return { type: "FeatureCollection", features };
}

async function pegarGeoJSON(url: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const dados = (await r.json()) as GeoJSON.FeatureCollection;
    return dados?.type === "FeatureCollection" ? dados : null;
  } catch {
    return null;
  }
}

export default function MapaVitrine({ onCena, onPronto }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  // callbacks em ref: o efeito do mapa roda uma vez só e sempre chama a versão atual
  const onCenaRef = useRef(onCena);
  const onProntoRef = useRef(onPronto);
  useEffect(() => {
    onCenaRef.current = onCena;
    onProntoRef.current = onPronto;
  }, [onCena, onPronto]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    let cancelado = false;
    let mapa: MLMap | undefined;
    let observador: IntersectionObserver | undefined;

    (async () => {
      const maplibregl = await carregarMaplibre();
      if (cancelado) return;

      const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const origem = window.location.origin;

      const estilo: StyleSpecification = {
        version: 8,
        sources: {
          satelite: SATELITE,
          car: { type: "vector", tiles: [`${origem}/api/tiles/car/{z}/{x}/{y}.pbf`], minzoom: 7, maxzoom: 13 },
          lotes: { type: "vector", tiles: [`${origem}/api/tiles/lotes/{z}/{x}/{y}.pbf`], minzoom: 15, maxzoom: 17 },
          municipios: { type: "geojson", data: VAZIO },
          imoveis: { type: "geojson", data: VAZIO },
          "imoveis-centros": { type: "geojson", data: VAZIO },
        },
        layers: [
          { id: "satelite", type: "raster", source: "satelite" },
          // malha do CAR: some na cena urbana (acima do z15 só atrapalharia os lotes)
          {
            id: "car-fill", type: "fill", source: "car", "source-layer": "car", maxzoom: 15,
            paint: { "fill-color": COR_CAR, "fill-opacity": 0.04 },
          },
          {
            id: "car-linha", type: "line", source: "car", "source-layer": "car", maxzoom: 15,
            paint: { "line-color": COR_CAR, "line-width": 0.8, "line-opacity": 0.8 },
          },
          {
            id: "lotes-linha", type: "line", source: "lotes", "source-layer": "lotes", minzoom: 15,
            paint: {
              "line-color": COR_LOTE,
              "line-width": 1,
              "line-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.45, 16, 0.9] as never,
            },
          },
          {
            id: "municipios-linha", type: "line", source: "municipios",
            paint: {
              "line-color": COR_MUNICIPIO,
              "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 13, 1] as never,
              "line-opacity": 0.75,
              "line-dasharray": [3, 2],
            },
          },
          {
            id: "imoveis-fill", type: "fill", source: "imoveis",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": CORES_STATUS as never, "fill-opacity": 0.32 },
          },
          {
            id: "imoveis-linha", type: "line", source: "imoveis",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "line-color": CORES_STATUS as never, "line-width": 2 },
          },
          {
            id: "imoveis-ponto", type: "circle", source: "imoveis",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-color": CORES_STATUS as never, "circle-radius": 6,
              "circle-stroke-width": 2, "circle-stroke-color": "#0A1310",
            },
          },
          // de longe o polígono some; cada imóvel vira um marcador na cor do status
          {
            id: "imoveis-marcador", type: "circle", source: "imoveis-centros", maxzoom: 12.5,
            paint: {
              "circle-color": CORES_STATUS as never,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4.5, 12, 7] as never,
              "circle-stroke-width": 1.5, "circle-stroke-color": "#FFFFFF",
            },
          },
        ],
      };

      const map = new maplibregl.Map({
        container: el,
        style: estilo,
        center: CENAS[0].centro,
        zoom: CENAS[0].zoom,
        interactive: false,
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer: false },
        fadeDuration: 400,
      });
      mapa = map;
      mapRef.current = map;
      // tile fora do ar ou fonte lenta não pode derrubar a vitrine: fica no silêncio
      map.on("error", () => {});

      // ---------- passeio ----------
      let atual = 0;
      let visivel = true;
      let pronto = false;
      let fase: "parado" | "passeio" | "troca" = "parado";
      // `easeTo` chama `stop()` por dentro e isso dispara `moveend` de forma
      // síncrona; sem esta trava a cadeia se chamaria de novo antes de a
      // animação nova começar
      let ocupado = false;

      const mover = (proxima: typeof fase, opcoes: Parameters<MLMap["easeTo"]>[0]) => {
        fase = proxima;
        ocupado = true;
        map.easeTo(opcoes);
        ocupado = false;
      };

      /** Deriva lenta e linear pela cena atual (o "Ken Burns" do mapa). */
      const passear = () => {
        const cena = CENAS[atual];
        mover("passeio", {
          center: [cena.centro[0] + cena.deriva[0], cena.centro[1] + cena.deriva[1]],
          zoom: cena.zoom + 0.12,
          duration: DURACAO_PASSEIO,
          easing: linear,
        });
      };

      /** Vai para a cena `indice` com transição suave; ao chegar, avisa e passeia. */
      const irPara = (indice: number) => {
        atual = indice;
        const cena = CENAS[atual];
        mover("troca", { center: cena.centro, zoom: cena.zoom, duration: DURACAO_TROCA, easing: suave });
      };

      const aoTerminarMovimento = () => {
        // `resize` também dispara moveend no meio da animação: ignora enquanto a câmera anda
        if (ocupado || cancelado || !visivel || !pronto || map.isMoving()) return;
        if (fase === "passeio") irPara((atual + 1) % CENAS.length);
        else if (fase === "troca") { onCenaRef.current?.(atual); passear(); }
      };
      map.on("moveend", aoTerminarMovimento);

      // pausa fora da tela, retoma quando volta
      if ("IntersectionObserver" in window && !reduzido) {
        observador = new IntersectionObserver((entradas) => {
          const agora = entradas.some((e) => e.isIntersecting);
          if (agora === visivel) return;
          visivel = agora;
          if (!visivel) { map.stop(); fase = "parado"; return; }
          if (pronto && !map.isMoving()) irPara(atual);
        }, { threshold: 0.05 });
        observador.observe(el);
      }

      map.on("load", async () => {
        const [municipios, imoveis] = await Promise.all([
          pegarGeoJSON("/api/geo/municipios"),
          pegarGeoJSON("/api/geo/imoveis"),
        ]);
        if (cancelado) return;
        if (municipios) (map.getSource("municipios") as GeoJSONSource | undefined)?.setData(municipios);
        if (imoveis) {
          (map.getSource("imoveis") as GeoJSONSource | undefined)?.setData(imoveis);
          (map.getSource("imoveis-centros") as GeoJSONSource | undefined)?.setData(centrosDe(imoveis));
        }

        // só mostra (e só começa a andar) com o satélite da primeira cena desenhado
        await esperarMapa(map, 5000);
        if (cancelado) return;
        pronto = true;
        onProntoRef.current?.();
        onCenaRef.current?.(0);
        if (reduzido) return; // vista parada da cena rural
        if (visivel) passear();
      });
    })();

    return () => {
      cancelado = true;
      observador?.disconnect();
      mapa?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
