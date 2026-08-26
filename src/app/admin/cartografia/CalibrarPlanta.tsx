"use client";

/**
 * Calibração da planta sobre o satélite — o "mover até bater o centro de
 * referência" que o cliente descreveu. Setas deslocam a planta em metros;
 * o valor é salvo na camada e aplicado no mapa público.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { carregarMaplibre } from "@/lib/map/maplibre";
import { SATELITE } from "@/lib/map/config";
import { deslocarGeoJSON, metrosParaGraus } from "@/lib/geo/deslocar";

type Camada = {
  id: string; nome: string; municipio: string | null;
  geojson?: string; tipo: string;
  opacidade: number;
  offset: { leste_m: number; norte_m: number };
};

export default function CalibrarPlanta({ camada, onFechar }: { camada: Camada; onFechar: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const brutoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const [leste, setLeste] = useState(camada.offset.leste_m);
  const [norte, setNorte] = useState(camada.offset.norte_m);
  const [passo, setPasso] = useState(10);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const redesenhar = useCallback((l: number, n: number) => {
    const map = mapRef.current;
    const bruto = brutoRef.current;
    if (!map || !bruto || !map.getSource("planta")) return;
    const { lng, lat } = metrosParaGraus(l, n);
    (map.getSource("planta") as GeoJSONSource).setData(deslocarGeoJSON(bruto, lng, lat));
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !camada.geojson) return;
    let cancelado = false;
    let mapa: MLMap | undefined;

    (async () => {
      const maplibregl = await carregarMaplibre();
      if (cancelado || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: { version: 8, sources: { sat: SATELITE }, layers: [{ id: "sat", type: "raster", source: "sat" }] },
        center: [-50.5782, -19.5541],
        zoom: 16,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const bruto = await fetch(camada.geojson!).then((r) => r.json());
      brutoRef.current = bruto;

      map.on("load", () => {
        const { lng, lat } = metrosParaGraus(camada.offset.leste_m, camada.offset.norte_m);
        map.addSource("planta", { type: "geojson", data: deslocarGeoJSON(bruto, lng, lat) });
        map.addLayer({
          id: "planta", type: "line", source: "planta",
          paint: { "line-color": "#FFE9A8", "line-width": 1.2, "line-opacity": 0.95 },
        });
        // enquadra a planta
        const coords: [number, number][] = [];
        const walk = (c: unknown): void => {
          if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
          else if (Array.isArray(c)) c.forEach(walk);
        };
        for (const f of bruto.features.slice(0, 40)) walk((f.geometry as { coordinates: unknown }).coordinates);
        if (coords.length) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          map.jumpTo({ center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2], zoom: 17 });
        }
      });
    })();

    return () => { cancelado = true; mapa?.remove(); mapRef.current = null; };
  }, [camada]);

  const mover = (dLeste: number, dNorte: number) => {
    const l = leste + dLeste, n = norte + dNorte;
    setLeste(l); setNorte(n);
    redesenhar(l, n);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); mover(0, passo); }
      else if (e.key === "ArrowDown") { e.preventDefault(); mover(0, -passo); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); mover(-passo, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); mover(passo, 0); }
      else if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  async function salvar() {
    setSalvando(true);
    setMsg("");
    const res = await fetch(`/api/admin/cartografia/${camada.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset_leste_m: leste, offset_norte_m: norte }),
    });
    setSalvando(false);
    if (res.ok) { setMsg("Calibração salva — já vale no mapa público."); }
    else setMsg((await res.json()).error ?? "Falha ao salvar.");
  }

  const btn = "w-11 h-11 rounded-lg bg-white border border-linha hover:bg-verde hover:text-white transition text-lg font-semibold";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-linha flex items-center justify-between">
          <div>
            <p className="font-semibold text-verde-escuro">Calibrar: {camada.nome}</p>
            <p className="text-xs text-foreground/55">
              Mova a planta até as quadras baterem com o satélite. Use as setas do teclado.
            </p>
          </div>
          <button onClick={onFechar} className="w-9 h-9 rounded-full hover:bg-areia text-lg">✕</button>
        </div>

        <div ref={containerRef} style={{ height: 460, position: "relative" }} />

        <div className="p-5 flex flex-wrap items-center gap-5 border-t border-linha">
          <div className="grid grid-cols-3 gap-1.5 w-fit">
            <span />
            <button className={btn} onClick={() => mover(0, passo)} title="Norte">↑</button>
            <span />
            <button className={btn} onClick={() => mover(-passo, 0)} title="Oeste">←</button>
            <button className={btn + " text-xs"} onClick={() => { setLeste(0); setNorte(0); redesenhar(0, 0); }} title="Zerar">0</button>
            <button className={btn} onClick={() => mover(passo, 0)} title="Leste">→</button>
            <span />
            <button className={btn} onClick={() => mover(0, -passo)} title="Sul">↓</button>
            <span />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-foreground/60">Passo do ajuste</p>
            <div className="flex gap-1.5">
              {[1, 5, 10, 50].map((p) => (
                <button key={p} onClick={() => setPasso(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm border transition ${passo === p ? "bg-verde text-white border-verde" : "border-linha hover:bg-areia"}`}>
                  {p} m
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm tabular-nums">
            <p className="text-xs text-foreground/60">Deslocamento aplicado</p>
            <p className="font-medium">
              leste {leste.toFixed(0)} m · norte {norte.toFixed(0)} m
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {msg && <span className="text-sm text-verde">{msg}</span>}
            <button onClick={salvar} disabled={salvando} className="btn-ouro px-6 py-2.5 disabled:opacity-60">
              {salvando ? "Salvando…" : "Salvar calibração"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
