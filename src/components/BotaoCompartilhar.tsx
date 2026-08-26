"use client";

import { useState } from "react";

export default function BotaoCompartilhar({ codigo, titulo }: { codigo: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  // URL montada só no clique: window não existe no SSR (evita hydration mismatch)
  const montarUrl = () => `${window.location.origin}/i/${codigo}`;

  return (
    <div className="flex gap-2">
      <button
        className="flex-1 rounded-lg border border-linha bg-white text-sm font-medium py-2 hover:bg-areia"
        onClick={async () => {
          const url = montarUrl();
          if (navigator.share) {
            try { await navigator.share({ title: titulo, url }); return; } catch { /* cancelado */ }
          }
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}>
        {copiado ? "Link copiado ✓" : "Compartilhar"}
      </button>
      <button
        className="flex-1 rounded-lg bg-[#25D366] text-white text-sm font-medium py-2 text-center hover:opacity-90"
        onClick={() => {
          const texto = `${titulo} — veja no mapa da Arini: ${montarUrl()}`;
          window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
        }}>
        WhatsApp
      </button>
    </div>
  );
}
