"use client";

import { useEffect, useState } from "react";

/**
 * Selo do menu "Chamados" na Central (10.2): quantos chamados têm a última
 * mensagem do cliente. Consulta a cada 30 s com a aba visível — e cada
 * consulta marca a presença da equipe ("atendente online" para o cliente).
 */
export function useNaoLidosSuporte(ativo: boolean, intervalo = 30_000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const consultar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/suporte/nao-lidos", { cache: "no-store" });
        if (res.ok && vivo) setN(Number((await res.json()).aguardando) || 0);
      } catch { /* tenta no próximo ciclo */ }
    };
    void consultar();
    const t = setInterval(consultar, intervalo);
    const aoVoltar = () => void consultar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [ativo, intervalo]);
  return n;
}
