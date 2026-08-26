"use client";

import { useEffect, useRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ESTILO_BASE, STATUS_CORES } from "@/lib/map/config";
import { carregarMaplibre } from "@/lib/map/maplibre";

type Props = {
  geometry: GeoJSON.Geometry;
  status: string;
  className?: string;
};

/** Mapa satélite com a geometria do imóvel destacada (página do imóvel e admin). */
export default function MiniMapa({ geometry, status, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelado = false;
    let mapa: MLMap | undefined;

    (async () => {
      const maplibregl = await carregarMaplibre();
      if (cancelado || !containerRef.current) return;

      const estilo = structuredClone(ESTILO_BASE);
      estilo.layers = estilo.layers.map((l) => ({
        ...l,
        layout: { visibility: l.id === "base-satelite" ? "visible" : "none" },
      })) as typeof estilo.layers;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: estilo,
        center: [-50.2, -19.73],
        zoom: 12,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const cor = STATUS_CORES[status] ?? STATUS_CORES.publicado;
        map.addSource("imovel", { type: "geojson", data: { type: "Feature", geometry, properties: {} } });
        if (geometry.type === "Point") {
          map.addLayer({
            id: "imovel-ponto", type: "circle", source: "imovel",
            paint: { "circle-color": cor, "circle-radius": 9, "circle-stroke-width": 2.5, "circle-stroke-color": "#fff" },
          });
          map.jumpTo({ center: geometry.coordinates as [number, number], zoom: 16 });
        } else {
          map.addLayer({
            id: "imovel-fill", type: "fill", source: "imovel",
            paint: { "fill-color": cor, "fill-opacity": 0.28 },
          });
          map.addLayer({
            id: "imovel-linha", type: "line", source: "imovel",
            paint: { "line-color": "#C9A14E", "line-width": 3 },
          });
          const coords: [number, number][] = [];
          const walk = (c: unknown): void => {
            if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
            else if (Array.isArray(c)) c.forEach(walk);
          };
          walk((geometry as GeoJSON.Polygon).coordinates);
          if (coords.length) {
            const lngs = coords.map((c) => c[0]);
            const lats = coords.map((c) => c[1]);
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 50, duration: 0 }
            );
          }
        }
      });
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
      mapRef.current = null;
    };
  }, [geometry, status]);

  return <div ref={containerRef} className={className ?? "h-80 w-full rounded-xl overflow-hidden"} />;
}
