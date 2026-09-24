"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resultado = { municipio: string; gravados?: number; total?: number; erro?: string };

/** Puxa de novo a malha do CAR de todos os municípios (SICAR → banco). */
export default function AtualizarCar() {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [erro, setErro] = useState("");

  async function atualizar() {
    setRodando(true); setErro(""); setResultados(null);
    const r = await fetch("/api/admin/car", { method: "POST" }).catch(() => null);
    setRodando(false);
    if (!r?.ok) {
      setErro(r ? `O servidor respondeu ${r.status}.` : "A requisição não chegou ao servidor.");
      return;
    }
    setResultados((await r.json()).resultados ?? []);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button onClick={atualizar} disabled={rodando}
        className="rounded-lg btn-contorno px-4 py-2 text-sm font-medium disabled:opacity-50">
        {rodando ? "Buscando no SICAR… (cerca de 1 min)" : "Atualizar CAR agora"}
      </button>
      {erro && <p className="text-sm text-critico">{erro}</p>}
      {resultados && (
        <ul className="text-xs space-y-0.5">
          {resultados.map((r) => (
            <li key={r.municipio} className={r.erro ? "text-critico" : "text-verde"}>
              {r.municipio}: {r.erro ?? `${r.gravados} imóveis atualizados`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
