"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api/enviar";

/** Decisão da Matriz sobre a alteração proposta de um anúncio publicado (§9). */
export default function RevisaoBotoes({ revisaoId }: { revisaoId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function decidir(acao: "aprovar" | "rejeitar") {
    let motivo: string | null = null;
    if (acao === "rejeitar") {
      motivo = prompt("Motivo da rejeição (o anunciante vai ver):");
      if (motivo === null) return;
    }
    setOcupado(true);
    setErro("");
    const r = await enviarJson("/api/admin/decisao", "POST", { alvo: "revisao", id: revisaoId, acao, motivo });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro.mensagem); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        <button type="button" disabled={ocupado} onClick={() => decidir("aprovar")}
          className="btn-verde px-4 py-2.5 text-sm disabled:opacity-50">
          Aprovar e aplicar no anúncio
        </button>
        <button type="button" disabled={ocupado} onClick={() => decidir("rejeitar")}
          className="btn-perigo px-4 py-2.5 text-sm disabled:opacity-50">
          Rejeitar
        </button>
      </div>
      {erro && <p className="text-sm text-critico">{erro}</p>}
    </div>
  );
}
