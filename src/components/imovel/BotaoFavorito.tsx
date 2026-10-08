"use client";

import { useSyncExternalStore, useState } from "react";
import { Heart } from "lucide-react";

/**
 * Coração de favorito (cartão da busca e ficha do imóvel). Todos os botões da
 * página compartilham o mesmo estado: marcar num lugar acende nos outros.
 * O servidor manda o estado inicial (sem piscar); a rota /api/favoritos
 * grava na conta ou, sem conta, num cookie.
 */
let codigos: Set<string> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function definir(lista: string[]) {
  codigos = new Set(lista);
  avisar();
  window.dispatchEvent(new CustomEvent("arini:favoritos", { detail: lista.length }));
}

export default function BotaoFavorito({ codigo, inicial, variante = "cartao" }: {
  codigo: string;
  inicial: boolean;
  variante?: "cartao" | "ficha";
}) {
  const marcado = useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => (codigos ? codigos.has(codigo) : inicial),
    () => inicial,
  );
  const [enviando, setEnviando] = useState(false);

  async function alternar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (enviando) return;
    const novo = !marcado;
    // otimista: acende na hora e desfaz se a rota falhar
    const antes = codigos ? [...codigos] : (inicial ? [codigo] : []);
    definir(novo ? [...antes.filter((c) => c !== codigo), codigo] : antes.filter((c) => c !== codigo));
    setEnviando(true);
    try {
      const r = await fetch("/api/favoritos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, favorito: novo }),
      });
      if (!r.ok) throw new Error();
      const j = await r.json() as { codigos: string[] };
      definir(j.codigos);
    } catch {
      definir(antes);
    } finally {
      setEnviando(false);
    }
  }

  const rotulo = marcado ? "Remover dos favoritos" : "Salvar nos favoritos";
  if (variante === "ficha") {
    return (
      <button type="button" onClick={alternar} aria-pressed={marcado} title={rotulo}
        className={`flex w-full items-center justify-center gap-2 rounded-[10px] border py-3 text-sm font-bold transition ${marcado
          ? "border-[#FF6B81]/50 bg-[#FF6B81]/12 text-[#FF8A9B]"
          : "border-linha-forte bg-superficie text-texto hover:border-[#FF6B81]/60 hover:text-[#FF8A9B]"}`}>
        <Heart className={`size-4 ${marcado ? "fill-current" : ""}`} />
        {marcado ? "Salvo nos favoritos" : "Favoritar"}
      </button>
    );
  }
  return (
    <button type="button" onClick={alternar} aria-pressed={marcado} aria-label={rotulo} title={rotulo}
      className={`grid size-10 place-items-center rounded-full backdrop-blur transition active:scale-90 ${marcado
        ? "bg-white text-[#E5304F]"
        : "bg-black/45 text-white hover:bg-black/65"}`}>
      <Heart className={`size-5 ${marcado ? "fill-current" : ""}`} />
    </button>
  );
}
