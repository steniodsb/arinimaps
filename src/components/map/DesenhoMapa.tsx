"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as MLMap, MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import { ESTILO_BASE, CENTRO_REGIAO } from "@/lib/map/config";
import { carregarMaplibre } from "@/lib/map/maplibre";

export type GeometriaEscolhida = {
  geometry: GeoJSON.Geometry;
  fonte: "desenho" | "ponto" | "kml" | "kmz";
};

type Props = { onChange: (g: GeometriaEscolhida | null) => void };

/**
 * Define a localização do imóvel: desenhar polígono (clique nos vértices,
 * duplo clique fecha), marcar um ponto, ou subir KML/KMZ (processado no navegador).
 */
export default function DesenhoMapa({ onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [modo, setModo] = useState<"poligono" | "ponto">("poligono");
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const verticesRef = useRef(vertices);
  verticesRef.current = vertices;
  const [pronto, setPronto] = useState(false);
  const [msg, setMsg] = useState("");

  const render = useCallback((geom: GeoJSON.Geometry | null, emEdicao: [number, number][]) => {
    const map = mapRef.current;
    if (!map || !map.getSource("desenho")) return;
    const features: GeoJSON.Feature[] = [];
    if (geom) features.push({ type: "Feature", geometry: geom, properties: {} });
    if (emEdicao.length) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: emEdicao },
        properties: { edicao: true },
      });
      for (const v of emEdicao) {
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: v }, properties: { vertice: true } });
      }
    }
    (map.getSource("desenho") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, []);

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
        center: CENTRO_REGIAO,
        zoom: 11,
        doubleClickZoom: false,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        map.addSource("desenho", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "desenho-fill", type: "fill", source: "desenho",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#2E9E6B", "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "desenho-linha", type: "line", source: "desenho",
          filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "LineString"]],
          paint: { "line-color": "#C9A14E", "line-width": 2.5 },
        });
        map.addLayer({
          id: "desenho-vertices", type: "circle", source: "desenho",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": "#fff", "circle-radius": 4.5, "circle-stroke-color": "#C9A14E", "circle-stroke-width": 2 },
        });
        setPronto(true);
      });

      map.on("click", (e: MapMouseEvent) => {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (modoRef.current === "ponto") {
          const geom: GeoJSON.Point = { type: "Point", coordinates: lngLat };
          setVertices([]);
          render(geom, []);
          onChange({ geometry: geom, fonte: "ponto" });
          setMsg("Ponto marcado. Arraste o mapa e clique de novo para reposicionar.");
        } else {
          const novos = [...verticesRef.current, lngLat];
          setVertices(novos);
          render(null, novos);
          setMsg(`${novos.length} vértice(s) — duplo clique para fechar o polígono.`);
        }
      });

      map.on("dblclick", () => {
        if (modoRef.current !== "poligono") return;
        const vs = verticesRef.current;
        if (vs.length < 3) { setMsg("Um polígono precisa de pelo menos 3 pontos."); return; }
        const anel = [...vs, vs[0]];
        const geom: GeoJSON.Polygon = { type: "Polygon", coordinates: [anel] };
        setVertices([]);
        render(geom, []);
        onChange({ geometry: geom, fonte: "desenho" });
        setMsg("Polígono fechado. Use “Limpar” para refazer.");
      });
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importarArquivo(file: File) {
    try {
      let kmlTexto: string;
      if (file.name.toLowerCase().endsWith(".kmz")) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const entrada = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
        if (!entrada) throw new Error("KMZ sem arquivo KML dentro.");
        kmlTexto = await entrada.async("string");
      } else {
        kmlTexto = await file.text();
      }
      const { kml } = await import("@tmcw/togeojson");
      const doc = new DOMParser().parseFromString(kmlTexto, "text/xml");
      const geojson = kml(doc) as GeoJSON.FeatureCollection;
      const feature = geojson.features.find((f) =>
        ["Polygon", "MultiPolygon"].includes(f.geometry?.type ?? "")
      ) ?? geojson.features.find((f) => f.geometry);
      if (!feature?.geometry) throw new Error("Nenhuma geometria encontrada no arquivo.");

      setVertices([]);
      render(feature.geometry, []);
      onChange({
        geometry: feature.geometry,
        fonte: file.name.toLowerCase().endsWith(".kmz") ? "kmz" : "kml",
      });

      // enquadra
      const coords: [number, number][] = [];
      const walk = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
        else if (Array.isArray(c)) c.forEach(walk);
      };
      walk((feature.geometry as GeoJSON.Polygon).coordinates);
      if (coords.length && mapRef.current) {
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        mapRef.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60 }
        );
      }
      setMsg(`Geometria importada de ${file.name}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  function limpar() {
    setVertices([]);
    render(null, []);
    onChange(null);
    setMsg("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["poligono", "ponto"] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setModo(m); limpar(); }}
            className={`rounded-lg px-3 py-1.5 border ${modo === m ? "bg-verde text-white border-verde" : "border-linha hover:bg-superficie-2"}`}>
            {m === "poligono" ? "Desenhar área" : "Marcar ponto"}
          </button>
        ))}
        <label className="rounded-lg px-3 py-1.5 border border-linha hover:bg-superficie-2 cursor-pointer">
          Subir KML/KMZ
          <input type="file" accept=".kml,.kmz" className="hidden"
            onChange={(e) => e.target.files?.[0] && importarArquivo(e.target.files[0])} />
        </label>
        <button type="button" onClick={limpar} className="rounded-lg px-3 py-1.5 border border-linha hover:bg-superficie-2">
          Limpar
        </button>
      </div>
      <div ref={containerRef} className="h-96 w-full rounded-xl overflow-hidden border border-linha" />
      <p className="text-xs text-texto-2 min-h-4">
        {msg || (pronto ? "Clique no mapa para desenhar a divisa do imóvel, ou suba o KML/KMZ da propriedade." : "Carregando mapa…")}
      </p>
    </div>
  );
}
