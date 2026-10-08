"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";

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
    <div className="space-y-4">
      <button onClick={atualizar} disabled={rodando}
        className="btn-contorno inline-flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-50">
        <RefreshCw className="size-4" />
        {rodando ? "Buscando no SICAR… (cerca de 1 min)" : "Atualizar CAR agora"}
      </button>
      {erro && <p className="text-sm text-critico">{erro}</p>}
      {resultados && (
        <ul className="divide-y divide-linha rounded-xl border border-linha text-[0.95rem]">
          {resultados.map((r) => (
            <li key={r.municipio} className={"flex items-center gap-2.5 px-4 py-3 " + (r.erro ? "text-critico" : "text-texto")}>
              {r.erro ? <XCircle className="size-4 shrink-0 text-critico" /> : <CheckCircle2 className="size-4 shrink-0 text-verde" />}
              <span><strong className="font-semibold">{r.municipio}</strong>: <span className="tabular-nums">{r.erro ?? `${r.gravados} imóveis atualizados`}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
