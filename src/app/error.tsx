"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { Logo } from "@/components/shell/AppShell";

/**
 * Erro inesperado com a cara do site. Componente cliente (exigência do Next):
 * não lê configurações nem sessão, só oferece tentar de novo e voltar.
 * O código do erro (digest) aparece para a pessoa mandar ao suporte.
 */
export default function ErroInesperado({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="lp-escuro lp-malha-escura relative flex min-h-screen flex-col overflow-hidden">
      <div className="lp-grade pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <header className="lp-container relative flex h-20 items-center">
        <Link href="/" aria-label="Página inicial"><Logo /></Link>
      </header>
      <main className="lp-container relative flex flex-1 items-center pb-24">
        <div>
          <span className="grid size-14 place-items-center rounded-2xl bg-white/10 text-[#E4C77E]">
            <AlertTriangle className="size-7" />
          </span>
          <p className="lp-eyebrow mt-8">Algo deu errado</p>
          <h1 className="lp-display mt-3 max-w-3xl text-4xl text-white md:text-6xl">
            Não conseguimos abrir esta tela agora
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
            Tente de novo em alguns segundos. Se continuar, fale com o suporte e informe o código abaixo.
          </p>
          {error.digest && (
            <p className="mt-4 font-mono text-sm text-white/60">Código: {error.digest}</p>
          )}
          <div className="mt-9 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="lp-btn lp-btn-verde"><RotateCcw /> Tentar de novo</button>
            <Link href="/suporte" className="lp-btn lp-btn-claro">Falar com o suporte</Link>
            <Link href="/" className="lp-btn lp-btn-claro">Página inicial <ArrowRight /></Link>
          </div>
        </div>
      </main>
    </div>
  );
}
