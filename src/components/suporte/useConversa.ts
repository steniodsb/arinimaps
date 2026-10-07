"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Conversa do suporte ao vivo (10.2), dos dois lados.
 *
 * Polling curto: a cada `intervalo` ms pede à rota só as mensagens depois da
 * última que já tem (`?since=`), e para enquanto a aba está escondida. Ao
 * voltar para a aba, consulta na hora. As mensagens são mescladas por id, então
 * um eco (a mensagem que a própria pessoa acabou de mandar) nunca duplica.
 */
export type MsgSuporte = {
  id: string; autor_nome: string; da_equipe: boolean; interno?: boolean; corpo: string; created_at: string;
};

function mesclar<M extends MsgSuporte>(atual: M[], novas: M[]): M[] {
  if (!novas.length) return atual;
  const mapa = new Map(atual.map((m) => [m.id, m]));
  for (const m of novas) mapa.set(m.id, m);
  return [...mapa.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useConversa<M extends MsgSuporte, E extends Record<string, unknown>>(
  url: string | null, inicial: M[], intervalo = 5000,
) {
  const [mensagens, setMensagens] = useState<M[]>(inicial);
  const [extra, setExtra] = useState<Partial<E>>({});
  const ultima = useRef<string | null>(inicial.at(-1)?.created_at ?? null);
  const [inicialVisto, setInicialVisto] = useState(inicial);

  // o servidor re-renderizou (router.refresh): mescla o que veio
  if (inicialVisto !== inicial) {
    setInicialVisto(inicial);
    setMensagens((m) => mesclar(m, inicial));
  }

  const adicionar = useCallback((novas: M[]) => {
    setMensagens((m) => {
      const r = mesclar(m, novas);
      ultima.current = r.at(-1)?.created_at ?? ultima.current;
      return r;
    });
  }, []);

  const consultar = useCallback(async () => {
    if (!url) return;
    try {
      const sep = url.includes("?") ? "&" : "?";
      const res = await fetch(ultima.current ? `${url}${sep}since=${encodeURIComponent(ultima.current)}` : url, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      const { mensagens: novas, ...resto } = d as { mensagens: M[] } & E;
      if (novas?.length) adicionar(novas);
      setExtra(resto as unknown as Partial<E>);
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, [url, adicionar]);

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let vivo = true;
    const ciclo = async () => {
      if (!vivo) return;
      if (document.visibilityState === "visible") await consultar();
      if (vivo) timer = setTimeout(ciclo, intervalo);
    };
    const aoVoltar = () => { if (document.visibilityState === "visible") void consultar(); };
    void ciclo();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [url, intervalo, consultar]);

  return { mensagens, extra, adicionar, consultar };
}
