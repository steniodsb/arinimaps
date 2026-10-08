"use client";

import type { Lacuna } from "@/lib/ia/conhecimento";
import { Etiqueta } from "@/components/ui/Pagina";
import { FilePen, HelpCircle, X } from "lucide-react";

const dataBR = (d: string) => new Date(d).toLocaleDateString("pt-BR");

/**
 * "Perguntas sem resposta": o que o assistente não soube responder, das mais
 * frequentes para as menos. Responder abre o editor de artigo já com a
 * pergunta como título (ou o rascunho já ligado a ela); a ligação com o
 * artigo é feita por ArtigosAdmin ao salvar.
 */
export default function LacunasLista({ lacunas, resumo, ocupado, aoResponder, aoDescartar }: {
  lacunas: Lacuna[];
  resumo: { respondidas: number; descartadas: number };
  ocupado: string | null;
  aoResponder: (l: Lacuna) => void;
  aoDescartar: (l: Lacuna) => void;
}) {
  return (
    <div className="cartao p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-texto">
          <HelpCircle className="size-4 text-verde" /> Perguntas sem resposta ({lacunas.length})
        </h2>
        <p className="text-sm text-texto-2 tabular-nums">{resumo.respondidas} respondidas · {resumo.descartadas} descartadas</p>
      </div>
      <p className="text-sm leading-relaxed text-texto-2">
        O assistente anota aqui o que não encontrou nas ferramentas, sem dados pessoais e agrupando perguntas iguais.
        Publicar um artigo que responda é o que faz ele acertar da próxima vez.
      </p>
      {lacunas.length ? (
        <div className="divide-y divide-linha rounded-xl border border-linha">
          {lacunas.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-60 flex-1">
                <p className="text-[0.95rem] font-semibold leading-snug text-texto">{l.pergunta}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-texto-2 tabular-nums">
                  <Etiqueta tom={l.ocorrencias >= 3 ? "alerta" : "neutro"} className="!py-0.5">
                    {l.ocorrencias} {l.ocorrencias === 1 ? "vez" : "vezes"}
                  </Etiqueta>
                  última em {dataBR(l.ultima_em)}
                  {l.motivo && <span>· {l.motivo}</span>}
                  {l.artigo_id && <span className="text-alerta">· rascunho ligado, falta publicar</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={ocupado === l.id} onClick={() => aoResponder(l)}
                  className="btn-verde inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                  <FilePen className="size-4" /> Responder
                </button>
                <button type="button" disabled={ocupado === l.id} onClick={() => aoDescartar(l)}
                  className="btn-contorno inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                  <X className="size-4" /> Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.95rem] text-texto-2">Nenhuma pergunta pendente.</p>
      )}
    </div>
  );
}
