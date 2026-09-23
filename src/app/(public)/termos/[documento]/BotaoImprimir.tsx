"use client";

export default function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()}
      className="rounded-full border border-linha px-3 py-1 hover:text-verde hover:border-verde transition print:hidden">
      Imprimir / salvar PDF
    </button>
  );
}
