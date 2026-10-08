"use client";

/**
 * Painel de inteligência territorial do imóvel selecionado (coluna direita).
 * Espelha o mockup: identificação, situação do CAR, abas e indicadores com
 * contagem colorida — verde quando é zero, âmbar/vermelho quando há incidência.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatArea } from "@/lib/format";
import { CATEGORIA_POI_LABEL, formatDistancia, type PoiDistancia } from "@/lib/geo/distancia";
import { Box, ChevronRight, Navigation, Radar } from "lucide-react";
import { BotaoFechar, IconePoi } from "@/components/map/UiMapa";

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
  // pontos de referência (roadmap 2.12): distância em linha reta do centro do imóvel
  // guardado com o código: ao trocar de imóvel, o do anterior não aparece enquanto carrega
  const [poisDe, setPoisDe] = useState<{ codigo: string; pois: PoiDistancia[]; em: string | null } | null>(null);
  const pois = poisDe?.codigo === imovel.codigo ? poisDe.pois : null;
  const poisEm = poisDe?.codigo === imovel.codigo ? poisDe.em : null;

  useEffect(() => {
    const codigo = imovel.codigo;
    fetch(`/api/geo/pois?codigo=${encodeURIComponent(codigo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPoisDe({ codigo, pois: d?.pois ?? [], em: d?.atualizado_em ?? null }))
      .catch(() => setPoisDe({ codigo, pois: [], em: null }));
  }, [imovel.codigo]);

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
      <div className="p-5 space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-texto-2">{imovel.codigo}</span>
          <BotaoFechar onClick={onFechar} rotulo="Fechar painel" />
        </div>

        {imovel.capa && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(imovel.capa)} alt="" className="w-full h-40 object-cover rounded-2xl" />
        )}

        <div>
          <div className="flex items-start gap-3">
            <h2 className="font-display text-[1.375rem] font-bold text-texto leading-tight flex-1 text-balance">{imovel.titulo}</h2>
            <span className="shrink-0 rounded-md border border-verde/25 bg-verde/14 px-2.5 py-1 text-xs font-semibold text-verde capitalize">
              {imovel.status === "publicado" ? "Ativo" : imovel.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-4 border-l-4 border-l-verde pl-3.5">
            <p className="lp-display text-3xl leading-none text-texto tabular-nums">{formatArea(imovel.area_m2, imovel.tipo)}</p>
            <p className="mt-1.5 text-xs text-texto-2">Área total</p>
          </div>
        </div>

        <dl className="text-sm divide-y divide-linha">
          <div className="flex justify-between py-2.5">
            <dt className="text-texto-2">Município</dt>
            <dd className="text-texto font-medium">{imovel.municipio ?? "—"}</dd>
          </div>
          <div className="flex justify-between py-2.5 gap-3">
            <dt className="text-texto-2 shrink-0">Valor</dt>
            <dd className="text-texto font-semibold text-right tabular-nums">
              {imovel.valor ? imovel.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Sob consulta"}
            </dd>
          </div>
        </dl>

        <Link href={`/imovel/${imovel.codigo}`}
          className="group flex items-center justify-between w-full rounded-xl border border-linha-forte bg-superficie-2 px-4 py-3.5 text-sm font-semibold text-texto hover:border-verde hover:text-verde transition">
          Ver detalhes do imóvel <ChevronRight className="size-4 text-texto-2 transition group-hover:translate-x-0.5 group-hover:text-verde" />
        </Link>

        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ouro">Consulta territorial</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {ABAS.map((a) => (
              <button key={a} onClick={() => setAba(a)} data-ativo={aba === a}
                className="chip px-3.5 py-1.5 text-xs whitespace-nowrap">
                {a}
              </button>
            ))}
          </div>

          <div className="divide-y divide-linha rounded-xl border border-linha px-3.5">
            {indicadores[aba].map((i) => (
              <div key={i.rotulo} className="flex items-center justify-between py-3 text-sm">
                <span className="text-texto-3">{i.rotulo}</span>
                <span className={"font-display text-base font-bold tabular-nums " + corTom(i.tom, i.valor)}>{i.valor}</span>
              </div>
            ))}
          </div>

          {carregando ? (
            <p className="text-xs text-texto-2">Carregando consulta territorial…</p>
          ) : !Object.keys(consulta).length || !Object.values(consulta).some(Boolean) ? (
            <p className="text-xs text-texto-2 leading-relaxed">
              Sem consulta territorial ainda. A equipe Arini executa na análise do imóvel.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="font-display text-lg font-bold text-texto">Pontos de referência</p>
          {pois === null ? (
            <p className="text-xs text-texto-2">Carregando…</p>
          ) : !pois.length ? (
            <p className="text-xs text-texto-2">Nenhum ponto de interesse vinculado ainda.</p>
          ) : (
            <ul className="divide-y divide-linha">
              {pois.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-superficie-2 text-texto-2">
                      <IconePoi categoria={p.categoria} className="size-3.5" />
                    </span>
                    <span className="truncate text-texto">{p.nome ?? CATEGORIA_POI_LABEL[p.categoria] ?? p.categoria}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-texto shrink-0">{formatDistancia(p.distancia_m)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-texto-2">
            Em linha reta, do centro do imóvel · OpenStreetMap
            {poisEm ? ` · atualizado em ${new Date(poisEm).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </div>

        <div className="cartao p-5 space-y-2">
          <p className="flex items-center gap-2 font-display text-base font-bold text-texto">
            <Radar className="size-4 text-verde" /> Raio de análise
          </p>
          <p className="text-xs text-texto-2">Veja o que existe no entorno do imóvel.</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[1000, 5000, 10000, 25000, 50000].map((r) => (
              <button key={r} onClick={() => onRaio(r)} data-ativo={raio === r}
                className="chip px-3 py-1.5 text-xs tabular-nums">
                {r / 1000} km
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/imovel/${imovel.codigo}/tour`}
            className="btn-contorno flex flex-1 items-center justify-center gap-1.5 text-sm py-2.5"><Box className="size-4" /> Tour 3D</Link>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${imovel.lat},${imovel.lng}`}
            target="_blank" rel="noreferrer"
            className="btn-contorno flex flex-1 items-center justify-center gap-1.5 text-sm py-2.5"><Navigation className="size-4" /> Como chegar</a>
        </div>
      </div>
    </aside>
  );
}
