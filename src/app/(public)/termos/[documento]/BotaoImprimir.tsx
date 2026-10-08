"use client";

import { Printer } from "lucide-react";

export default function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-linha-forte px-2.5 py-1 text-xs font-semibold text-texto-2 transition hover:border-verde hover:text-verde print:hidden">
      <Printer className="size-3.5" /> Imprimir / salvar PDF
    </button>
  );
}
