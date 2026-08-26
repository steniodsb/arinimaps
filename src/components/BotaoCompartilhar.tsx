"use client";

import { useState } from "react";

export default function BotaoCompartilhar({ codigo, titulo }: { codigo: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/i/${codigo}`
    : `/i/${codigo}`;
  const texto = `${titulo} — veja no mapa da Arini: ${url}`;

  return (
    <div className="flex gap-2">
      <button
        className="flex-1 rounded-lg border border-linha bg-white text-sm font-medium py-2 hover:bg-areia"
        onClick={async () => {
          if (navigator.share) {
            try { await navigator.share({ title: titulo, url }); return; } catch { /* cancelado */ }
          }
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}>
        {copiado ? "Link copiado ✓" : "Compartilhar"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
        target="_blank"
        className="flex-1 rounded-lg bg-[#25D366] text-white text-sm font-medium py-2 text-center hover:opacity-90">
        WhatsApp
      </a>
    </div>
  );
}
