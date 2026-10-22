"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

/** Descarta uma importação que parou no meio (os polígonos dela saem do banco). */
export default function DescartarImportacao({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  async function descartar() {
    if (!confirm("Descartar esta importação? Os polígonos enviados por ela serão apagados.")) return;
    setOcupado(true); setErro(null);
    const r = await enviarJson(`/api/admin/car/importacoes/${id}`, "DELETE");
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button onClick={descartar} disabled={ocupado} className="btn-contorno inline-flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-50">
        <Trash2 className="size-4" /> {ocupado ? "Descartando…" : "Descartar importação"}
      </button>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}
