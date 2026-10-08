"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Download, Share2 } from "lucide-react";

/**
 * O PDF sai pela impressão do navegador (Salvar como PDF). É o caminho que
 * funciona em qualquer hospedagem — gerar o arquivo no servidor exigiria
 * Chromium instalado, que o app não tem (o worker tem, e pode assumir isso
 * depois sem mudar esta página).
 */
export default function BotoesRelatorio({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="mb-10 flex flex-wrap gap-3 print:hidden">
      <button onClick={() => window.print()} className="lp-btn lp-btn-ouro !px-5 !py-3 text-[0.95rem]">
        <Download /> Baixar relatório (PDF)
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
        className="lp-btn lp-btn-contorno !px-5 !py-3 text-[0.95rem]">
        {copiado ? <><Check /> Link copiado</> : <><Share2 /> Compartilhar</>}
      </button>
      <Link href={`/imovel/${codigo}`} className="lp-btn lp-btn-contorno !px-5 !py-3 text-[0.95rem]">
        Ver anúncio <ArrowRight />
      </Link>
    </div>
  );
}
