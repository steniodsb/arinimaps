"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * O PDF sai pela impressão do navegador (Salvar como PDF). É o caminho que
 * funciona em qualquer hospedagem — gerar o arquivo no servidor exigiria
 * Chromium instalado, que o app não tem (o worker tem, e pode assumir isso
 * depois sem mudar esta página).
 */
export default function BotoesRelatorio({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex flex-wrap gap-2 mb-7 print:hidden">
      <button onClick={() => window.print()} className="btn-ouro px-5 py-2.5 text-sm">
        Baixar relatório (PDF)
      </button>
      <button
        onClick={async () => {
          const url = `${window.location.origin}/imovel/${codigo}/relatorio`;
          if (navigator.share) {
            try { await navigator.share({ title: `Relatório ${codigo}`, url }); return; } catch { /* cancelado */ }
          }
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
        className="btn-contorno px-5 py-2.5 text-sm">
        {copiado ? "Link copiado ✓" : "Compartilhar"}
      </button>
      <Link href={`/imovel/${codigo}`} className="btn-contorno px-5 py-2.5 text-sm">
        Ver anúncio
      </Link>
    </div>
  );
}
