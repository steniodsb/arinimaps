"use client";

/**
 * Barra de ferramentas do mapa (mockup desktop). Medir área e distância
 * usam a geodésia do turf — o número precisa bater com o que o corretor
 * mediria em campo, não com pixels de tela.
 */

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, MapMouseEvent, GeoJSONSource } from "maplibre-gl";

type Modo = null | "area" | "distancia";

export default function Ferramentas({
  mapa, onImportarKml, onCapturar,
}: {
  mapa: MLMap | null;
  onImportarKml: (arquivo: File) => void;
  onCapturar: () => void;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const [resultado, setResultado] = useState<string>("");
  const pontosRef = useRef<[number, number][]>([]);
  const modoRef = useRef<Modo>(null);
  modoRef.current = modo;

  // fonte/camadas da medição, criadas uma vez
  useEffect(() => {
    if (!mapa) return;
    const preparar = () => {
      if (mapa.getSource("medicao")) return;
      mapa.addSource("medicao", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer({
        id: "medicao-area", type: "fill", source: "medicao",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#3FCF7F", "fill-opacity": 0.22 },
      });
      mapa.addLayer({
        id: "medicao-linha", type: "line", source: "medicao",
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": "#3FCF7F", "line-width": 2.5, "line-dasharray": [2, 1] },
      });
      mapa.addLayer({
        id: "medicao-pontos", type: "circle", source: "medicao",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#0A1310", "circle-radius": 4.5, "circle-stroke-color": "#3FCF7F", "circle-stroke-width": 2 },
      });
    };
    if (mapa.isStyleLoaded()) preparar();
    else mapa.once("load", preparar);
  }, [mapa]);

  const desenhar = (pontos: [number, number][], fechar: boolean) => {
    const src = mapa?.getSource("medicao") as GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = pontos.map((p) => ({
      type: "Feature", geometry: { type: "Point", coordinates: p }, properties: {},
    }));
    if (pontos.length >= 2) {
      features.push({
        type: "Feature",
        geometry: fechar && pontos.length >= 3
          ? { type: "Polygon", coordinates: [[...pontos, pontos[0]]] }
          : { type: "LineString", coordinates: pontos },
        properties: {},
      });
    }
    src.setData({ type: "FeatureCollection", features });
  };

  const calcular = async (pontos: [number, number][], tipo: Modo) => {
    if (!tipo || pontos.length < 2) return;
    const turf = await import("@turf/turf");
    if (tipo === "distancia") {
      let total = 0;
      for (let i = 1; i < pontos.length; i++) {
        total += turf.distance(turf.point(pontos[i - 1]), turf.point(pontos[i]), { units: "kilometers" });
      }
      setResultado(
        total < 1
          ? `${(total * 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m`
          : `${total.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`
      );
    } else if (pontos.length >= 3) {
      const poligono = turf.polygon([[...pontos, pontos[0]]]);
      const m2 = turf.area(poligono);
      const ha = m2 / 10000;
      setResultado(
        ha < 1
          ? `${m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²`
          : `${ha.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha (${(ha / 4.84).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} alq.)`
      );
    }
  };

  // clique adiciona vértice; duplo clique encerra a medição
  useEffect(() => {
    if (!mapa) return;
    const aoClicar = (e: MapMouseEvent) => {
      if (!modoRef.current) return;
      const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      pontosRef.current = [...pontosRef.current, p];
      desenhar(pontosRef.current, modoRef.current === "area");
      calcular(pontosRef.current, modoRef.current);
    };
    const aoDuploClique = () => {
      if (!modoRef.current) return;
      setModo(null);
      if (mapa) mapa.getCanvas().style.cursor = "";
    };
    mapa.on("click", aoClicar);
    mapa.on("dblclick", aoDuploClique);
    return () => {
      mapa.off("click", aoClicar);
      mapa.off("dblclick", aoDuploClique);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa]);

  const iniciar = (novo: Modo) => {
    pontosRef.current = [];
    setResultado("");
    desenhar([], false);
    const proximo = modo === novo ? null : novo;
    setModo(proximo);
    if (mapa) mapa.getCanvas().style.cursor = proximo ? "crosshair" : "";
  };

  const limpar = () => {
    pontosRef.current = [];
    setResultado("");
    desenhar([], false);
    setModo(null);
    if (mapa) mapa.getCanvas().style.cursor = "";
  };

  const FERRAMENTAS = [
    { id: "area", icone: "△", rotulo: "Medir Área", acao: () => iniciar("area") },
    { id: "distancia", icone: "↔", rotulo: "Medir Distância", acao: () => iniciar("distancia") },
    { id: "kml", icone: "⬆", rotulo: "Importar KML", acao: null },
    { id: "imprimir", icone: "⎙", rotulo: "Imprimir", acao: () => window.print() },
    { id: "captura", icone: "◉", rotulo: "Capturar Imagem", acao: onCapturar },
  ] as const;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(92%,680px)]">
      {(modo || resultado) && (
        <div className="cartao px-4 py-2.5 mb-2 flex items-center gap-3 text-sm shadow-xl anima-subir">
          <span className="text-texto-2">
            {modo === "area" ? "Clique nos vértices; duplo clique encerra."
              : modo === "distancia" ? "Clique nos pontos; duplo clique encerra."
              : "Medição"}
          </span>
          {resultado && <span className="ml-auto font-semibold text-verde tabular-nums">{resultado}</span>}
          <button onClick={limpar} className="text-texto-2 hover:text-texto transition">limpar</button>
        </div>
      )}

      <div className="cartao px-3 py-2.5 shadow-2xl">
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-texto-2 px-1 mb-1.5">Ferramentas</p>
        <div className="flex items-center justify-between gap-1 overflow-x-auto">
          {FERRAMENTAS.map((f) => {
            const ativo = modo === f.id;
            const classe =
              "flex flex-col items-center gap-1 rounded-xl px-3 py-2 min-w-[74px] text-[11px] transition " +
              (ativo ? "bg-verde/15 text-verde" : "text-texto-2 hover:text-texto hover:bg-superficie-2");
            if (f.id === "kml") {
              return (
                <label key={f.id} className={classe + " cursor-pointer"}>
                  <span className="text-base leading-none">{f.icone}</span>
                  {f.rotulo}
                  <input type="file" accept=".kml,.kmz" className="hidden"
                    onChange={(e) => e.target.files?.[0] && onImportarKml(e.target.files[0])} />
                </label>
              );
            }
            return (
              <button key={f.id} onClick={f.acao ?? undefined} className={classe}>
                <span className="text-base leading-none">{f.icone}</span>
                {f.rotulo}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
