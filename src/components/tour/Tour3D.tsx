"use client";

/**
 * Tour 3D do imóvel: terreno real (DEM Terrarium) + satélite + polígono dourado
 * + roteiro de câmera determinístico em função do tempo t.
 *
 * O MESMO roteiro serve para:
 *  - reprodução ao vivo (requestAnimationFrame);
 *  - gravação do vídeo no worker (?record=1 expõe window.__ARINI_TOUR.seek(t)
 *    e o Puppeteer captura frame a frame com clock virtual).
 */

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";

export type TourData = {
  codigo: string;
  titulo: string;
  valor: number | null;
  tipo: string;
  areaLabel: string;
  geometry: GeoJSON.Geometry;
  centroid: { lng: number; lat: number };
  municipio: { nome: string; sede_lng: number | null; sede_lat: number | null } | null;
  pois: { nome: string | null; categoria: string; lng: number; lat: number; distancia_m: number; destaque: boolean }[];
  record?: boolean;
};

type Cam = { lng: number; lat: number; zoom: number; pitch: number; bearing: number };
type Key = { t: number; cam: Cam };

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function buildKeyframes(d: TourData): { keys: Key[]; orbit: { start: number; end: number; base: Cam } } {
  const c = d.centroid;
  const sede = d.municipio?.sede_lng != null
    ? { lng: d.municipio.sede_lng!, lat: d.municipio.sede_lat! }
    : null;
  const destaque = d.pois.filter((p) => p.destaque).slice(0, 3);

  const keys: Key[] = [
    { t: 0, cam: { lng: c.lng, lat: c.lat + 0.9, zoom: 6.2, pitch: 0, bearing: 0 } },
    { t: 5, cam: { lng: c.lng, lat: c.lat, zoom: 13.2, pitch: 58, bearing: 0 } },
  ];
  // órbita 5s→15s tratada à parte (bearing contínuo)
  let t = 15;
  const orbit = { start: 5, end: 15, base: { lng: c.lng, lat: c.lat, zoom: 13.6, pitch: 58, bearing: 0 } };

  if (sede) {
    keys.push({ t, cam: { lng: c.lng, lat: c.lat, zoom: 13.6, pitch: 58, bearing: 0 } });
    t += 5;
    keys.push({ t, cam: { lng: (c.lng + sede.lng) / 2, lat: (c.lat + sede.lat) / 2, zoom: 10.2, pitch: 40, bearing: 15 } });
  }
  for (const p of destaque) {
    t += 4;
    keys.push({ t, cam: { lng: p.lng, lat: p.lat, zoom: 13.5, pitch: 50, bearing: 25 } });
  }
  t += 5;
  keys.push({ t, cam: { lng: c.lng, lat: c.lat, zoom: 14, pitch: 55, bearing: 340 } });
  return { keys, orbit };
}

function camAt(t: number, keys: Key[], orbit: { start: number; end: number; base: Cam }): Cam {
  if (t >= orbit.start && t < orbit.end) {
    const frac = (t - orbit.start) / (orbit.end - orbit.start);
    return { ...orbit.base, bearing: frac * 360 };
  }
  let prev = keys[0], next = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) { prev = keys[i]; next = keys[i + 1]; break; }
  }
  if (t >= next.t) return next.cam;
  const k = easeInOut((t - prev.t) / Math.max(0.001, next.t - prev.t));
  return {
    lng: lerp(prev.cam.lng, next.cam.lng, k),
    lat: lerp(prev.cam.lat, next.cam.lat, k),
    zoom: lerp(prev.cam.zoom, next.cam.zoom, k),
    pitch: lerp(prev.cam.pitch, next.cam.pitch, k),
    bearing: lerp(prev.cam.bearing, next.cam.bearing, k),
  };
}

const CATEGORIA_EMOJI: Record<string, string> = {
  combustivel: "⛽", farmacia: "💊", supermercado: "🛒", hospital: "🏥",
  escola: "🏫", centro: "🏙️", acesso_rodovia: "🛣️",
};

export default function Tour3D(dados: TourData) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [fase, setFase] = useState<"carregando" | "tocando" | "pausado" | "fim">("carregando");
  const faseRef = useRef(fase);
  faseRef.current = fase;

  const { keys, orbit } = buildKeyframes(dados);
  const duracao = keys[keys.length - 1].t;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelado = false;
    let mapa: MLMap | undefined;
    let raf = 0;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            satelite: {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri",
            },
            dem: {
              type: "raster-dem",
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              encoding: "terrarium", tileSize: 256, maxzoom: 15,
            },
          },
          layers: [{ id: "satelite", type: "raster", source: "satelite" }],
          terrain: { source: "dem", exaggeration: 1.4 },
        },
        center: [dados.centroid.lng, dados.centroid.lat + 0.9],
        zoom: 6.2,
        pitch: 0,
        maxPitch: 75,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.on("error", (e) => console.error("[tour] erro do mapa:", e.error?.message ?? e));

      map.on("load", () => {
        map.addSource("imovel", { type: "geojson", data: { type: "Feature", geometry: dados.geometry, properties: {} } });
        if (dados.geometry.type !== "Point") {
          map.addLayer({ id: "imovel-fill", type: "fill", source: "imovel", paint: { "fill-color": "#C9A14E", "fill-opacity": 0.22 } });
          map.addLayer({ id: "imovel-linha", type: "line", source: "imovel", paint: { "line-color": "#C9A14E", "line-width": 3.5 } });
        } else {
          map.addLayer({ id: "imovel-ponto", type: "circle", source: "imovel", paint: { "circle-color": "#C9A14E", "circle-radius": 10, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        }

        if (dados.pois.length) {
          map.addSource("pois", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: dados.pois.map((p) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [p.lng, p.lat] },
                properties: { rotulo: `${CATEGORIA_EMOJI[p.categoria] ?? "📍"} ${p.nome ?? p.categoria}` },
              })),
            },
          });
          map.addLayer({
            id: "pois-pontos", type: "circle", source: "pois",
            paint: { "circle-color": "#ffffff", "circle-radius": 5, "circle-stroke-color": "#0E4D36", "circle-stroke-width": 2 },
          });
        }

        const seek = (t: number) => {
          const cam = camAt(Math.min(t, duracao), keys, orbit);
          map.jumpTo({ center: [cam.lng, cam.lat], zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
        };

        if (dados.record) {
          // API determinística para o worker de vídeo
          (window as unknown as Record<string, unknown>).__ARINI_TOUR = {
            duracao, fps: 30, seek,
            pronto: () => map.loaded() && map.areTilesLoaded(),
          };
          seek(0);
          setFase("pausado");
          return;
        }

        // reprodução ao vivo
        setFase("tocando");
        const inicio = performance.now();
        const tick = () => {
          if (faseRef.current !== "tocando") return;
          const t = (performance.now() - inicio) / 1000;
          if (t >= duracao) { setFase("fim"); return; }
          seek(t);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // qualquer interação devolve o controle ao usuário
        const parar = () => setFase((f) => (f === "tocando" ? "pausado" : f));
        map.on("mousedown", parar);
        map.on("touchstart", parar);
        map.on("wheel", parar);
      });
    })();

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      mapa?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brl = dados.valor?.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) ?? "Sob consulta";

  return (
    <div className="relative h-screen w-full bg-black">
      {/* inline: o CSS do maplibre força position:relative na classe e colapsaria a altura */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {!dados.record && (
        <>
          <div className="absolute top-4 left-4 rounded-xl bg-black/60 text-white px-4 py-3 backdrop-blur">
            <p className="font-mono text-[10px] text-white/60">{dados.codigo}</p>
            <p className="font-semibold">{dados.titulo}</p>
            <p className="text-sm text-amber-300">{brl} · {dados.areaLabel}</p>
            {dados.municipio && <p className="text-xs text-white/60">{dados.municipio.nome}</p>}
          </div>

          {(fase === "pausado" || fase === "fim") && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              <button
                className="rounded-full bg-white text-verde-escuro font-medium px-5 py-2.5 shadow-lg hover:bg-amber-100"
                onClick={() => window.location.reload()}>
                ↻ Repetir tour
              </button>
              <a href={`/imovel/${dados.codigo}`}
                className="rounded-full bg-verde text-white font-medium px-5 py-2.5 shadow-lg hover:bg-verde-escuro">
                Ver o imóvel
              </a>
            </div>
          )}
          {fase === "tocando" && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 rounded-full px-4 py-1.5">
              Toque no mapa para explorar livremente
            </p>
          )}
        </>
      )}
    </div>
  );
}
