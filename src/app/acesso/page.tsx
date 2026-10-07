import type { Metadata } from "next";
import FormAcesso from "./FormAcesso";
import BotaoTema from "@/components/shell/BotaoTema";

export const metadata: Metadata = {
  title: "Acesso restrito",
  robots: { index: false, follow: false },
};

/** Porta do site enquanto ele está em testes (senha de bloqueio). */
export default function Acesso() {
  return (
    <div className="min-h-screen flex flex-col bg-fundo">
      <div className="px-4 py-3 border-b border-linha flex items-center justify-between gap-3">
        <span className="font-semibold text-texto">
          Arini <span className="texto-ouro">Maps</span>
        </span>
        {/* 4.7: o tema também se escolhe na porta do site */}
        <BotaoTema />
      </div>
      <main className="flex-1 flex items-center justify-center p-4">
        <FormAcesso />
      </main>
    </div>
  );
}
