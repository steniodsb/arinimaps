"use client";

import { useCallback, useEffect, useState } from "react";

type Doc = {
  id: string; tipo: string; nome_arquivo: string | null; verificado: boolean;
  verificado_em: string | null; created_at: string; url: string | null;
};

const TIPOS = [
  ["matricula", "Matrícula / escritura"], ["ccir_itr", "CCIR / ITR"], ["car", "CAR"], ["itr", "ITR"],
  ["dwg", "Planta / DWG"], ["autorizacao", "Autorização de venda"], ["outro", "Outro"],
] as const;

/**
 * Documentos do imóvel. `podeConferir` (equipe Arini) mostra o botão de
 * conferência — aprovar e publicar exigem a matrícula conferida.
 */
export default function DocumentosImovel({ propertyId, podeConferir = false }: { propertyId: string; podeConferir?: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipo, setTipo] = useState("matricula");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/imoveis/${propertyId}/documentos`);
    if (res.ok) setDocs((await res.json()).documentos ?? []);
  }, [propertyId]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select className="rounded-lg cartao px-3 py-2 text-sm"
          value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className={`rounded-lg px-4 py-2 text-sm font-medium cursor-pointer ${ocupado ? "bg-superficie-2 text-texto-2" : "bg-verde text-white hover:bg-verde-escuro"}`}>
          {ocupado ? "Enviando…" : "Anexar arquivo"}
          <input type="file" className="hidden" disabled={ocupado} onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setOcupado(true);
            setMsg("");
            const fd = new FormData();
            fd.set("arquivo", f);
            fd.set("tipo", tipo);
            const res = await fetch(`/api/imoveis/${propertyId}/documentos`, { method: "POST", body: fd });
            setOcupado(false);
            if (res.ok) { setMsg("Documento anexado."); carregar(); }
            else setMsg((await res.json()).error ?? "Falha no envio.");
          }} />
        </label>
      </div>
      {msg && <p className="text-xs text-verde">{msg}</p>}
      <ul className="divide-y divide-linha text-sm">
        {docs.map((d) => (
          <li key={d.id} className="py-2 flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-40">
              <span className="block">{TIPOS.find(([v]) => v === d.tipo)?.[1] ?? d.tipo}</span>
              {d.nome_arquivo && <span className="block text-xs text-texto-2 truncate">{d.nome_arquivo}</span>}
            </span>
            <span className="text-xs text-texto-2">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span>
            {d.url && <a href={d.url} target="_blank" className="text-xs text-verde hover:underline">abrir</a>}
            {podeConferir ? (
              <button type="button" disabled={ocupado}
                onClick={async () => {
                  setOcupado(true); setMsg("");
                  const res = await fetch(`/api/imoveis/${propertyId}/documentos`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documento_id: d.id, verificado: !d.verificado }),
                  });
                  setOcupado(false);
                  if (res.ok) carregar(); else setMsg((await res.json()).error ?? "Falha ao conferir.");
                }}
                className={`text-xs rounded-full px-3 py-1 border transition ${d.verificado ? "border-verde text-verde bg-verde/10" : "border-linha text-texto-2 hover:text-texto"}`}>
                {d.verificado ? "conferido ✓" : "marcar como conferido"}
              </button>
            ) : (
              <span className={`text-xs ${d.verificado ? "text-verde" : "text-texto-2"}`}>
                {d.verificado ? "conferido pela Arini ✓" : "aguardando conferência"}
              </span>
            )}
          </li>
        ))}
        {!docs.length && <li className="py-2 text-xs text-texto-2">Nenhum documento ainda.</li>}
      </ul>
    </div>
  );
}
