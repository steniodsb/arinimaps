"use client";

/**
 * Peças de interface do mapa (tema escuro dos mockups), separadas do
 * MapaRegional para o componente do mapa cuidar só de mapa.
 */

import { STATUS_CORES } from "@/lib/map/config";
import { STATUS_LABEL } from "@/lib/format";

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
  online: "bg-verde/15 text-verde",
  "no-mapa": "bg-ouro/15 text-ouro",
  importar: "bg-superficie-2 text-texto-2",
};
const ESTADO_ROTULO: Record<string, string> = {
  online: "consulta ao vivo",
  "no-mapa": "no mapa",
  importar: "importar",
};

export function PainelCamadas({ onFechar }: { onFechar: () => void }) {
  return (
    <div className="absolute top-16 left-3 w-72 cartao p-4 space-y-4 shadow-2xl z-10 max-h-[70%] overflow-y-auto anima-subir">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-texto text-sm">Camadas e Dados</p>
        <button onClick={onFechar} aria-label="Fechar camadas"
          className="text-texto-2 hover:text-texto transition">✕</button>
      </div>

      {CAMADAS_GRUPOS.map((g) => (
        <div key={g.grupo} className="space-y-1.5">
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-verde">{g.grupo}</p>
          {g.itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 text-xs py-1">
              <span className="text-texto-2">{i.nome}</span>
              <span className={"rounded-full px-2 py-0.5 shrink-0 " + (ESTADO_ESTILO[i.estado] ?? "")}>
                {ESTADO_ROTULO[i.estado] ?? i.estado}
              </span>
            </div>
          ))}
        </div>
      ))}

      <p className="text-[11px] text-texto-2 border-t border-linha pt-3 leading-relaxed">
        As camadas de consulta ao vivo entram no relatório do imóvel na análise da Arini.
        As marcadas como “importar” dependem do arquivo oficial do órgão.
      </p>
    </div>
  );
}

export function Legenda() {
  return (
    <div className="absolute bottom-8 left-3 cartao px-3.5 py-2.5 text-xs space-y-1.5 shadow-xl">
      <p className="font-semibold text-texto">Legenda</p>
      {Object.entries(STATUS_CORES).map(([status, cor]) => (
        <p key={status} className="flex items-center gap-2 text-texto-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: cor }} />
          {STATUS_LABEL[status]}
        </p>
      ))}
    </div>
  );
}
