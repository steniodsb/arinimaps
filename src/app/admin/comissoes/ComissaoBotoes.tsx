"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PROXIMA: Record<string, { acao: string; label: string } | undefined> = {
  registrada: { acao: "cobrada", label: "Marcar cobrada" },
  cobrada: { acao: "paga", label: "Marcar paga" },
  paga: { acao: "conciliada", label: "Conciliar" },
};

export default function ComissaoBotoes({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const proxima = PROXIMA[status];
  if (!proxima) return null;

  return (
    <button disabled={ocupado}
      className="text-xs rounded-lg bg-verde text-white px-3 py-1.5 hover:bg-verde-escuro disabled:opacity-50"
      onClick={async () => {
        setOcupado(true);
        const res = await fetch("/api/admin/comissoes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commission_id: id, status: proxima.acao }),
        });
        setOcupado(false);
        if (res.ok) router.refresh();
        else alert((await res.json()).error ?? "Falha.");
      }}>
      {proxima.label}
    </button>
  );
}
