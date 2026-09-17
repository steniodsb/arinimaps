"use client";

import { useState } from "react";
import type { ErroApi } from "@/lib/api/enviar";

/**
 * Bloco padrão de erro do painel: mensagem, motivo e o que fazer agora,
 * com os detalhes técnicos escondidos atrás de um clique. Uma linha
 * vermelha solta ("Falha no envio.") não diz o que a pessoa faz em seguida —
 * este componente obriga a resposta a ter caminho de saída.
 */
export function AvisoErro({ erro, aoFechar }: { erro: ErroApi; aoFechar?: () => void }) {
  const [abertos, setAbertos] = useState(false);
  const temDetalhes = erro.detalhes && Object.keys(erro.detalhes).length > 0;

  return (
    <div className="rounded-xl border border-critico/40 bg-critico/10 p-4 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-critico leading-5">⚠</span>
        <div className="flex-1 space-y-1.5">
          <p className="font-semibold text-critico">{erro.mensagem}</p>
          {erro.motivo && (
            <p className="text-texto-2">
              <span className="text-texto-2/70">Motivo: </span>{erro.motivo}
            </p>
          )}
          {erro.solucao && (
            <p className="text-texto">
              <span className="text-texto-2/70">O que fazer: </span>{erro.solucao}
            </p>
          )}
          {(temDetalhes || erro.codigo) && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setAbertos((v) => !v)}
                className="text-xs text-texto-2 underline underline-offset-2 hover:text-texto"
              >
                {abertos ? "Ocultar detalhes técnicos" : "Detalhes técnicos"}
              </button>
              {abertos && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-superficie-2 p-3 text-[11px] leading-relaxed text-texto-2 whitespace-pre-wrap">
{JSON.stringify({ codigo: erro.codigo, status: erro.status, ...(erro.detalhes ?? {}) }, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
        {aoFechar && (
          <button type="button" onClick={aoFechar} className="text-texto-2 hover:text-texto" aria-label="Fechar">✕</button>
        )}
      </div>
    </div>
  );
}

export function AvisoOk({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-verde/40 bg-verde/10 p-4 text-sm text-texto flex items-start gap-2">
      <span aria-hidden className="text-verde leading-5">✓</span>
      <div className="flex-1 space-y-1">{children}</div>
    </div>
  );
}
