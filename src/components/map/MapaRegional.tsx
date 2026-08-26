"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import { ESTILO_BASE, STATUS_CORES, CENTRO_REGIAO, type BaseMapa } from "@/lib/map/config";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import Link from "next/link";

type ImovelProps = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: "urbano" | "rural";
  status: string;
  valor: number | null;
  area_m2: number | null;
  lng: number;
  lat: number;
};

const CORES_MATCH: unknown[] = [
  "match", ["get", "status"],
  "publicado", STATUS_CORES.publicado,
  "em_negociacao", STATUS_CORES.em_negociacao,
  "vendido", STATUS_CORES.vendido,
  "#2E9E6B",
];

export default function MapaRegional() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [base, setBase] = useState<BaseMapa>("ruas");
  const [selecionado, setSelecionado] = useState<ImovelProps | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "urbano" | "rural">("todos");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelado = false;
    let mapa: MLMap | undefined;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: ESTILO_BASE,
        center: CENTRO_REGIAO,
        zoom: 9,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", async () => {
      const [municipios, imoveis, cartografia] = await Promise.all([
        fetch("/api/geo/municipios").then((r) => r.json()),
        fetch("/api/geo/imoveis").then((r) => r.json()),
        fetch("/api/geo/cartografia").then((r) => r.json()).catch(() => []),
      ]);

      // camadas de cartografia urbana ("as riscas" sobre o satélite)
      for (const c of cartografia as { id: string; tiles: string; min_zoom: number; max_zoom: number; opacidade: number }[]) {
        map.addSource(`carto-${c.id}`, {
          type: "raster", tiles: [c.tiles], tileSize: 256,
          minzoom: c.min_zoom, maxzoom: c.max_zoom,
        });
        map.addLayer({
          id: `carto-${c.id}`, type: "raster", source: `carto-${c.id}`,
          paint: { "raster-opacity": c.opacidade },
        });
      }

      map.addSource("municipios", { type: "geojson", data: municipios });
      map.addLayer({
        id: "municipios-linha",
        type: "line",
        source: "municipios",
        paint: { "line-color": "#0E4D36", "line-width": 1.2, "line-opacity": 0.45, "line-dasharray": [3, 2] },
      });

      map.addSource("imoveis", { type: "geojson", data: imoveis, promoteId: "id" });
      map.addLayer({
        id: "imoveis-fill",
        type: "fill",
        source: "imoveis",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": CORES_MATCH as never, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "imoveis-linha",
        type: "line",
        source: "imoveis",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": CORES_MATCH as never, "line-width": 2.5 },
      });
      // pontos nos centroides para zoom baixo / geometrias de ponto
      map.addLayer({
        id: "imoveis-ponto",
        type: "circle",
        source: "imoveis",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": CORES_MATCH as never,
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // enquadra a região pelos municípios
      const coords: [number, number][] = [];
      for (const f of municipios.features ?? []) {
        const walk = (c: unknown): void => {
          if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
          else if (Array.isArray(c)) c.forEach(walk);
        };
        walk(f.geometry?.coordinates);
      }
      if (coords.length) {
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 40, duration: 0 }
        );
      }

        const abrir = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (f) setSelecionado(f.properties as unknown as ImovelProps);
        };
        for (const layer of ["imoveis-fill", "imoveis-ponto"]) {
          map.on("click", layer, abrir);
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        }
      });
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
      mapRef.current = null;
    };
  }, []);

  // alterna base ruas/satélite
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setLayoutProperty("base-ruas", "visibility", base === "ruas" ? "visible" : "none");
    map.setLayoutProperty("base-satelite", "visibility", base === "satelite" ? "visible" : "none");
  }, [base]);

  // filtro por tipo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("imoveis-fill")) return;
    const tipoFiltro = filtroTipo === "todos" ? true : ["==", ["get", "tipo"], filtroTipo];
    map.setFilter("imoveis-fill", ["all", ["==", ["geometry-type"], "Polygon"], tipoFiltro] as never);
    map.setFilter("imoveis-linha", ["all", ["==", ["geometry-type"], "Polygon"], tipoFiltro] as never);
    map.setFilter("imoveis-ponto", ["all", ["==", ["geometry-type"], "Point"], tipoFiltro] as never);
  }, [filtroTipo]);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="absolute inset-0" />

      {/* controles: base + filtro */}
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="flex rounded-lg overflow-hidden shadow bg-white text-sm">
          {(["ruas", "satelite"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={`px-3 py-1.5 ${base === b ? "bg-verde text-white" : "hover:bg-areia"}`}
            >
              {b === "ruas" ? "Ruas" : "Satélite"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg overflow-hidden shadow bg-white text-sm">
          {(["todos", "rural", "urbano"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={`px-3 py-1.5 capitalize ${filtroTipo === t ? "bg-verde text-white" : "hover:bg-areia"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* legenda fixa (sumário de cores) */}
      <div className="absolute bottom-6 left-3 rounded-lg bg-white/95 shadow px-3 py-2 text-xs space-y-1.5">
        <p className="font-semibold text-verde-escuro">Legenda</p>
        {Object.entries(STATUS_CORES).map(([status, cor]) => (
          <p key={status} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: cor }} />
            {STATUS_LABEL[status]}
          </p>
        ))}
      </div>

      {/* card do imóvel selecionado */}
      {selecionado && (
        <div className="absolute top-3 right-12 w-72 rounded-xl bg-white shadow-xl overflow-hidden">
          <div className="bg-verde-escuro text-white px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-mono">{selecionado.codigo}</span>
            <button onClick={() => setSelecionado(null)} className="text-white/70 hover:text-white">✕</button>
          </div>
          <div className="p-4 space-y-1">
            <p className="font-semibold leading-snug">{selecionado.titulo}</p>
            <p className="text-sm text-verde font-medium">{formatBRL(selecionado.valor)}</p>
            <p className="text-xs text-foreground/60">
              {formatArea(selecionado.area_m2, selecionado.tipo)} · {STATUS_LABEL[selecionado.status]}
            </p>
            <Link
              href={`/imovel/${selecionado.codigo}`}
              className="mt-2 block text-center rounded-lg bg-verde text-white text-sm font-medium py-2 hover:bg-verde-escuro"
            >
              Ver imóvel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
