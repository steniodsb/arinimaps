"use client";

/**
 * Painel de inteligência territorial do imóvel selecionado (coluna direita).
 * Espelha o mockup: identificação, situação do CAR, abas e indicadores com
 * contagem colorida — verde quando é zero, âmbar/vermelho quando há incidência.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatArea } from "@/lib/format";

export type ImovelSelecionado = {
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

type Indicador = { rotulo: string; valor: number | string; tom: "ok" | "alerta" | "critico" | "neutro" };

const ABAS = ["Resumo", "Fundiário", "Ambiental", "Infraestrutura"] as const;

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export default function PainelImovel({
  imovel, raio, onRaio, onFechar,
}: {
  imovel: ImovelSelecionado;
  raio: number;
  onRaio: (r: number) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<(typeof ABAS)[number]>("Resumo");
  const [consulta, setConsulta] = useState<Record<string, { quantidade: number; erro: string | null } | null>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    fetch(`/api/imoveis/${imovel.id}/consulta-rural`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.fontes) return;
        const mapa: Record<string, { quantidade: number; erro: string | null } | null> = {};
        for (const f of d.fontes) {
          mapa[f.id] = f.consulta ? { quantidade: f.consulta.quantidade, erro: f.consulta.erro } : null;
        }
        setConsulta(mapa);
      })
      .finally(() => setCarregando(false));
  }, [imovel.id]);

  const qtd = (id: string) => consulta[id]?.quantidade ?? 0;
  const consultado = (id: string) => consulta[id] != null;

  const indicadores: Record<string, Indicador[]> = {
    Resumo: [
      { rotulo: "Embargos ambientais", valor: consultado("ibama_embargos") ? qtd("ibama_embargos") : "—", tom: qtd("ibama_embargos") ? "critico" : "ok" },
      { rotulo: "Processos minerários", valor: consultado("anm") ? qtd("anm") : "—", tom: qtd("anm") ? "alerta" : "ok" },
      { rotulo: "Desmatamento (PRODES)", valor: consultado("prodes_cerrado") ? qtd("prodes_cerrado") : "—", tom: qtd("prodes_cerrado") ? "alerta" : "ok" },
      { rotulo: "Terras indígenas", valor: consultado("funai") ? qtd("funai") : "—", tom: qtd("funai") ? "critico" : "ok" },
    ],
    Fundiário: [
      { rotulo: "CAR / SICAR", valor: "importar", tom: "neutro" },
      { rotulo: "SIGEF / INCRA", valor: "importar", tom: "neutro" },
      { rotulo: "Terras indígenas", valor: consultado("funai") ? qtd("funai") : "—", tom: qtd("funai") ? "critico" : "ok" },
    ],
    Ambiental: [
      { rotulo: "Embargos (IBAMA)", valor: "importar", tom: "neutro" },
      { rotulo: "Desmatamento (INPE)", valor: consultado("prodes_cerrado") ? qtd("prodes_cerrado") : "—", tom: qtd("prodes_cerrado") ? "alerta" : "ok" },
      { rotulo: "Unidades de conservação", valor: "—", tom: "neutro" },
    ],
    Infraestrutura: [
      { rotulo: "Processos minerários", valor: consultado("anm") ? qtd("anm") : "—", tom: qtd("anm") ? "alerta" : "ok" },
      { rotulo: "Pontos de interesse", valor: consultado("pois_osm") ? qtd("pois_osm") : "—", tom: "neutro" },
    ],
  };

  const corTom = (tom: Indicador["tom"], valor: Indicador["valor"]) => {
    if (typeof valor === "string") return "text-texto-2";
    if (valor === 0) return "text-verde";
    return tom === "critico" ? "text-critico" : tom === "alerta" ? "text-alerta" : "text-texto";
  };

  return (
    <aside className="w-[340px] shrink-0 h-full overflow-y-auto bg-superficie border-l border-linha">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-texto-2">{imovel.codigo}</span>
          <button onClick={onFechar} aria-label="Fechar painel"
            className="w-8 h-8 rounded-lg hover:bg-superficie-2 text-texto-2 hover:text-texto transition">✕</button>
        </div>

        {imovel.capa && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(imovel.capa)} alt="" className="w-full h-36 object-cover rounded-xl" />
        )}

        <div>
          <div className="flex items-start gap-2">
            <h2 className="text-xl font-semibold text-texto leading-tight flex-1">{imovel.titulo}</h2>
            <span className="text-[11px] rounded-full bg-verde/15 text-verde px-2.5 py-1 shrink-0">
              {imovel.status === "publicado" ? "Ativo" : imovel.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-2xl font-semibold text-texto mt-2">{formatArea(imovel.area_m2, imovel.tipo)}</p>
          <p className="text-xs text-texto-2">Área total</p>
        </div>

        <dl className="text-sm divide-y divide-linha">
          <div className="flex justify-between py-2">
            <dt className="text-texto-2">Município</dt>
            <dd className="text-texto">{imovel.municipio ?? "—"}</dd>
          </div>
          <div className="flex justify-between py-2 gap-3">
            <dt className="text-texto-2 shrink-0">Valor</dt>
            <dd className="text-texto text-right">
              {imovel.valor ? imovel.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Sob consulta"}
            </dd>
          </div>
        </dl>

        <Link href={`/imovel/${imovel.codigo}`}
          className="flex items-center justify-between w-full rounded-xl border border-linha bg-superficie-2 px-4 py-3 text-sm hover:border-verde transition">
          Ver detalhes do imóvel <span className="text-texto-2">›</span>
        </Link>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {ABAS.map((a) => (
            <button key={a} onClick={() => setAba(a)} data-ativo={aba === a}
              className="chip px-3.5 py-1.5 text-xs whitespace-nowrap">
              {a}
            </button>
          ))}
        </div>

        <div className="divide-y divide-linha">
          {indicadores[aba].map((i) => (
            <div key={i.rotulo} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-texto-2">{i.rotulo}</span>
              <span className={"font-semibold tabular-nums " + corTom(i.tom, i.valor)}>{i.valor}</span>
            </div>
          ))}
        </div>

        {carregando ? (
          <p className="text-xs text-texto-2">Carregando consulta territorial…</p>
        ) : !Object.keys(consulta).length || !Object.values(consulta).some(Boolean) ? (
          <p className="text-xs text-texto-2">
            Sem consulta territorial ainda. A equipe Arini executa na análise do imóvel.
          </p>
        ) : null}

        <div className="cartao p-4 space-y-2">
          <p className="text-sm font-semibold text-texto">Raio de análise</p>
          <p className="text-xs text-texto-2">Veja o que existe no entorno do imóvel.</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[1000, 5000, 10000, 25000, 50000].map((r) => (
              <button key={r} onClick={() => onRaio(r)} data-ativo={raio === r}
                className="chip px-3 py-1.5 text-xs">
                {r / 1000} km
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/imovel/${imovel.codigo}/tour`}
            className="btn-contorno flex-1 text-center text-sm py-2.5">Tour 3D</Link>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${imovel.lat},${imovel.lng}`}
            target="_blank" rel="noreferrer"
            className="btn-contorno flex-1 text-center text-sm py-2.5">Como chegar</a>
        </div>
      </div>
    </aside>
  );
}
