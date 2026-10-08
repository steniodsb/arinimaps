"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

export default function CadastroBotoes({
  alvo, id, status,
}: { alvo: "partner" | "owner"; id: string; status: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);

  async function decidir(acao: string, pedirMotivo = false) {
    let motivo: string | null = null;
    if (pedirMotivo) {
      motivo = prompt("O que falta complementar?");
      if (motivo === null) return;
    }
    setOcupado(true);
    setErro(null);
    const r = await enviarJson("/api/admin/decisao", "POST", { alvo, id, acao, motivo });
    setOcupado(false);
    if (r.ok) router.refresh(); else setErro(r.erro);
  }

  const aprovado = ["aprovado", "ativo"].includes(status);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!aprovado && (
          <>
            <button disabled={ocupado} onClick={() => decidir("ativo")}
              className="btn-verde px-3.5 py-2 text-sm disabled:opacity-50">
              Aprovar
            </button>
            <button disabled={ocupado} onClick={() => decidir("pendente", true)}
              className="btn-contorno px-3.5 py-2 text-sm !text-alerta disabled:opacity-50">
              Pedir complemento
            </button>
            <button disabled={ocupado} onClick={() => decidir("reprovado")}
              className="btn-perigo px-3.5 py-2 text-sm disabled:opacity-50">
              Reprovar
            </button>
          </>
        )}
        {aprovado && (
          <button disabled={ocupado} onClick={() => decidir("suspenso")}
            className="btn-contorno px-3.5 py-2 text-sm disabled:opacity-50">
            Suspender
          </button>
        )}
      </div>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}
