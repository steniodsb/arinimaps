"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import { Logo } from "@/components/shell/AppShell";
import { Supergrafico } from "@/components/ui/Pagina";
import { BTN_ACAO } from "@/components/landing/Titulo";

/**
 * Erro inesperado com a cara do site. Componente cliente (exigência do Next):
 * não lê configurações nem sessão, só oferece tentar de novo e voltar.
 * O código do erro (digest) aparece para a pessoa mandar ao suporte.
 */
export default function ErroInesperado({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="lp-escuro fundo-curvas-escuro relative flex min-h-screen flex-col overflow-hidden">
      <Supergrafico className="opacity-40" />
      <header className="lp-container relative flex h-20 items-center">
        <Link href="/" aria-label="Página inicial"><Logo negativa /></Link>
      </header>
      <main className="lp-container relative flex flex-1 items-center pb-24">
        <div>
          <span className="grid size-14 place-items-center rounded-full border border-[#D9BD6F]/70 text-ouro">
            <AlertTriangle className="size-7" />
          </span>
          <p className="lp-eyebrow mt-8">Algo deu errado</p>
          <h1 className="lp-display mt-3 max-w-3xl text-[2.8rem] text-white md:text-[4.6rem]">
            Não conseguimos abrir esta tela agora
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
            Tente de novo em alguns segundos. Se continuar, fale com o suporte e informe o código abaixo.
          </p>
          {error.digest && (
            <p className="mt-4 font-mono text-sm text-white/60">Código: {error.digest}</p>
          )}
          <div className="mt-9 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className={BTN_ACAO}><RotateCcw /> Tentar de novo</button>
            <Link href="/suporte" className="lp-btn lp-btn-claro">Falar com o suporte</Link>
            <Link href="/" className="lp-btn lp-btn-claro">Página inicial <ArrowRight /></Link>
          </div>
        </div>
      </main>
    </div>
  );
}
