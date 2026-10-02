import type { Metadata } from "next";
import FormAcesso from "./FormAcesso";

export const metadata: Metadata = {
  title: "Acesso restrito",
  robots: { index: false, follow: false },
};

/** Porta do site enquanto ele está em testes (senha de bloqueio). */
export default function Acesso() {
  return (
    <div className="min-h-screen flex flex-col bg-fundo">
      <div className="px-4 py-4 border-b border-linha">
        <span className="font-semibold text-texto">
          Arini <span className="texto-ouro">Maps</span>
        </span>
      </div>
      <main className="flex-1 flex items-center justify-center p-4">
        <FormAcesso />
      </main>
    </div>
  );
}
