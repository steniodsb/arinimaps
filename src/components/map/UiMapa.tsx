"use client";

/**
 * Peças de interface do mapa (tema escuro dos mockups), separadas do
 * MapaRegional para o componente do mapa cuidar só de mapa.
 */

import Link from "next/link";
import {
  ArrowRight, Fuel, GraduationCap, Hospital, Landmark, Layers, LoaderCircle, Lock, MapPin, Pill, Route, ShoppingCart, X,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABEL } from "@/lib/format";
import { CAMADAS_OFICIAIS, type CamadaOficialId } from "@/lib/map/camadasOficiais";
import { STATUS_MAPA, RADAR_ANEL } from "./statusMapa";
import type { EstadoCamada } from "./camadasOficiaisMapa";

/**
 * Painel de vidro sobre o satélite: superfície do tema a 85 % com desfoque.
 * No tema escuro vira vidro fumê; no claro, vidro fosco branco — o texto usa
 * os tokens do tema e continua legível nos dois.
 */
export const VIDRO =
  "rounded-2xl border border-linha bg-superficie/95 backdrop-blur-md shadow-[0_1px_2px_var(--sombra-botao),0_14px_32px_-22px_var(--sombra-popup)]";

export { STATUS_MAPA, RADAR_ANEL };

/**
 * Cores que ficam FORA da paleta, de propósito: o laranja cartográfico do CAR
 * separa o rural do urbano à primeira vista sobre o satélite (pedido do
 * cliente) e o Amarelo Claro marca o lote urbano.
 */
const COR_CAR = "#FF9D3D";
const COR_LOTE_LEGENDA = "#FFE299";

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

/**
 * Painel "Camadas e Dados": as camadas oficiais ligam e desligam aqui (as do
 * CAR e das plantas têm botão próprio na barra do mapa). Cada uma mostra se
 * está carregando, quantas feições há na tela ou por que não aparece.
 */
export function PainelCamadas({
  onFechar, bloqueado = false, logado = false, ativas, estado, onAlternar,
}: {
  onFechar: () => void;
  /** sem o recurso `camadas_oficiais` no plano */
  bloqueado?: boolean;
  logado?: boolean;
  ativas: Set<CamadaOficialId>;
  estado: Partial<Record<CamadaOficialId, EstadoCamada>>;
  onAlternar: (id: CamadaOficialId) => void;
}) {
  const grupos = ["Fundiário", "Ambiental", "Infraestrutura"] as const;
  return (
    <div className={`absolute top-16 left-3 z-10 w-[22rem] max-w-[calc(100%-1.5rem)] max-h-[72%] overflow-y-auto p-5 space-y-5 ${VIDRO}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-verde/12 text-verde">
            <Layers className="size-[18px]" />
          </span>
          <p className="lp-display text-2xl text-verde">Camadas e Dados</p>
        </div>
        <BotaoFechar onClick={onFechar} rotulo="Fechar camadas" />
      </div>

      {bloqueado && (
        <div className="rounded-2xl border border-ouro/40 bg-ouro/10 p-3.5 text-sm text-texto space-y-1.5">
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

      {grupos.map((g) => (
        <div key={g} className="space-y-1">
          <p className="lp-eyebrow !text-[10px] !tracking-[0.2em] !text-ouro mb-1">{g}</p>
          {g === "Fundiário" && (
            <p className="flex items-center justify-between gap-3 border-t border-linha py-2 text-sm">
              <span className="flex items-center gap-2.5 text-texto-3">
                <span className="inline-block size-3 rounded-sm" style={{ background: COR_CAR }} /> Imóveis rurais (CAR)
              </span>
              <span className="text-[11px] font-semibold text-texto-2">botão na barra</span>
            </p>
          )}
          {CAMADAS_OFICIAIS.filter((c) => c.grupo === g).map((c) => {
            const on = ativas.has(c.id);
            const e = estado[c.id];
            return (
              <div key={c.id} className={"border-t border-linha py-2" + (bloqueado ? " opacity-60" : "")}>
                <label className={"flex items-center justify-between gap-3 text-sm " + (bloqueado ? "cursor-not-allowed" : "cursor-pointer")}>
                  <span className="flex min-w-0 items-center gap-2.5 text-texto-3">
                    <span className={"inline-block size-3 shrink-0 " + (c.ponto ? "rounded-full" : "rounded-sm")} style={{ background: c.cor }} />
                    <span className="min-w-0">
                      <span className="block truncate">{c.nome}</span>
                      <span className="block text-[11px] text-texto-2">{c.orgao}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {on && e?.carregando && <LoaderCircle className="size-3.5 animate-spin text-texto-2" aria-label="Carregando" />}
                    {on && !e?.carregando && !e?.aviso && e?.total != null && (
                      <span className="text-[11px] tabular-nums text-texto-2">{e.total.toLocaleString("pt-BR")}</span>
                    )}
                    <input type="checkbox" role="switch" checked={on} disabled={bloqueado}
                      onChange={() => onAlternar(c.id)} aria-label={`Mostrar ${c.nome}`}
                      className="peer sr-only" />
                    <span aria-hidden className={"relative h-5 w-9 rounded-full transition " + (on ? "bg-verde" : "bg-superficie-2 ring-1 ring-linha-forte")}>
                      <span className={"absolute top-0.5 size-4 rounded-full bg-white shadow transition-all " + (on ? "left-[18px]" : "left-0.5")} />
                    </span>
                  </span>
                </label>
                {on && e?.aviso && <p className="mt-1 pl-[22px] text-[11px] leading-snug text-alerta">{e.aviso}</p>}
              </div>
            );
          })}
        </div>
      ))}

      <p className="text-xs text-texto-2 border-t border-linha pt-4 leading-relaxed">
        Clique numa área para ver tudo o que incide sobre ela. Dados dos órgãos oficiais, guardados e atualizados
        periodicamente; a consulta completa do imóvel cruza todas as fontes com a data de cada uma.
      </p>
    </div>
  );
}

export function Legenda({ extras = [] }: { extras?: { cor: string; nome: string; ponto?: boolean }[] }) {
  return (
    <div className={`absolute bottom-36 lg:bottom-32 left-3 px-4 py-3 text-xs space-y-1.5 ${VIDRO}`}>
      <p className="lp-eyebrow !text-[10px] !tracking-[0.2em] !text-ouro">Legenda</p>
      {Object.entries(STATUS_MAPA).map(([status, cor]) => (
        <p key={status} className="flex items-center gap-2 text-texto-3">
          <span className="inline-block size-2.5 rounded-full ring-1 ring-linha-forte" style={{ background: cor }} />
          {STATUS_LABEL[status]}
        </p>
      ))}
      <p className="flex items-center gap-2 text-texto-3 pt-1.5 border-t border-linha">
        <span className="inline-block w-3.5 h-0.5 rounded-full" style={{ background: COR_CAR }} />
        Imóvel rural (CAR)
      </p>
      <p className="flex items-center gap-2 text-texto-3">
        <span className="inline-block w-3.5 h-0.5 rounded-full" style={{ background: COR_LOTE_LEGENDA }} />
        Lote urbano
      </p>
      {extras.map((c) => (
        <p key={c.nome} className="flex items-center gap-2 text-texto-3">
          <span className={"inline-block size-2.5 " + (c.ponto ? "rounded-full" : "rounded-sm")} style={{ background: c.cor }} />
          {c.nome}
        </p>
      ))}
    </div>
  );
}
