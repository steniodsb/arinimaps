"use client";

/**
 * Peças de interface do mapa (tema escuro dos mockups), separadas do
 * MapaRegional para o componente do mapa cuidar só de mapa.
 */

import Link from "next/link";
import {
  ArrowRight, Fuel, GraduationCap, Hospital, Landmark, Layers, Lock, MapPin, Pill, Route, ShoppingCart, X,
  type LucideIcon,
} from "lucide-react";
import { STATUS_CORES } from "@/lib/map/config";
import { STATUS_LABEL } from "@/lib/format";

/**
 * Painel de vidro sobre o satélite: superfície do tema a 85 % com desfoque.
 * No tema escuro vira vidro fumê; no claro, vidro fosco branco — o texto usa
 * os tokens do tema e continua legível nos dois.
 */
export const VIDRO =
  "rounded-2xl border border-linha-forte/70 bg-superficie/85 backdrop-blur-xl shadow-[0_24px_60px_-28px_rgb(0_0_0/0.75)]";

/** Botão "fechar" dos painéis do mapa (ícone X, alvo de 32 px). */
export function BotaoFechar({ onClick, rotulo = "Fechar" }: { onClick: () => void; rotulo?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo}
      className="grid size-8 shrink-0 place-items-center rounded-[10px] text-texto-2 transition hover:bg-superficie-2 hover:text-texto">
      <X className="size-4" />
    </button>
  );
}

const ICONES_POI: Record<string, LucideIcon> = {
  combustivel: Fuel, farmacia: Pill, supermercado: ShoppingCart, hospital: Hospital,
  escola: GraduationCap, centro: Landmark, acesso_rodovia: Route,
};

/** Ícone do ponto de referência (substitui os emojis de CATEGORIA_POI_ICONE). */
export function IconePoi({ categoria, className = "size-4" }: { categoria: string; className?: string }) {
  const Icone = ICONES_POI[categoria] ?? MapPin;
  return <Icone aria-hidden className={className} />;
}

export const CAMADAS_GRUPOS = [
  {
    grupo: "Fundiário",
    itens: [
      { id: "car", nome: "CAR / SICAR", estado: "importar" },
      { id: "sigef", nome: "SIGEF / INCRA", estado: "importar" },
      { id: "funai", nome: "Terras Indígenas", estado: "online" },
    ],
  },
  {
    grupo: "Ambiental",
    itens: [
      { id: "ibama_embargos", nome: "Embargos Ambientais (IBAMA)", estado: "importar" },
      { id: "prodes_cerrado", nome: "Desmatamento (INPE / PRODES)", estado: "online" },
    ],
  },
  {
    grupo: "Infraestrutura",
    itens: [
      { id: "anm", nome: "Processos Minerários (ANM)", estado: "online" },
      { id: "pois_osm", nome: "Pontos de interesse e rodovias", estado: "online" },
    ],
  },
  {
    grupo: "Cartografia",
    itens: [{ id: "plantas", nome: "Plantas urbanas das cidades", estado: "no-mapa" }],
  },
] as const;

const ESTADO_ESTILO: Record<string, string> = {
  online: "bg-verde/14 text-verde border-verde/25",
  "no-mapa": "bg-ouro/14 text-ouro border-ouro/30",
  importar: "bg-superficie-2 text-texto-2 border-linha",
};
const ESTADO_ROTULO: Record<string, string> = {
  online: "consulta ao vivo",
  "no-mapa": "no mapa",
  importar: "importar",
};

export function PainelCamadas({
  onFechar, bloqueado = false, logado = false,
}: { onFechar: () => void; /** sem o recurso `camadas_oficiais` no plano */ bloqueado?: boolean; logado?: boolean }) {
  return (
    <div className={`absolute top-16 left-3 z-10 w-80 max-w-[calc(100%-1.5rem)] max-h-[70%] overflow-y-auto p-5 space-y-5 ${VIDRO}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-verde/12 text-verde">
            <Layers className="size-[18px]" />
          </span>
          <p className="font-display text-lg font-bold text-texto">Camadas e Dados</p>
        </div>
        <BotaoFechar onClick={onFechar} rotulo="Fechar camadas" />
      </div>

      {bloqueado && (
        <div className="rounded-xl border border-ouro/40 bg-ouro/10 p-3.5 text-sm text-texto space-y-1.5">
          <p className="flex items-center gap-2 font-semibold">
            <Lock className="size-4 shrink-0 text-ouro" /> Camadas oficiais na consulta profissional
          </p>
          <p className="text-xs text-texto-2 leading-relaxed">
            As divisas do CAR e os lotes urbanos continuam abertos. As demais fontes entram com o plano profissional.
          </p>
          <Link href={logado ? "/planos" : "/entrar"} className="inline-flex items-center gap-1 text-sm font-semibold text-verde hover:underline">
            {logado ? "Ver planos" : "Entrar"} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      {CAMADAS_GRUPOS.map((g) => (
        <div key={g.grupo} className={"space-y-1" + (bloqueado && g.grupo !== "Cartografia" ? " opacity-60" : "")}>
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-ouro">{g.grupo}</p>
          {g.itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="text-texto-3">{i.nome}</span>
              <span className={"shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold " + (ESTADO_ESTILO[i.estado] ?? "")}>
                {ESTADO_ROTULO[i.estado] ?? i.estado}
              </span>
            </div>
          ))}
        </div>
      ))}

      <p className="text-xs text-texto-2 border-t border-linha pt-4 leading-relaxed">
        As camadas de consulta ao vivo entram no relatório do imóvel na análise da Arini.
        As marcadas como “importar” dependem do arquivo oficial do órgão.
      </p>
    </div>
  );
}

export function Legenda() {
  return (
    <div className={`absolute bottom-36 lg:bottom-32 left-3 px-4 py-3 text-xs space-y-1.5 ${VIDRO}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ouro">Legenda</p>
      {Object.entries(STATUS_CORES).map(([status, cor]) => (
        <p key={status} className="flex items-center gap-2 text-texto-3">
          <span className="inline-block size-2.5 rounded-full ring-2 ring-black/10" style={{ background: cor }} />
          {STATUS_LABEL[status]}
        </p>
      ))}
      <p className="flex items-center gap-2 text-texto-3 pt-1.5 border-t border-linha">
        <span className="inline-block w-3.5 h-0.5 rounded-full" style={{ background: "#FF9D3D" }} />
        Imóvel rural (CAR)
      </p>
      <p className="flex items-center gap-2 text-texto-3">
        <span className="inline-block w-3.5 h-0.5 rounded-full" style={{ background: "#FFE9A8" }} />
        Lote urbano
      </p>
    </div>
  );
}
