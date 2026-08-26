"use client";

/**
 * Mapa regional estilo Google Maps: base vetorial (CARTO Voyager) + satélite,
 * painel lateral de resultados com busca, hover sincronizado lista↔mapa,
 * tooltip ao passar o mouse, flyTo suave, cartografia urbana (raster e vetorial),
 * fullscreen, escala e localização do usuário.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap, MapLayerMouseEvent, GeoJSONSource, Popup } from "maplibre-gl";
import { STATUS_CORES, CENTRO_REGIAO, SATELITE } from "@/lib/map/config";
import { carregarMaplibre } from "@/lib/map/maplibre";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import { deslocarGeoJSON } from "@/lib/geo/deslocar";
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
  municipio: string | null;
  capa: string | null;
};

type Camada = {
  id: string; nome: string; tipo: "raster" | "vector";
  tiles?: string; geojson?: string;
  min_zoom: number; max_zoom: number; opacidade: number;
  offset?: { lng: number; lat: number; leste_m: number; norte_m: number };
};

const ESTILO_RUAS = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const CORES_MATCH: unknown[] = [
  "match", ["get", "status"],
  "publicado", STATUS_CORES.publicado,
  "em_negociacao", STATUS_CORES.em_negociacao,
  "vendido", STATUS_CORES.vendido,
  "#2E9E6B",
];

const FAIXAS_PRECO: { label: string; min: number; max: number | null }[] = [
  { label: "Qualquer preço", min: 0, max: null },
  { label: "Até R$ 500 mil", min: 0, max: 500_000 },
  { label: "R$ 500 mil – 1 mi", min: 500_000, max: 1_000_000 },
  { label: "R$ 1 – 3 mi", min: 1_000_000, max: 3_000_000 },
  { label: "Acima de R$ 3 mi", min: 3_000_000, max: null },
];

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function MapaRegional() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dadosRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const municipiosRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const cartoVetorIdsRef = useRef<string[]>([]);

  const [base, setBase] = useState<"ruas" | "satelite">("ruas");
  const [selecionado, setSelecionado] = useState<ImovelProps | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "urbano" | "rural">("todos");
  const [faixaPreco, setFaixaPreco] = useState(0);
  const [busca, setBusca] = useState("");
  const [painelAberto, setPainelAberto] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [lista, setLista] = useState<ImovelProps[]>([]);

  // ---------- filtro compartilhado (lista + mapa) ----------
  const filtrar = useCallback((tipo: string, faixaIdx: number, q: string) => {
    const dados = dadosRef.current;
    if (!dados) return [] as GeoJSON.Feature[];
    const faixa = FAIXAS_PRECO[faixaIdx];
    const termo = norm(q.trim());
    return dados.features.filter((f) => {
      const p = f.properties as ImovelProps;
      if (tipo !== "todos" && p.tipo !== tipo) return false;
      if (p.valor != null) {
        if (p.valor < faixa.min) return false;
        if (faixa.max != null && p.valor > faixa.max) return false;
      } else if (faixaIdx !== 0) return false;
      if (termo) {
        const alvo = norm(`${p.titulo} ${p.codigo} ${p.municipio ?? ""}`);
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, []);

  const aplicar = useCallback((tipo: string, faixaIdx: number, q: string) => {
    const map = mapRef.current;
    const features = filtrar(tipo, faixaIdx, q);
    if (map?.getSource("imoveis")) {
      (map.getSource("imoveis") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    }
    setLista(
      features
        .map((f) => f.properties as ImovelProps)
        .sort((a, b) => (a.status === "vendido" ? 1 : 0) - (b.status === "vendido" ? 1 : 0))
    );
  }, [filtrar]);

  const voarPara = useCallback((p: ImovelProps) => {
    setSelecionado(p);
    mapRef.current?.flyTo({
      center: [p.lng, p.lat],
      zoom: p.tipo === "urbano" ? 16.5 : 13.8,
      pitch: 0,
      duration: 1400,
      essential: true,
    });
  }, []);

  const destacar = useCallback((id: string | null) => {
    const map = mapRef.current;
    if (!map || !map.getSource("imoveis")) return;
    if (hoverIdRef.current && hoverIdRef.current !== id) {
      map.setFeatureState({ source: "imoveis", id: hoverIdRef.current }, { hover: false });
    }
    if (id) map.setFeatureState({ source: "imoveis", id }, { hover: true });
    hoverIdRef.current = id;
  }, []);

  // ---------- criação do mapa ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelado = false;
    let mapa: MLMap | undefined;

    (async () => {
      const maplibregl = await carregarMaplibre();
      if (cancelado || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: ESTILO_RUAS,
        center: CENTRO_REGIAO,
        zoom: 9,
        hash: "pos", // posição na URL → link compartilhável, estilo Google Maps
        fadeDuration: 150,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
      map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

      const popup = new maplibregl.Popup({
        closeButton: false, closeOnClick: false, offset: 14, maxWidth: "260px",
      });
      popupRef.current = popup;

      map.on("load", async () => {
        const [municipios, imoveis, cartografia] = await Promise.all([
          fetch("/api/geo/municipios").then((r) => r.json()),
          fetch("/api/geo/imoveis").then((r) => r.json()),
          fetch("/api/geo/cartografia").then((r) => r.json()).catch(() => []),
        ]);
        dadosRef.current = imoveis;
        municipiosRef.current = municipios;

        // satélite fica acima da base vetorial e abaixo das camadas de dados
        map.addSource("satelite", SATELITE);
        map.addLayer({ id: "satelite", type: "raster", source: "satelite", layout: { visibility: "none" } });

        // cartografia urbana: raster (tiles) e vetorial (plantas DWG convertidas)
        for (const c of cartografia as Camada[]) {
          if (c.tipo === "raster" && c.tiles) {
            map.addSource(`carto-${c.id}`, {
              type: "raster", tiles: [c.tiles], tileSize: 256,
              minzoom: c.min_zoom, maxzoom: c.max_zoom,
            });
            map.addLayer({
              id: `carto-${c.id}`, type: "raster", source: `carto-${c.id}`,
              paint: { "raster-opacity": c.opacidade },
            });
          } else if (c.tipo === "vector" && c.geojson) {
            // carrega e aplica o ajuste fino da calibração antes de desenhar
            const bruto = await fetch(c.geojson).then((r) => r.json()).catch(() => null);
            if (!bruto) continue;
            const dados = deslocarGeoJSON(bruto, c.offset?.lng ?? 0, c.offset?.lat ?? 0);
            map.addSource(`carto-${c.id}`, { type: "geojson", data: dados });
            map.addLayer({
              id: `carto-${c.id}`, type: "line", source: `carto-${c.id}`,
              minzoom: 12,
              paint: {
                // cor trocada conforme a base ativa (ver efeito de `base`):
                // sobre o satélite a planta precisa ser clara para aparecer
                "line-color": "#3A4A40",
                "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 15, 0.9, 18, 1.6] as never,
                "line-opacity": Math.min(0.9, c.opacidade),
              },
            });
            cartoVetorIdsRef.current.push(`carto-${c.id}`);
          }
        }

        map.addSource("municipios", { type: "geojson", data: municipios });
        map.addLayer({
          id: "municipios-linha", type: "line", source: "municipios",
          paint: { "line-color": "#0E4D36", "line-width": 1.2, "line-opacity": 0.4, "line-dasharray": [3, 2] },
        });

        map.addSource("imoveis", { type: "geojson", data: imoveis, promoteId: "id" });
        map.addLayer({
          id: "imoveis-fill", type: "fill", source: "imoveis",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": CORES_MATCH as never,
            "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.55, 0.32] as never,
          },
        });
        map.addLayer({
          id: "imoveis-linha", type: "line", source: "imoveis",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": CORES_MATCH as never,
            "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 4.5, 2.5] as never,
          },
        });
        map.addLayer({
          id: "imoveis-ponto", type: "circle", source: "imoveis",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": CORES_MATCH as never,
            "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 10, 7] as never,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // enquadra a região
        const coords: [number, number][] = [];
        for (const f of municipios.features ?? []) {
          const walk = (c: unknown): void => {
            if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
            else if (Array.isArray(c)) c.forEach(walk);
          };
          walk(f.geometry?.coordinates);
        }
        // respeita posição vinda da URL (#pos=…); sem ela, enquadra a região
        if (coords.length && !window.location.hash.includes("pos=")) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: { top: 40, bottom: 40, left: 380, right: 40 }, duration: 0 }
          );
        }

        // interações
        const aoClicar = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (f) voarPara(f.properties as unknown as ImovelProps);
        };
        const aoMover = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as unknown as ImovelProps;
          map.getCanvas().style.cursor = "pointer";
          destacar(p.id);
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="padding:10px 12px;font-family:inherit">
                 <p style="font-weight:600;font-size:13px;color:#092417;margin:0">${p.titulo}</p>
                 <p style="font-size:12px;color:#0E4D36;font-weight:600;margin:2px 0 0">${formatBRL(p.valor)}</p>
               </div>`
            )
            .addTo(map);
        };
        const aoSair = () => {
          map.getCanvas().style.cursor = "";
          destacar(null);
          popup.remove();
        };
        for (const layer of ["imoveis-fill", "imoveis-ponto"]) {
          map.on("click", layer, aoClicar);
          map.on("mousemove", layer, aoMover);
          map.on("mouseleave", layer, aoSair);
        }

        setLista((imoveis.features ?? []).map((f: GeoJSON.Feature) => f.properties as ImovelProps));
        setPronto(true);
      });
    })();

    return () => {
      cancelado = true;
      mapa?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // base ruas/satélite (a planta da cidade muda de cor para continuar legível)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto || !map.getLayer("satelite")) return;
    map.setLayoutProperty("satelite", "visibility", base === "satelite" ? "visible" : "none");
    for (const id of cartoVetorIdsRef.current) {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, "line-color", base === "satelite" ? "#FFE9A8" : "#3A4A40");
      }
    }
  }, [base, pronto]);

  // filtros e busca
  useEffect(() => {
    if (pronto) aplicar(filtroTipo, faixaPreco, busca);
  }, [filtroTipo, faixaPreco, busca, pronto, aplicar]);

  // busca que casa com município → voa até ele
  const municipioSugerido = useMemo(() => {
    const termo = norm(busca.trim());
    if (!termo || termo.length < 3) return null;
    const f = (municipiosRef.current?.features ?? []).find((m) =>
      norm(String((m.properties as { nome?: string })?.nome ?? "")).includes(termo)
    );
    return f ? { nome: (f.properties as { nome: string }).nome, geometry: f.geometry } : null;
  }, [busca]);

  const irParaMunicipio = useCallback(() => {
    if (!municipioSugerido) return;
    const coords: [number, number][] = [];
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === "number") coords.push(c as [number, number]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    walk((municipioSugerido.geometry as GeoJSON.Polygon).coordinates);
    if (coords.length && mapRef.current) {
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      mapRef.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 1200 }
      );
    }
  }, [municipioSugerido]);

  const ativos = lista.filter((p) => p.status !== "vendido").length;

  return (
    <div className="relative flex-1 min-h-0 flex">
      {/* ---------- painel lateral (estilo Google Maps) ---------- */}
      <aside className={`absolute md:relative z-20 h-full bg-white shadow-xl transition-all duration-300 flex flex-col
        ${painelAberto ? "w-[340px]" : "w-0 overflow-hidden"}`}>
        <div className="p-3 space-y-2 border-b border-linha">
          <div className="relative">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar imóvel, cidade ou código…"
              className="w-full rounded-full border border-linha bg-areia/60 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde focus:bg-white transition"
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40">⌕</span>
          </div>
          {municipioSugerido && (
            <button onClick={irParaMunicipio}
              className="w-full text-left text-sm rounded-lg bg-areia px-3 py-2 hover:bg-verde hover:text-white transition">
              📍 Ir para <strong>{municipioSugerido.nome}</strong>
            </button>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {(["todos", "rural", "urbano"] as const).map((t) => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize border transition
                  ${filtroTipo === t ? "bg-verde text-white border-verde" : "border-linha hover:bg-areia"}`}>
                {t}
              </button>
            ))}
            <select value={faixaPreco} onChange={(e) => setFaixaPreco(Number(e.target.value))}
              className="rounded-full px-3 py-1.5 text-xs border border-linha bg-white hover:bg-areia transition focus:outline-none">
              {FAIXAS_PRECO.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
            </select>
          </div>
          <p className="text-xs text-foreground/50">
            {ativos} {ativos === 1 ? "imóvel à venda" : "imóveis à venda"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-linha">
          {lista.map((p) => (
            <button key={p.id}
              onClick={() => voarPara(p)}
              onMouseEnter={() => destacar(p.id)}
              onMouseLeave={() => destacar(null)}
              className={`w-full text-left flex gap-3 p-3 transition hover:bg-areia/70
                ${selecionado?.id === p.id ? "bg-areia" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.capa ? mediaUrl(p.capa) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                alt=""
                className="w-20 h-16 rounded-lg object-cover shrink-0"
              />
              <span className="min-w-0">
                <span className="block font-medium text-sm leading-snug truncate">{p.titulo}</span>
                <span className="block text-xs text-foreground/55">{p.municipio ?? "—"} · {formatArea(p.area_m2, p.tipo)}</span>
                <span className="block text-sm font-semibold text-verde mt-0.5">
                  {p.status === "vendido" ? <s className="text-foreground/40">{formatBRL(p.valor)}</s> : formatBRL(p.valor)}
                </span>
              </span>
              <span className="ml-auto self-start mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: STATUS_CORES[p.status] ?? "#2E9E6B" }} />
            </button>
          ))}
          {!lista.length && pronto && (
            <p className="p-6 text-sm text-foreground/50 text-center">Nada encontrado com esses filtros.</p>
          )}
        </div>
      </aside>

      {/* alça do painel */}
      <button
        onClick={() => setPainelAberto(!painelAberto)}
        className={`absolute z-30 top-1/2 -translate-y-1/2 bg-white shadow-lg rounded-r-lg w-6 h-14 flex items-center justify-center text-foreground/60 hover:text-verde transition-all duration-300 ${painelAberto ? "left-[340px] max-md:left-0 max-md:hidden" : "left-0"}`}
        title={painelAberto ? "Recolher lista" : "Mostrar lista"}>
        {painelAberto ? "‹" : "›"}
      </button>

      {/* ---------- mapa ---------- */}
      <div className="relative flex-1 min-w-0">
        {/* inline: o CSS do maplibre força position:relative na classe e colapsaria a altura */}
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

        {/* base ruas/satélite */}
        <div className="absolute top-3 left-3 flex rounded-full overflow-hidden shadow-lg bg-white text-sm">
          {(["ruas", "satelite"] as const).map((b) => (
            <button key={b} onClick={() => setBase(b)}
              className={`px-4 py-2 font-medium transition ${base === b ? "bg-verde text-white" : "hover:bg-areia"}`}>
              {b === "ruas" ? "Mapa" : "Satélite"}
            </button>
          ))}
        </div>

        {/* legenda */}
        <div className="absolute bottom-8 left-3 rounded-xl bg-white/95 backdrop-blur shadow-lg px-3.5 py-2.5 text-xs space-y-1.5">
          <p className="font-semibold text-verde-escuro">Legenda</p>
          {Object.entries(STATUS_CORES).map(([status, cor]) => (
            <p key={status} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: cor }} />
              {STATUS_LABEL[status]}
            </p>
          ))}
        </div>

        {/* card do selecionado */}
        {selecionado && (
          <div className="absolute top-3 right-14 w-80 rounded-2xl bg-white shadow-2xl overflow-hidden anima-subir">
            <div className="h-36 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selecionado.capa ? mediaUrl(selecionado.capa) : selecionado.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                alt="" className="w-full h-full object-cover" />
              <button onClick={() => setSelecionado(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 transition">✕</button>
              <span className="absolute bottom-2 left-3 font-mono text-[10px] text-white bg-black/50 rounded px-2 py-0.5">
                {selecionado.codigo}
              </span>
            </div>
            <div className="p-4 space-y-2">
              <p className="font-semibold leading-snug">{selecionado.titulo}</p>
              <div className="flex items-baseline justify-between">
                <span className="texto-ouro font-bold text-lg">{formatBRL(selecionado.valor)}</span>
                <span className="text-xs text-foreground/55">
                  {formatArea(selecionado.area_m2, selecionado.tipo)}
                </span>
              </div>
              <Link href={`/imovel/${selecionado.codigo}`}
                className="btn-ouro block text-center text-sm py-2.5 !rounded-lg">
                Ver imóvel completo
              </Link>
              <div className="flex gap-2">
                <Link href={`/imovel/${selecionado.codigo}/tour`}
                  className="flex-1 text-center rounded-lg border border-linha text-sm py-2 hover:bg-areia transition">
                  Tour 3D
                </Link>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${selecionado.lat},${selecionado.lng}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 text-center rounded-lg border border-linha text-sm py-2 hover:bg-areia transition">
                  Como chegar
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
