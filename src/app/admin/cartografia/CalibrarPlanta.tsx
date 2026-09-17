"use client";

/**
 * Calibração da planta sobre o satélite.
 *
 * A versão anterior só tinha setas de teclado e deslocamento em metros. Três
 * coisas apareceram nas plantas reais e entraram aqui:
 *
 *  - ARRASTAR COM O MOUSE. Alinhar 60 m com seta de 10 em 10 m é seis cliques;
 *    arrastar é um gesto. As setas continuam, para o ajuste fino.
 *  - DOIS PONTOS DE CONTROLE. Planta amarrada por um ponto só fecha no centro e
 *    abre nas pontas. O operador marca o mesmo cruzamento na planta e no
 *    satélite duas vezes, e daí sai deslocamento, giro e escala de uma vez.
 *  - CAMADAS DO CAD. O DXF de Iturama trouxe projeto paisagístico junto
 *    (VEGET_I com 25 mil linhas, Paisagismo com 15 mil). Desenhar árvore sobre
 *    o satélite polui o mapa — aqui elas se apagam sem reenviar o arquivo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import { carregarMaplibre } from "@/lib/map/maplibre";
import { SATELITE } from "@/lib/map/config";
import {
  transformarGeoJSON, centroDe, ajustarPorPontos, DESLOCAMENTO_DATUM, TRANSFORM_ZERO,
  type Transform, type ParDeControle,
} from "@/lib/geo/deslocar";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

type Camada = {
  id: string; nome: string; municipio: string | null;
  geojson?: string; tipo: string;
  opacidade: number;
  datum?: string;
  layers_ocultos?: string[];
  layers_cad?: { nome: string; linhas: number }[];
  transform?: Transform;
  offset: { leste_m: number; norte_m: number };
};

type Modo = "navegar" | "mover" | "pontos";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Duas transformações são a mesma coisa dentro da precisão que o banco guarda. */
const ehIgualAoSalvo = (a: Transform, b: Transform) =>
  Math.abs(a.offsetLesteM - b.offsetLesteM) < 0.01 &&
  Math.abs(a.offsetNorteM - b.offsetNorteM) < 0.01 &&
  Math.abs(a.rotacaoGraus - b.rotacaoGraus) < 1e-4 &&
  Math.abs(a.escala - b.escala) < 1e-6;

export default function CalibrarPlanta({ camada, onFechar }: { camada: Camada; onFechar: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const brutoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const centroRef = useRef<[number, number]>([0, 0]);
  // solta os ouvintes de arraste registrados na janela quando o modal fecha
  const limparArrasteRef = useRef<(() => void) | null>(null);

  const inicial: Transform = camada.transform ?? {
    offsetLesteM: camada.offset?.leste_m ?? 0,
    offsetNorteM: camada.offset?.norte_m ?? 0,
    rotacaoGraus: 0,
    escala: 1,
  };

  const [t, setT] = useState<Transform>(inicial);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set(camada.layers_ocultos ?? []));
  const [opacidade, setOpacidade] = useState(camada.opacidade ?? 0.85);
  const [modo, setModo] = useState<Modo>("mover");
  const [passo, setPasso] = useState(10);
  const [pares, setPares] = useState<ParDeControle[]>([]);
  const [pendente, setPendente] = useState<[number, number] | null>(null);
  const [residuo, setResiduo] = useState<number | null>(null);
  const [aba, setAba] = useState<"posicao" | "camadas">("posicao");
  const [historico, setHistorico] = useState<Transform[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [carregando, setCarregando] = useState(true);

  // refs espelham o estado para os handlers do mapa, que são registrados uma vez
  const tRef = useRef(t); tRef.current = t;
  const ocultosRef = useRef(ocultos); ocultosRef.current = ocultos;
  const modoRef = useRef(modo); modoRef.current = modo;
  const pendenteRef = useRef(pendente); pendenteRef.current = pendente;

  const layersCad = useMemo(() => camada.layers_cad ?? [], [camada.layers_cad]);
  const totalLinhas = useMemo(() => layersCad.reduce((s, l) => s + l.linhas, 0), [layersCad]);
  const linhasVisiveis = useMemo(
    () => layersCad.filter((l) => !ocultos.has(l.nome)).reduce((s, l) => s + l.linhas, 0),
    [layersCad, ocultos]
  );

  /**
   * Redesenha a planta com a transformação nova — no máximo uma vez por quadro.
   *
   * Refazer o desenho custa caro: `transformarGeoJSON` percorre as 207 mil
   * linhas de Iturama e o MapLibre reprocessa a fonte inteira. Chamar isso a
   * cada evento travava a tela — segurar a seta do teclado enfileirava dezenas
   * de recálculos completos. Aqui os pedidos se acumulam num só, no próximo
   * quadro, e o último vence. Durante o ARRASTE nem isso acontece: ali a planta
   * é deslocada por `line-translate`, que é uniforme de GPU e não toca no dado.
   */
  const quadroRef = useRef<number | null>(null);
  const alvoRef = useRef<{ t: Transform; esconder: Set<string> } | null>(null);

  const redesenhar = useCallback((novo: Transform, esconder: Set<string>) => {
    alvoRef.current = { t: novo, esconder };
    if (quadroRef.current !== null) return;
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = null;
      const alvo = alvoRef.current;
      const map = mapRef.current, bruto = brutoRef.current;
      if (!alvo || !map || !bruto || !map.getSource("planta")) return;
      (map.getSource("planta") as GeoJSONSource).setData(
        transformarGeoJSON(bruto, centroRef.current, alvo.t, [...alvo.esconder])
      );
    });
  }, []);

  useEffect(() => () => { if (quadroRef.current !== null) cancelAnimationFrame(quadroRef.current); }, []);

  const aplicar = useCallback((novo: Transform, guardarHistorico = true) => {
    if (guardarHistorico) setHistorico((h) => [...h.slice(-30), tRef.current]);
    setT(novo);
    redesenhar(novo, ocultosRef.current);
  }, [redesenhar]);

  const desenharPares = useCallback((lista: ParDeControle[], meio: [number, number] | null) => {
    const map = mapRef.current;
    if (!map || !map.getSource("controle")) return;
    const feats: GeoJSON.Feature[] = [];
    lista.forEach((p, i) => {
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: p.planta }, properties: { tipo: "planta", i: i + 1 } });
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: p.satelite }, properties: { tipo: "satelite", i: i + 1 } });
      feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: [p.planta, p.satelite] }, properties: { tipo: "liga" } });
    });
    if (meio) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: meio }, properties: { tipo: "planta", i: lista.length + 1 } });
    (map.getSource("controle") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
  }, []);

  // ---------- monta o mapa uma vez ----------
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
        center: [-50.196, -19.728],
        zoom: 15,
        attributionControl: { compact: true },
      });
      mapa = map;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // régua: calibrar é julgar distância, e "isso aí é uns 20 m?" precisa de
      // referência na tela, não de conta de cabeça
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");

      const bruto = (await fetch(camada.geojson!).then((r) => r.json()).catch(() => null)) as GeoJSON.FeatureCollection | null;
      if (cancelado) return;
      if (!bruto) {
        setErro({
          mensagem: "Não consegui carregar o desenho da planta.",
          motivo: "O arquivo GeoJSON no armazenamento não respondeu.",
          solucao: "Recarregue a página; se repetir, republique a planta.",
          codigo: "geojson_indisponivel", status: 0,
        });
        setCarregando(false);
        return;
      }
      brutoRef.current = bruto;
      centroRef.current = centroDe(bruto);

      map.on("load", () => {
        map.addSource("planta", { type: "geojson", data: transformarGeoJSON(bruto, centroRef.current, inicial, camada.layers_ocultos ?? []) });
        // contorno escuro embaixo, linha clara em cima: sobre telhado de
        // cerâmica o amarelo sozinho some, e é justamente ali que a divisa
        // precisa ser lida para calibrar
        map.addLayer({
          id: "planta-contorno", type: "line", source: "planta",
          paint: {
            "line-color": "#120C02",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2.2, 16, 3.4, 19, 5] as never,
            "line-opacity": 0.5,
          },
        });
        map.addLayer({
          id: "planta", type: "line", source: "planta",
          paint: {
            "line-color": "#FFE9A8",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 16, 1.6, 19, 2.6] as never,
            "line-opacity": camada.opacidade ?? 0.85,
          },
        });

        map.addSource("controle", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "controle-liga", type: "line", source: "controle",
          filter: ["==", ["get", "tipo"], "liga"],
          paint: { "line-color": "#E0B341", "line-width": 1.5, "line-dasharray": [2, 2] },
        });
        map.addLayer({
          id: "controle-pontos", type: "circle", source: "controle",
          filter: ["!=", ["get", "tipo"], "liga"],
          paint: {
            "circle-radius": 6,
            "circle-color": ["case", ["==", ["get", "tipo"], "planta"], "#FFE9A8", "#3FCF7F"],
            "circle-stroke-width": 2, "circle-stroke-color": "#0B140F",
          },
        });

        map.jumpTo({ center: centroRef.current, zoom: 15.5 });
        setCarregando(false);
      });

      /* ---- arrastar a planta ----
       *
       * O arraste NÃO refaz o desenho. Ele empurra a camada em pixels com
       * `line-translate`, que o MapLibre resolve na GPU sem tocar no GeoJSON —
       * antes, cada pixel de mouse recalculava as 207 mil linhas de Iturama e a
       * planta andava aos solavancos, meio segundo atrás do cursor. Ao soltar,
       * a geometria é recalculada UMA vez, na posição final, e o empurrão
       * visual volta a zero: o que fica gravado é o dado, não o truque.
       *
       * Com Shift o movimento anda a 15% — é o ajuste de centímetro, para
       * encostar a divisa no meio-fio sem precisar do teclado.
       *
       * Os eventos de movimento e soltura ficam na JANELA, não no mapa: soltar
       * o botão fora do canvas (no painel de baixo, comum quando se arrasta
       * para cima) deixava a planta grudada no cursor.
       */
      const FINO = 0.15;
      let arrastando: { px: number; py: number; base: Transform; ultimo: [number, number] } | null = null;
      const canvas = map.getCanvas();

      const emMetros = (dxPx: number, dyPx: number, origem: { px: number; py: number }): [number, number] => {
        const a = map.unproject([origem.px, origem.py]);
        const b = map.unproject([origem.px + dxPx, origem.py + dyPx]);
        const lat = centroRef.current[1];
        return [
          (b.lng - a.lng) * 111_320 * Math.cos((lat * Math.PI) / 180),
          (b.lat - a.lat) * 110_540,
        ];
      };

      map.on("mousedown", (e: MapMouseEvent) => {
        if (modoRef.current !== "mover") return;
        e.preventDefault();
        arrastando = { px: e.point.x, py: e.point.y, base: tRef.current, ultimo: [0, 0] };
        // o zoom durante o arraste invalidaria a conversão pixel→metro
        map.scrollZoom.disable();
        canvas.style.cursor = "grabbing";
      });

      const aoMover = (ev: MouseEvent) => {
        if (!arrastando) return;
        const r = canvas.getBoundingClientRect();
        const k = ev.shiftKey ? FINO : 1;
        const dx = (ev.clientX - r.left - arrastando.px) * k;
        const dy = (ev.clientY - r.top - arrastando.py) * k;
        arrastando.ultimo = [dx, dy];
        for (const id of ["planta", "planta-contorno"]) {
          if (map.getLayer(id)) map.setPaintProperty(id, "line-translate", [dx, dy]);
        }
        // o painel acompanha em metros, sem redesenhar o dado
        const [dLeste, dNorte] = emMetros(dx, dy, arrastando);
        setT({
          ...arrastando.base,
          offsetLesteM: arrastando.base.offsetLesteM + dLeste,
          offsetNorteM: arrastando.base.offsetNorteM + dNorte,
        });
      };

      const aoSoltar = () => {
        if (!arrastando) return;
        const { base, ultimo } = arrastando;
        const [dLeste, dNorte] = emMetros(ultimo[0], ultimo[1], arrastando);
        arrastando = null;
        map.scrollZoom.enable();
        canvas.style.cursor = modoRef.current === "mover" ? "grab" : "";

        const novo: Transform = {
          ...base,
          offsetLesteM: base.offsetLesteM + dLeste,
          offsetNorteM: base.offsetNorteM + dNorte,
        };
        tRef.current = novo;
        setT(novo);
        setHistorico((h) => [...h.slice(-30), base]);
        // a geometria assume a posição e o empurrão visual zera no mesmo quadro
        redesenhar(novo, ocultosRef.current);
        for (const id of ["planta", "planta-contorno"]) {
          if (map.getLayer(id)) map.setPaintProperty(id, "line-translate", [0, 0]);
        }
      };

      window.addEventListener("mousemove", aoMover);
      window.addEventListener("mouseup", aoSoltar);
      limparArrasteRef.current = () => {
        window.removeEventListener("mousemove", aoMover);
        window.removeEventListener("mouseup", aoSoltar);
      };

      // ---- pontos de controle ----
      map.on("click", (e: MapMouseEvent) => {
        if (modoRef.current !== "pontos") return;
        const p: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (!pendenteRef.current) {
          pendenteRef.current = p;
          setPendente(p);
          setPares((atuais) => { desenharPares(atuais, p); return atuais; });
        } else {
          const par = { planta: pendenteRef.current, satelite: p };
          pendenteRef.current = null;
          setPendente(null);
          setPares((atuais) => { const novo = [...atuais, par]; desenharPares(novo, null); return novo; });
        }
      });
    })();

    return () => {
      cancelado = true;
      limparArrasteRef.current?.();
      limparArrasteRef.current = null;
      mapa?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camada.id]);

  // o modo controla o pan do mapa e o cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (modo === "mover") { map.dragPan.disable(); map.getCanvas().style.cursor = "grab"; }
    else { map.dragPan.enable(); map.getCanvas().style.cursor = modo === "pontos" ? "crosshair" : ""; }
  }, [modo, carregando]);

  const mover = useCallback((dLeste: number, dNorte: number) => {
    aplicar({ ...tRef.current, offsetLesteM: tRef.current.offsetLesteM + dLeste, offsetNorteM: tRef.current.offsetNorteM + dNorte });
  }, [aplicar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      const p = e.shiftKey ? 1 : passo;
      if (e.key === "ArrowUp") { e.preventDefault(); mover(0, p); }
      else if (e.key === "ArrowDown") { e.preventDefault(); mover(0, -p); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); mover(-p, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); mover(p, 0); }
      else if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); desfazer(); }
      else if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function desfazer() {
    setHistorico((h) => {
      if (!h.length) return h;
      const anterior = h[h.length - 1];
      setT(anterior);
      redesenhar(anterior, ocultosRef.current);
      return h.slice(0, -1);
    });
  }

  function alternarLayer(nome: string) {
    setOcultos((atual) => {
      const novo = new Set(atual);
      if (novo.has(nome)) novo.delete(nome); else novo.add(nome);
      redesenhar(tRef.current, novo);
      return novo;
    });
  }

  function aplicarPontos() {
    const ajuste = ajustarPorPontos(pares, centroRef.current, t);
    if (!ajuste) {
      setErro({
        mensagem: "Não deu para calcular o ajuste com esses pontos.",
        motivo: "Os pontos marcados na planta estão praticamente no mesmo lugar — sem distância entre eles não há como medir giro nem escala.",
        solucao: "Marque o segundo par num ponto distante do primeiro, de preferência em cantos opostos da cidade.",
        codigo: "pontos_degenerados", status: 0,
      });
      return;
    }
    setErro(null);
    setResiduo(ajuste.residuoM);
    aplicar({
      offsetLesteM: ajuste.offsetLesteM, offsetNorteM: ajuste.offsetNorteM,
      rotacaoGraus: ajuste.rotacaoGraus, escala: ajuste.escala,
    });
  }

  function aplicarDatum(chave: string) {
    const d = DESLOCAMENTO_DATUM[chave];
    if (!d) return;
    aplicar({ ...t, offsetLesteM: d.leste, offsetNorteM: d.norte });
  }

  /**
   * O aviso de sucesso repete o que o BANCO respondeu, não o que a tela tem.
   * É de propósito: a queixa era "calibro e não salva", e uma mensagem genérica
   * não distingue gravou de não gravou. Aqui, se o número ecoado bate com o
   * painel, gravou; se não bate, o operador vê na hora.
   */
  async function salvar() {
    setSalvando(true); setMsg(""); setErro(null);
    const r = await enviarJson<{ aplicado?: Record<string, number | string[]> }>(
      `/api/admin/cartografia/${camada.id}`, "PATCH", {
        offset_leste_m: Math.round(t.offsetLesteM * 100) / 100,
        offset_norte_m: Math.round(t.offsetNorteM * 100) / 100,
        rotacao_graus: Math.round(t.rotacaoGraus * 1e4) / 1e4,
        escala: Math.round(t.escala * 1e6) / 1e6,
        opacidade,
        layers_ocultos: [...ocultos],
        pontos_controle: pares,
      });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }

    // o que acabou de ser gravado passa a ser a referência de "sem pendência"
    setSalvo({ t: tRef.current, ocultos: [...ocultos].sort(), opacidade });

    const g = r.dados.aplicado ?? {};
    const n = (v: unknown, casas: number) => (typeof v === "number" ? v.toFixed(casas) : "—");
    setMsg(
      `Gravado: leste ${n(g.offset_leste_m, 1)} m · norte ${n(g.offset_norte_m, 1)} m · ` +
      `giro ${n(g.rotacao_graus, 3)}° · escala ${typeof g.escala === "number" ? (g.escala * 100).toFixed(2) + "%" : "—"} · ` +
      `${ocultos.size} camada${ocultos.size === 1 ? "" : "s"} do CAD oculta${ocultos.size === 1 ? "" : "s"}. Já vale no mapa público.`
    );
  }

  /**
   * "Já salvei isso?" — a tela não respondia, e a queixa de que a calibração
   * não salvava vinha em parte daí. `salvo` guarda o último estado GRAVADO (o
   * que veio do banco ao abrir, depois o que o PATCH confirmou), e a barra do
   * rodapé compara com o que está na tela.
   *
   * A tolerância de 1 cm em metros e de 1e-6 em escala existe porque o valor
   * volta arredondado do banco (`salvar` manda 2 casas em metros): comparar por
   * igualdade exata acusaria pendência logo depois de salvar com sucesso.
   */
  const [salvo, setSalvo] = useState<{ t: Transform; ocultos: string[]; opacidade: number }>({
    t: inicial,
    ocultos: [...(camada.layers_ocultos ?? [])].sort(),
    opacidade: camada.opacidade ?? 0.85,
  });

  const haMudancaNaoSalva = useMemo(() => {
    if (!ehIgualAoSalvo(salvo.t, t)) return true;
    if (Math.abs(salvo.opacidade - opacidade) > 1e-6) return true;
    const atuais = [...ocultos].sort();
    return atuais.length !== salvo.ocultos.length || atuais.some((n, i) => n !== salvo.ocultos[i]);
  }, [salvo, t, ocultos, opacidade]);

  const btn = "w-11 h-11 rounded-lg bg-superficie border border-linha hover:bg-verde hover:text-white transition text-lg font-semibold";
  const chip = (ativo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm border transition ${ativo ? "bg-verde text-white border-verde" : "border-linha hover:bg-superficie-2"}`;
  const deslocamentoTotal = Math.hypot(t.offsetLesteM, t.offsetNorteM);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-superficie rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-linha flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-texto">Calibrar: {camada.nome}</p>
            <p className="text-xs text-texto-2">
              {modo === "mover" && "Arraste a planta com o mouse até bater no satélite. Segure Shift enquanto arrasta para andar devagar; setas do teclado para o ajuste fino (Shift = 1 m). Ctrl+Z desfaz."}
              {modo === "navegar" && "Arraste para navegar no mapa. Volte para “mover planta” quando quiser ajustar."}
              {modo === "pontos" && (pendente
                ? "Agora clique no MESMO ponto no satélite."
                : "Clique num ponto da planta (um cruzamento, um canto de quadra).")}
            </p>
          </div>
          <button onClick={onFechar} className="w-9 h-9 rounded-full hover:bg-superficie-2 text-lg shrink-0">✕</button>
        </div>

        {/*
          BARRA DE EDIÇÃO — modo, desfazer e salvar no mesmo lugar.

          Antes, "Salvar calibração" e "Desfazer" ficavam no fim do modal.
          Medido em 17/09/2026 numa janela de 778 px: o modal pede 1.180 px de
          rolagem e o salvar caía em y=1135 — 357 px abaixo da dobra. Dava para
          calibrar a planta inteira sem nunca ver como gravar.

          Ficam aqui, colados nos botões de modo, porque é a mesma tarefa:
          escolher a ferramenta, mexer, desfazer se errou, gravar quando bateu.
          `sticky top-0` mantém a barra à vista durante a rolagem do modal.
        */}
        <div className="sticky top-0 z-10 bg-superficie/95 backdrop-blur border-b border-linha px-5 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button className={chip(modo === "mover")} onClick={() => setModo("mover")}>✥ Mover planta</button>
            <button className={chip(modo === "navegar")} onClick={() => setModo("navegar")}>🖐 Navegar</button>
            <button className={chip(modo === "pontos")} onClick={() => setModo("pontos")}>◎ Pontos de controle</button>

            <span className="w-px self-stretch bg-linha mx-1" aria-hidden />

            <button onClick={desfazer} disabled={!historico.length}
              className="rounded-lg btn-contorno px-3 py-1.5 text-sm hover:bg-superficie-2 transition disabled:opacity-40"
              title="Volta o último movimento (Ctrl+Z)">
              ↩ Desfazer
            </button>
            <button onClick={() => aplicar({ offsetLesteM: 0, offsetNorteM: 0, rotacaoGraus: 0, escala: 1 })}
              disabled={ehIgualAoSalvo(TRANSFORM_ZERO, t)}
              className="rounded-lg btn-contorno px-3 py-1.5 text-sm hover:bg-superficie-2 transition disabled:opacity-40"
              title="Zera deslocamento, giro e escala">
              Zerar posição
            </button>

            <button onClick={salvar} disabled={salvando || !haMudancaNaoSalva}
              className="btn-ouro px-5 py-1.5 text-sm disabled:opacity-60 ml-auto">
              {salvando ? "Salvando…" : "Salvar calibração"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* a pendência vem antes do "salvo com sucesso": mexer na planta
                depois de salvar não pode continuar mostrando confirmação */}
            {haMudancaNaoSalva
              ? <span className="text-ouro">● Alterações não salvas</span>
              : msg
                ? <span className="text-verde">{msg}</span>
                : <span className="text-texto-2">Nada para salvar — a planta está como está gravada.</span>}
            <span className="ml-auto text-texto-2">
              {carregando ? "carregando a planta…" : `${fmt(linhasVisiveis)} de ${fmt(totalLinhas)} linhas no mapa`}
            </span>
          </div>
        </div>

        <div ref={containerRef} style={{ height: "50vh", minHeight: 340, position: "relative" }} />

        <div className="border-t border-linha">
          <div className="flex gap-1 px-5 pt-3">
            <button className={chip(aba === "posicao")} onClick={() => setAba("posicao")}>Posição</button>
            <button className={chip(aba === "camadas")} onClick={() => setAba("camadas")}>
              Camadas do CAD {ocultos.size > 0 && `(${ocultos.size} ocultas)`}
            </button>
          </div>

          {aba === "posicao" && (
            <div className="p-5 flex flex-wrap items-start gap-6">
              <div className="grid grid-cols-3 gap-1.5 w-fit">
                <span />
                <button className={btn} onClick={() => mover(0, passo)} title="Norte">↑</button>
                <span />
                <button className={btn} onClick={() => mover(-passo, 0)} title="Oeste">←</button>
                <button className={btn + " text-xs"} title="Zerar tudo"
                  onClick={() => aplicar({ offsetLesteM: 0, offsetNorteM: 0, rotacaoGraus: 0, escala: 1 })}>0</button>
                <button className={btn} onClick={() => mover(passo, 0)} title="Leste">→</button>
                <span />
                <button className={btn} onClick={() => mover(0, -passo)} title="Sul">↓</button>
                <span />
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-texto-2">Passo do ajuste</p>
                  <div className="flex gap-1.5">
                    {[1, 5, 10, 50].map((p) => (
                      <button key={p} onClick={() => setPasso(p)} className={chip(passo === p)}>{p} m</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-texto-2">Ponto de partida por datum da planta</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(DESLOCAMENTO_DATUM).map(([k, d]) => (
                      <button key={k} onClick={() => aplicarDatum(k)}
                        className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2 transition">
                        {d.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 min-w-56">
                <label className="block space-y-1">
                  <span className="text-xs text-texto-2">Giro: <strong className="text-texto">{t.rotacaoGraus.toFixed(3)}°</strong></span>
                  <input type="range" min={-2} max={2} step={0.001} value={t.rotacaoGraus} className="w-full"
                    onChange={(e) => aplicar({ ...t, rotacaoGraus: Number(e.target.value) }, false)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-texto-2">Escala: <strong className="text-texto">{(t.escala * 100).toFixed(2)}%</strong></span>
                  <input type="range" min={0.98} max={1.02} step={0.0001} value={t.escala} className="w-full"
                    onChange={(e) => aplicar({ ...t, escala: Number(e.target.value) }, false)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-texto-2">Opacidade da planta: <strong className="text-texto">{Math.round(opacidade * 100)}%</strong></span>
                  <input type="range" min={0.15} max={1} step={0.05} value={opacidade} className="w-full"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setOpacidade(v);
                      mapRef.current?.setPaintProperty("planta", "line-opacity", v);
                    }} />
                </label>
              </div>

              <div className="text-sm tabular-nums space-y-1">
                <p className="text-xs text-texto-2">Ajuste aplicado</p>
                <p className="font-medium">
                  leste {t.offsetLesteM.toFixed(1)} m · norte {t.offsetNorteM.toFixed(1)} m
                </p>
                <p className="text-xs text-texto-2">
                  deslocamento total {deslocamentoTotal.toFixed(1)} m
                  {deslocamentoTotal > 40 && deslocamentoTotal < 90 && " — na faixa típica de erro de datum"}
                </p>
                {pares.length > 0 && (
                  <p className="text-xs text-texto-2">
                    {pares.length} par(es) de controle
                    {residuo != null && <> · erro médio <strong className="text-texto">{residuo.toFixed(2)} m</strong></>}
                  </p>
                )}
                {/* Desfazer e Salvar ficam na barra fixa do rodapé — ver lá embaixo */}
                {(pares.length > 0 || pendente) && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setPares([]); setPendente(null); setResiduo(null); desenharPares([], null); }}
                      className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2 transition">
                      Limpar pontos
                    </button>
                  </div>
                )}
              </div>

              {modo === "pontos" && (
                <div className="w-full rounded-xl border border-linha bg-superficie-2 p-4 text-sm space-y-2">
                  <p className="font-medium text-texto">Como calibrar por pontos de controle</p>
                  <ol className="list-decimal ml-5 text-texto-2 space-y-0.5 text-[13px]">
                    <li>Clique num cruzamento bem visível <strong>na planta</strong> (linha amarela).</li>
                    <li>Clique no <strong>mesmo cruzamento no satélite</strong>. Isso fecha um par.</li>
                    <li>Repita num ponto distante — o segundo par é o que corrige giro e escala.</li>
                    <li>Clique em <strong>Aplicar pontos</strong>.</li>
                  </ol>
                  <button onClick={aplicarPontos} disabled={!pares.length}
                    className="btn-verde px-4 py-2 text-sm disabled:opacity-50">
                    Aplicar {pares.length || ""} {pares.length === 1 ? "par" : "pares"}
                  </button>
                </div>
              )}
            </div>
          )}

          {aba === "camadas" && (
            <div className="p-5 space-y-3">
              {layersCad.length === 0 ? (
                <p className="text-sm text-texto-2">
                  Esta planta foi publicada antes do diagnóstico por camada. Reenvie o DXF para poder
                  escolher o que vai ao mapa.
                </p>
              ) : (
                <>
                  <p className="text-sm text-texto-2">
                    Desmarque o que não é cadastro — vegetação, paisagismo, cotas. A planta fica limpa no mapa
                    e mais leve no celular, sem reenviar o arquivo.
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-auto pr-1">
                    {layersCad.map((l) => (
                      <label key={l.nome} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-superficie-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={!ocultos.has(l.nome)} onChange={() => alternarLayer(l.nome)} />
                        <span className="flex-1 truncate" title={l.nome}>{l.nome}</span>
                        <span className="text-xs text-texto-2 tabular-nums">{fmt(l.linhas)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2"
                      onClick={() => { const v = new Set<string>(); setOcultos(v); redesenhar(t, v); }}>
                      Mostrar todas
                    </button>
                    <button className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2"
                      onClick={() => {
                        const v = new Set(layersCad.filter((l) => l.linhas < 200).map((l) => l.nome));
                        setOcultos(v); redesenhar(t, v);
                      }}>
                      Esconder as menores (menos de 200 linhas)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {erro && <div className="px-5 pb-3"><AvisoErro erro={erro} aoFechar={() => setErro(null)} /></div>}

      </div>
    </div>
  );
}
