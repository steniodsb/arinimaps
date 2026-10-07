"use client";

/**
 * Barra de ferramentas do mapa (mockup desktop). Medir área e distância
 * usam a geodésia do turf — o número precisa bater com o que o corretor
 * mediria em campo, não com pixels de tela.
 *
 * "Consultar área" (roadmap 5.6) usa o mesmo desenho da medição de área: o
 * polígono fechado vai para POST /api/consulta/area e a consulta abre em
 * /consulta/area/<chave>. Vale para qualquer ponto do Brasil.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MLMap, MapMouseEvent, GeoJSONSource } from "maplibre-gl";
import type { RecursoId } from "@/lib/planos";

type Modo = null | "area" | "distancia" | "consulta";

/** Teto da área desenhada para consulta — o mesmo do servidor (src/lib/geo/consultaArea.ts). */
const CONSULTA_MAX_HA = 50_000;

export default function Ferramentas({
  mapa, onImportarKml, onCapturar, recursos, logado = false, onDesenhando,
}: {
  mapa: MLMap | null;
  /** avisa o mapa que um desenho está em curso (o clique não deve abrir cartão de lote/CAR) */
  onDesenhando?: (ativo: boolean) => void;
  onImportarKml: (arquivo: File) => void;
  onCapturar: () => void;
  /** recursos do plano de quem está olhando (planos por nicho); ausente = tudo liberado */
  recursos?: string[];
  logado?: boolean;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const [resultado, setResultado] = useState<string>("");
  const [bloqueio, setBloqueio] = useState<string>("");
  const router = useRouter();
  // área desenhada para consulta, já fechada (duplo clique), esperando o "Consultar"
  const [consultaPronta, setConsultaPronta] = useState<{ pontos: [number, number][]; ha: number } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [erroConsulta, setErroConsulta] = useState<{ msg: string; planos: boolean } | null>(null);
  const liberado = (r: RecursoId) => !recursos || recursos.includes(r);
  const pontosRef = useRef<[number, number][]>([]);
  const modoRef = useRef<Modo>(null);
  modoRef.current = modo;

  // durante o desenho o duplo clique encerra o polígono — não pode dar zoom
  useEffect(() => {
    if (!mapa) return;
    if (modo) mapa.doubleClickZoom.disable();
    else mapa.doubleClickZoom.enable();
    onDesenhando?.(!!modo);
  }, [mapa, modo, onDesenhando]);

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
      if (tipo === "consulta") {
        const ha = turf.area(poligono) / 10000;
        setResultado(`${ha.toLocaleString("pt-BR", { maximumFractionDigits: ha < 10 ? 2 : 0 })} ha`);
        return;
      }
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
      // o duplo clique chega antes como dois cliques no mesmo lugar: não duplica o vértice
      const ult = pontosRef.current[pontosRef.current.length - 1];
      if (ult && Math.abs(ult[0] - p[0]) < 1e-7 && Math.abs(ult[1] - p[1]) < 1e-7) return;
      pontosRef.current = [...pontosRef.current, p];
      desenhar(pontosRef.current, modoRef.current !== "distancia");
      calcular(pontosRef.current, modoRef.current);
    };
    const aoDuploClique = async () => {
      if (!modoRef.current) return;
      if (modoRef.current === "consulta" && pontosRef.current.length >= 3) {
        const turf = await import("@turf/turf");
        const pts = pontosRef.current;
        setConsultaPronta({ pontos: pts, ha: turf.area(turf.polygon([[...pts, pts[0]]])) / 10000 });
      }
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
    setConsultaPronta(null);
    setErroConsulta(null);
    desenhar([], false);
    const proximo = modo === novo ? null : novo;
    setModo(proximo);
    if (mapa) mapa.getCanvas().style.cursor = proximo ? "crosshair" : "";
  };

  const limpar = () => {
    pontosRef.current = [];
    setResultado("");
    setConsultaPronta(null);
    setErroConsulta(null);
    desenhar([], false);
    setModo(null);
    if (mapa) mapa.getCanvas().style.cursor = "";
  };

  const consultar = async () => {
    if (!consultaPronta) return;
    setConsultando(true); setErroConsulta(null);
    const anel = [...consultaPronta.pontos, consultaPronta.pontos[0]];
    const r = await fetch("/api/consulta/area", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometria: { type: "Polygon", coordinates: [anel] } }),
    }).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : {};
    setConsultando(false);
    if (!r?.ok || typeof data.chave !== "string") {
      setErroConsulta({
        msg: [data.error ?? "Não foi possível consultar agora.", data.solucao].filter(Boolean).join(" "),
        planos: data.codigo === "sem_plano" || data.codigo === "cota_esgotada",
      });
      return;
    }
    router.push(`/consulta/area/${data.chave.replace(/^geo:/, "")}`);
  };

  // cada ferramenta pertence a um recurso do plano (src/lib/planos.ts); a trava
  // de verdade é no servidor — aqui o botão só avisa e aponta para os planos
  const FERRAMENTAS = [
    { id: "area", icone: "△", rotulo: "Medir Área", recurso: "ferramenta_medir", acao: () => iniciar("area") },
    { id: "distancia", icone: "↔", rotulo: "Medir Distância", recurso: "ferramenta_medir", acao: () => iniciar("distancia") },
    { id: "consulta", icone: "⌖", rotulo: "Consultar Área", recurso: "consulta_area", acao: () => iniciar("consulta") },
    { id: "kml", icone: "⬆", rotulo: "Importar KML", recurso: "ferramenta_kml", acao: null },
    { id: "imprimir", icone: "⎙", rotulo: "Imprimir", recurso: "ferramenta_exportar", acao: () => window.print() },
    { id: "captura", icone: "◉", rotulo: "Capturar Imagem", recurso: "ferramenta_exportar", acao: onCapturar },
  ] as const;

  const avisarBloqueio = (rotulo: string) =>
    setBloqueio(logado
      ? `“${rotulo}” faz parte da consulta profissional e não está no seu plano.`
      : `Entre na sua conta para usar “${rotulo}”.`);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(92%,680px)]">
      {bloqueio && (
        <div className="cartao px-4 py-2.5 mb-2 flex items-center gap-3 text-sm shadow-xl anima-subir">
          <span className="text-texto-2 flex-1">{bloqueio}</span>
          <Link href={logado ? "/planos" : "/entrar"} className="text-verde font-medium whitespace-nowrap">
            {logado ? "Ver planos ›" : "Entrar ›"}
          </Link>
          <button onClick={() => setBloqueio("")} aria-label="Fechar" className="text-texto-2 hover:text-texto">✕</button>
        </div>
      )}
      {consultaPronta && !modo && (
        <div className="cartao px-4 py-2.5 mb-2 text-sm shadow-xl anima-subir space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-texto-2">Área desenhada</span>
            <span className="font-semibold text-verde tabular-nums">
              {consultaPronta.ha.toLocaleString("pt-BR", { maximumFractionDigits: consultaPronta.ha < 10 ? 2 : 0 })} ha
            </span>
            {consultaPronta.ha > CONSULTA_MAX_HA ? (
              <span className="text-alerta text-xs">Máximo de {CONSULTA_MAX_HA.toLocaleString("pt-BR")} ha por consulta.</span>
            ) : (
              <button onClick={consultar} disabled={consultando} className="btn-verde ml-auto px-4 py-1.5 text-xs disabled:opacity-60">
                {consultando ? "Consultando os órgãos…" : "Consultar fontes oficiais"}
              </button>
            )}
            <button onClick={limpar} className="text-texto-2 hover:text-texto transition">limpar</button>
          </div>
          {erroConsulta && (
            <p className="text-xs text-alerta">
              {erroConsulta.msg}{erroConsulta.planos && <> <Link href="/planos" className="text-verde underline">Ver planos</Link></>}
            </p>
          )}
          <p className="text-[11px] text-texto-2">Leva de 10 a 40 segundos e conta uma consulta do seu plano.</p>
        </div>
      )}
      {(modo || (resultado && !consultaPronta)) && (
        <div className="cartao px-4 py-2.5 mb-2 flex items-center gap-3 text-sm shadow-xl anima-subir">
          <span className="text-texto-2">
            {modo === "area" ? "Clique nos vértices; duplo clique encerra."
              : modo === "distancia" ? "Clique nos pontos; duplo clique encerra."
              : modo === "consulta" ? "Desenhe a área a consultar (qualquer lugar do Brasil); duplo clique fecha."
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
            const pode = liberado(f.recurso);
            const classe =
              "flex flex-col items-center gap-1 rounded-xl px-3 py-2 min-w-[74px] text-[11px] transition " +
              (ativo ? "bg-verde/15 text-verde" : "text-texto-2 hover:text-texto hover:bg-superficie-2") +
              (pode ? "" : " opacity-60");
            if (!pode) {
              return (
                <button key={f.id} onClick={() => avisarBloqueio(f.rotulo)} className={classe}
                  title="Disponível na consulta profissional">
                  <span className="text-base leading-none">🔒</span>
                  {f.rotulo}
                </button>
              );
            }
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
