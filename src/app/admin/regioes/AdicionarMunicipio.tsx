"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

export default function AdicionarMunicipio() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState<ErroApi | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="rounded-lg cartao px-3 py-2 text-sm w-56"
          placeholder="Código IBGE (7 dígitos)" value={codigo} inputMode="numeric"
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 7))} />
        <button disabled={ocupado || codigo.length !== 7}
          className="rounded-lg bg-verde text-white text-sm font-medium px-4 py-2 hover:bg-verde-escuro disabled:opacity-50"
          onClick={async () => {
            setOcupado(true);
            setMsg("");
            setErro(null);
            const r = await enviarJson<{ nome: string }>("/api/admin/municipios", "POST", { codigo_ibge: codigo });
            setOcupado(false);
            if (r.ok) {
              setMsg(`${r.dados.nome} adicionado com a malha do IBGE.`);
              setCodigo("");
              router.refresh();
            } else setErro(r.erro);
          }}>
          {ocupado ? "Importando…" : "Adicionar município"}
        </button>
      </div>
      <p className="text-xs text-texto-2">
        {msg || "Busca nome e limites direto no IBGE. Consulte o código em cidades.ibge.gov.br."}
      </p>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}
