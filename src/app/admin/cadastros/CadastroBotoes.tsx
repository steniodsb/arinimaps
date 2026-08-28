"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CadastroBotoes({
  alvo, id, status,
}: { alvo: "partner" | "owner"; id: string; status: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function decidir(acao: string, pedirMotivo = false) {
    let motivo: string | null = null;
    if (pedirMotivo) {
      motivo = prompt("O que falta complementar?");
      if (motivo === null) return;
    }
    setOcupado(true);
    const res = await fetch("/api/admin/decisao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvo, id, acao, motivo }),
    });
    setOcupado(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Falha na decisão.");
      return;
    }
    router.refresh();
  }

  const aprovado = ["aprovado", "ativo"].includes(status);
  return (
    <div className="flex gap-2">
      {!aprovado && (
        <>
          <button disabled={ocupado} onClick={() => decidir("ativo")}
            className="rounded-lg bg-verde text-white text-xs font-medium px-3 py-1.5 hover:bg-verde-escuro disabled:opacity-50">
            Aprovar
          </button>
          <button disabled={ocupado} onClick={() => decidir("pendente", true)}
            className="rounded-lg bg-alerta text-white text-xs font-medium px-3 py-1.5 hover:bg-alerta/80 disabled:opacity-50">
            Pedir complemento
          </button>
          <button disabled={ocupado} onClick={() => decidir("reprovado")}
            className="rounded-lg bg-critico text-white text-xs font-medium px-3 py-1.5 hover:bg-critico/80 disabled:opacity-50">
            Reprovar
          </button>
        </>
      )}
      {aprovado && (
        <button disabled={ocupado} onClick={() => decidir("suspenso")}
          className="rounded-lg bg-superficie-2 text-texto border border-linha text-xs font-medium px-3 py-1.5 hover:bg-linha disabled:opacity-50">
          Suspender
        </button>
      )}
    </div>
  );
}
