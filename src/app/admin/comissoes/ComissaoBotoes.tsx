"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

const PROXIMA: Record<string, { acao: string; label: string } | undefined> = {
  registrada: { acao: "cobrada", label: "Marcar cobrada" },
  cobrada: { acao: "paga", label: "Marcar paga" },
  paga: { acao: "conciliada", label: "Conciliar" },
};

export default function ComissaoBotoes({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const proxima = PROXIMA[status];
  if (!proxima) return null;

  return (
    <div className="space-y-2">
      <button disabled={ocupado}
        className="text-xs rounded-lg bg-verde text-white px-3 py-1.5 hover:bg-verde-escuro disabled:opacity-50"
        onClick={async () => {
          setOcupado(true);
          setErro(null);
          const r = await enviarJson("/api/admin/comissoes", "POST", { commission_id: id, status: proxima.acao });
          setOcupado(false);
          if (r.ok) router.refresh(); else setErro(r.erro);
        }}>
        {proxima.label}
      </button>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}
