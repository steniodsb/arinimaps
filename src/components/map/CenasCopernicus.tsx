"use client";

import { useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { CloudSun, Leaf, Satellite, Search } from "lucide-react";

/** Faixas do NDVI — as mesmas de src/lib/sentinel/copernicus.ts (servidor). */
const LEGENDA_NDVI = [
  { nome: "água / sem vegetação", cor: "#3B6E8F" },
  { nome: "solo exposto", cor: "#B5835A" },
  { nome: "vegetação baixa", cor: "#E2C65B" },
  { nome: "moderada", cor: "#8BC34A" },
  { nome: "densa", cor: "#1E7A3A" },
];

type Cena = { id: string; data: string; nuvem: number; satelite: string; quadricula: string };

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dataBr = (d: string) => d.split("-").reverse().join("/");
const CAMPO = "w-full rounded-lg border border-linha-forte bg-superficie-2 px-2.5 py-2 text-sm text-texto focus:border-verde focus:outline-none";

/**
 * Cenas do Sentinel-2 pelo Copernicus Data Space (22/10/2026), dentro do
 * painel "Imagem do ano": a pessoa escolhe o período e a nuvem máxima, vê as
 * passagens que cobrem a tela e abre uma em cor real ou NDVI. A cena
 * escolhida vira a "imagem do ano" do mapa (id `cdse:data:tipo`), então a
 * cortina de comparação funciona igual.
 */
export default function CenasCopernicus({ mapa, selecionada, aoEscolher }: {
  mapa: MLMap | null;
  selecionada: string | null;
  aoEscolher: (id: string | null) => void;
}) {
  const [de, setDe] = useState(diasAtras(90));
  const [ate, setAte] = useState(hoje());
  const [nuvem, setNuvem] = useState(20);
  const [cenas, setCenas] = useState<Cena[] | null>(null);
  const [processamento, setProcessamento] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const atual = selecionada?.match(/^cdse:(\d{4}-\d{2}-\d{2}):(cor|ndvi)$/);
  const [tipo, setTipo] = useState<"cor" | "ndvi">((atual?.[2] as "cor" | "ndvi") ?? "cor");

  async function buscar() {
    if (!mapa) return;
    setBuscando(true); setErro("");
    const b = mapa.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(4)).join(",");
    const r = await fetch(`/api/sentinel/cenas?bbox=${bbox}&de=${de}&ate=${ate}&nuvem=${nuvem}`).catch(() => null);
    const j = await r?.json().catch(() => null) as { cenas?: Cena[]; processamento?: boolean; error?: string; solucao?: string } | null;
    setBuscando(false);
    if (!r?.ok || !j?.cenas) {
      setErro([j?.error ?? "Não consegui buscar as cenas agora.", j?.solucao].filter(Boolean).join(" "));
      return;
    }
    setCenas(j.cenas);
    setProcessamento(!!j.processamento);
  }

  function abrir(data: string, t = tipo) {
    aoEscolher(`cdse:${data}:${t}`);
    // a cena só é gerada de perto (10 m por pixel): de longe, aproxima sozinho
    if (mapa && mapa.getZoom() < 10) mapa.easeTo({ zoom: 11, duration: 600 });
  }

  return (
    <div className="space-y-3 border-t border-linha pt-3.5">
      <div className="flex items-center gap-2">
        <Satellite className="size-4 text-verde" />
        <p className="text-sm font-semibold text-texto">Cena do dia — Sentinel-2 (Copernicus)</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-texto-2">De
          <input type="date" value={de} min="2017-03-28" max={ate} onChange={(e) => setDe(e.target.value)} className={CAMPO} />
        </label>
        <label className="text-xs text-texto-2">Até
          <input type="date" value={ate} min={de} max={hoje()} onChange={(e) => setAte(e.target.value)} className={CAMPO} />
        </label>
      </div>
      <label className="block text-xs text-texto-2">Nuvem na passagem: até {nuvem}%
        <input type="range" min={0} max={100} step={5} value={nuvem} onChange={(e) => setNuvem(Number(e.target.value))}
          className="mt-1 w-full accent-verde" aria-label="Nuvem máxima da cena" />
      </label>
      <button onClick={buscar} disabled={buscando || !mapa}
        className="btn-contorno inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50">
        <Search className="size-4" /> {buscando ? "Buscando…" : "Buscar cenas desta área"}
      </button>
      {erro && <p className="text-xs text-critico">{erro}</p>}

      {cenas && (
        cenas.length === 0
          ? <p className="text-xs text-texto-2">Nenhuma passagem com até {nuvem}% de nuvem no período. Aumente a nuvem ou o período.</p>
          : (
            <>
              <div className="flex rounded-lg border border-linha p-0.5 text-xs" role="group" aria-label="Como ver a cena">
                {(["cor", "ndvi"] as const).map((t) => (
                  <button key={t} onClick={() => { setTipo(t); if (atual) abrir(atual[1], t); }}
                    className={"flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 " + (tipo === t ? "bg-verde/15 font-semibold text-verde" : "text-texto-2")}>
                    {t === "cor" ? <><CloudSun className="size-3.5" /> Cor real</> : <><Leaf className="size-3.5" /> Vegetação (NDVI)</>}
                  </button>
                ))}
              </div>
              {!processamento && (
                <p className="rounded-lg bg-ouro/10 px-3 py-2 text-xs text-ouro">
                  A lista vem do catálogo aberto do Copernicus, mas abrir a cena depende da conta da Arini no Copernicus Data Space, que ainda não foi configurada.
                </p>
              )}
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {cenas.map((c) => {
                  const ativa = atual?.[1] === c.data;
                  return (
                    <li key={c.id}>
                      <button onClick={() => abrir(c.data)} disabled={!processamento}
                        className={"flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition disabled:opacity-60 " + (ativa ? "bg-verde/15 text-texto" : "hover:bg-superficie-2 text-texto-2")}>
                        <span className="tabular-nums">{dataBr(c.data)}</span>
                        <span className="text-xs tabular-nums">{c.nuvem.toLocaleString("pt-BR")}% nuvem · {c.satelite.replace("Sentinel-", "S")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )
      )}

      {atual?.[2] === "ndvi" && (
        <div className="space-y-1">
          <div className="flex h-2 overflow-hidden rounded-full">
            {LEGENDA_NDVI.map((f) => <span key={f.nome} className="flex-1" style={{ background: f.cor }} />)}
          </div>
          <div className="flex justify-between text-[10px] text-texto-2"><span>água / solo</span><span>vegetação densa</span></div>
          <p className="text-[11px] text-texto-2">Cinza claro = nuvem ou sombra naquela passagem.</p>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-texto-2">
        A nuvem listada é a da quadrícula inteira (~110 km): uma passagem com nuvem pode estar limpa no seu ponto.
        A cena aparece do zoom 10 em diante (10 m por pixel).
      </p>
    </div>
  );
}
