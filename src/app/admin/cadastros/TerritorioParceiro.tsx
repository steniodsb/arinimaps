"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Franquia territorial: a Matriz transforma um parceiro aprovado em franqueado
 * de uma região. O franqueado continua vendo só os próprios imóveis; aprovar
 * e publicar segue sendo da Matriz.
 */
export default function TerritorioParceiro({
  id, tipo, regionId, regioes,
}: { id: string; tipo: string; regionId: string; regioes: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(region_id: string) {
    setOcupado(true); setErro("");
    const res = await fetch("/api/admin/parceiros", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, region_id }),
    });
    setOcupado(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Falhou."); return; }
    router.refresh();
  }

  return (
    <label className="text-xs text-texto-2 flex items-center gap-1.5" title="Região que este parceiro representa como franqueado">
      {tipo === "franqueado" ? "Franqueado de" : "Território"}
      <select value={regionId} disabled={ocupado} onChange={(e) => salvar(e.target.value)}
        className="rounded-lg border border-linha bg-superficie-2 px-2 py-1 text-xs text-texto max-w-44">
        <option value="">— nenhum —</option>
        {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </select>
      {erro && <span className="text-critico">{erro}</span>}
    </label>
  );
}
