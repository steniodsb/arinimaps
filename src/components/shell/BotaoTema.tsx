"use client";

/**
 * Alterna entre o tema escuro (padrão) e o claro.
 *
 * A escolha vira `data-tema` no <html> e fica no localStorage. Quem aplica o
 * tema ANTES da pintura é o script de `TEMA_SCRIPT` (no <head>), senão a tela
 * piscaria escura antes de virar clara a cada navegação.
 */

import { useEffect, useState } from "react";

export type Tema = "escuro" | "claro";

export const CHAVE_TEMA = "arini:tema";

/**
 * Roda antes do primeiro paint, no <head>. Precisa ser pequeno, síncrono e
 * tolerante: navegador com storage bloqueado não pode derrubar a página.
 */
export const TEMA_SCRIPT = `
try {
  var t = localStorage.getItem("${CHAVE_TEMA}");
  if (t === "claro") document.documentElement.setAttribute("data-tema", "claro");
} catch (e) {}
`;

function lerTema(): Tema {
  if (typeof document === "undefined") return "escuro";
  return document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "escuro";
}

/**
 * Tema atual, para o que não é resolvido só por CSS — hoje, a base do mapa.
 *
 * Observa o atributo no <html> em vez de um contexto React porque quem escreve
 * o tema no primeiro carregamento é o script do <head>, fora do React.
 * Devolve "escuro" no primeiro render (servidor e cliente) e corrige no efeito,
 * senão a hidratação diverge.
 */
export function useTema(): Tema {
  const [tema, setTema] = useState<Tema>("escuro");
  useEffect(() => {
    setTema(lerTema());
    const obs = new MutationObserver(() => setTema(lerTema()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

export default function BotaoTema({ compacto = false }: { compacto?: boolean }) {
  // começa no escuro no servidor e no primeiro render do cliente para não dar
  // divergência de hidratação; o efeito abaixo corrige com o valor real.
  const [tema, setTema] = useState<Tema>("escuro");
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setTema(lerTema());
    setMontado(true);
  }, []);

  function alternar() {
    const novo: Tema = tema === "claro" ? "escuro" : "claro";
    setTema(novo);
    if (novo === "claro") document.documentElement.setAttribute("data-tema", "claro");
    else document.documentElement.removeAttribute("data-tema");
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* storage bloqueado: vale só nesta aba */ }
  }

  const vaiPara = tema === "claro" ? "escuro" : "claro";

  return (
    <button
      onClick={alternar}
      type="button"
      aria-label={`Mudar para o tema ${vaiPara}`}
      title={`Mudar para o tema ${vaiPara}`}
      className={
        "shrink-0 rounded-lg text-texto-2 hover:text-texto hover:bg-superficie-2 transition grid place-items-center " +
        (compacto ? "w-9 h-9" : "w-9 h-9 sm:w-auto sm:h-9 sm:px-3 sm:gap-2 sm:flex sm:items-center")
      }
    >
      {/* enquanto não montou, mostra o ícone do tema escuro — é o padrão */}
      <span aria-hidden className="text-base leading-none">
        {montado && tema === "claro" ? "☾" : "☀"}
      </span>
      {!compacto && (
        <span className="hidden sm:inline text-xs">
          {montado && tema === "claro" ? "Escuro" : "Claro"}
        </span>
      )}
    </button>
  );
}
