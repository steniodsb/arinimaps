"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api/enviar";

/**
 * Botão da Matriz para validar a divisa atual (§3: até a validação, a
 * geometria é "informada pelo usuário"). Só aparece quando a versão atual
 * ainda não está validada.
 */
export default function ValidarGeometria({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function validar() {
    const motivo = prompt("Observação da validação (opcional):");
    if (motivo === null) return;
    setOcupado(true);
    setErro("");
    const r = await enviarJson("/api/admin/geometria/validar", "POST", { property_id: propertyId, motivo: motivo || null });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro.mensagem); return; }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={ocupado} onClick={validar}
        className="rounded-lg bg-verde text-white px-3 py-1.5 text-xs font-medium hover:bg-verde-escuro disabled:opacity-50">
        {ocupado ? "Validando…" : "Validar divisa"}
      </button>
      {erro && <span className="text-xs text-critico">{erro}</span>}
    </span>
  );
}
