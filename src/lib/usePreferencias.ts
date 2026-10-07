"use client";

/** Hook das preferências da conta (5.10). Tipos e validação: `preferencias.ts`. */

import { useCallback, useEffect, useState } from "react";
import { CHAVE_PREFERENCIAS, PREFERENCIAS_PADRAO, normalizar, type Preferencias } from "@/lib/preferencias";

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

/** O que a rota devolve além das preferências (o cabeçalho usa a foto). */
export type ContaResumo = { nome: string | null; avatar_url: string | null };

type Estado = { prefs: Preferencias; logado: boolean; conta: ContaResumo | null; carregado: boolean };

const EVENTO = "arini:preferencias";
let cache: Estado | null = null;
let pedido: Promise<Estado> | null = null;

function lerLocal(): Preferencias {
  try {
    const s = localStorage.getItem(CHAVE_PREFERENCIAS);
    return normalizar(s ? JSON.parse(s) : {});
  } catch {
    return PREFERENCIAS_PADRAO;
  }
}

function gravarLocal(p: Preferencias) {
  try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p)); } catch { /* storage bloqueado */ }
}

async function carregar(): Promise<Estado> {
  const local = lerLocal();
  try {
    const res = await fetch("/api/conta/preferencias", { headers: { Accept: "application/json" } });
    const tipo = res.headers.get("content-type") ?? "";
    if (res.ok && tipo.includes("application/json")) {
      const d = await res.json();
      const prefs = normalizar(d.preferencias);
      gravarLocal(prefs);
      return { prefs, logado: true, conta: { nome: d.nome ?? null, avatar_url: d.avatar_url ?? null }, carregado: true };
    }
  } catch { /* sem rede: fica no que o navegador lembra */ }
  return { prefs: local, logado: false, conta: null, carregado: true };
}

/** Força reler do servidor (ex.: depois de trocar a foto em /conta). */
export function recarregarPreferencias() {
  pedido = carregar().then((e) => {
    cache = e;
    window.dispatchEvent(new CustomEvent(EVENTO));
    return e;
  });
  return pedido;
}

/**
 * Preferências da pessoa, iguais em todas as instâncias da página (um só
 * pedido por carregamento). `salvar` aplica na hora, lembra no navegador e,
 * com sessão, grava na conta.
 */
export function usePreferencias() {
  const [estado, setEstado] = useState<Estado>(
    cache ?? { prefs: PREFERENCIAS_PADRAO, logado: false, conta: null, carregado: false }
  );

  useEffect(() => {
    let vivo = true;
    const atualizar = () => { if (vivo && cache) setEstado(cache); };
    window.addEventListener(EVENTO, atualizar);
    if (!pedido) pedido = cache ? Promise.resolve(cache) : carregar().then((e) => { cache = e; return e; });
    pedido.then(() => atualizar());
    return () => { vivo = false; window.removeEventListener(EVENTO, atualizar); };
  }, []);

  const salvar = useCallback(async (parcial: Partial<Preferencias>) => {
    const atual = cache ?? estado;
    const prefs = normalizar({ ...atual.prefs, ...parcial });
    cache = { ...atual, prefs, carregado: true };
    gravarLocal(prefs);
    window.dispatchEvent(new CustomEvent(EVENTO));
    if (!atual.logado) return true;
    try {
      const res = await fetch("/api/conta/preferencias", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parcial),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [estado]);

  return { ...estado, salvar };
}
