"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BotaoConsultar({ cod, jaConsultou }: { cod: string; jaConsultou: boolean }) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");

  async function consultar() {
    setRodando(true); setMsg("");
    const r = await fetch(`/api/consulta/car/${encodeURIComponent(cod)}`, { method: "POST" }).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : {};
    setRodando(false);
    if (!r?.ok) { setMsg(data.error ?? "Não foi possível consultar agora."); return; }
    setMsg(
      data.falharam?.length
        ? `${data.falharam.length} fonte(s) não responderam e aparecem como indisponíveis.`
        : data.consultadas === 0 ? "Os dados já estavam atualizados." : ""
    );
    router.refresh();
  }

  return (
    <div className="text-right space-y-1">
      <button onClick={consultar} disabled={rodando} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">
        {rodando ? "Consultando os órgãos…" : jaConsultou ? "Atualizar consulta" : "Consultar fontes oficiais"}
      </button>
      {msg && <p className="text-xs text-texto-2 max-w-64">{msg}</p>}
    </div>
  );
}
