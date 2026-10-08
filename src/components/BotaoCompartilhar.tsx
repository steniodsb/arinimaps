"use client";

import { useState } from "react";
import { Check, MessageCircle, Share2 } from "lucide-react";

export default function BotaoCompartilhar({ codigo, titulo }: { codigo: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  // URL montada só no clique: window não existe no SSR (evita hydration mismatch)
  const montarUrl = () => `${window.location.origin}/i/${codigo}`;

  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-linha-forte bg-superficie py-3 text-sm font-bold text-texto transition hover:border-verde hover:text-verde"
        onClick={async () => {
          const url = montarUrl();
          if (navigator.share) {
            try { await navigator.share({ title: titulo, url }); return; } catch { /* cancelado */ }
          }
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}>
        {copiado ? <><Check className="size-4" /> Link copiado</> : <><Share2 className="size-4" /> Compartilhar</>}
      </button>
      <button
        type="button"
        className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#25D366] py-3 text-sm font-bold text-white transition hover:brightness-95"
        onClick={() => {
          const texto = `${titulo} — veja no mapa da Arini: ${montarUrl()}`;
          window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
        }}>
        <MessageCircle className="size-4" /> WhatsApp
      </button>
    </div>
  );
}
