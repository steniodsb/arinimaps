"use client";

import { useCallback, useEffect, useState } from "react";

type Doc = {
  id: string; tipo: string; nome_arquivo: string | null; verificado: boolean;
  verificado_em: string | null; created_at: string; url: string | null;
  versao?: number; substituido_em?: string | null; enviado_por_nome?: string | null;
};

const TIPOS = [
  ["matricula", "Matrícula / escritura"], ["edital", "Edital do leilão"], ["ccir_itr", "CCIR / ITR"], ["car", "CAR"], ["itr", "ITR"],
  ["dwg", "Planta / DWG"], ["autorizacao", "Autorização de venda"], ["outro", "Outro"],
] as const;

const rotuloTipo = (t: string) => TIPOS.find(([v]) => v === t)?.[1] ?? t;
const data = (d: string) => new Date(d).toLocaleDateString("pt-BR");

/**
 * Documentos do imóvel. `podeConferir` (equipe Arini) mostra o botão de
 * conferência — aprovar e publicar exigem a matrícula conferida.
 *
 * Histórico de versões (5.8): reenviar um documento do mesmo tipo (menos
 * "Outro") cria a versão seguinte; a anterior não é apagada e aparece em
 * "Versões anteriores". A conferência vale para a versão vigente — versão
 * nova precisa ser conferida de novo.
 */
export default function DocumentosImovel({ propertyId, podeConferir = false }: { propertyId: string; podeConferir?: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [anteriores, setAnteriores] = useState<Doc[] | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [tipo, setTipo] = useState("matricula");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async (versoes: boolean) => {
    const res = await fetch(`/api/imoveis/${propertyId}/documentos${versoes ? "?versoes=1" : ""}`);
    if (!res.ok) return;
    const d = await res.json();
    setDocs(d.documentos ?? []);
    setAnteriores(versoes ? d.anteriores ?? [] : null);
  }, [propertyId]);

  useEffect(() => { carregar(verAnteriores); }, [carregar, verAnteriores]);

  const jaTem = docs.some((d) => d.tipo === tipo) && tipo !== "outro";
  const temHistorico = docs.some((d) => (d.versao ?? 1) > 1);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select className="rounded-lg cartao px-3 py-2 text-sm"
          value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className={`rounded-lg px-4 py-2 text-sm font-medium cursor-pointer ${ocupado ? "bg-superficie-2 text-texto-2" : "bg-verde text-white hover:bg-verde-escuro"}`}>
          {ocupado ? "Enviando…" : jaTem ? "Enviar nova versão" : "Anexar arquivo"}
          <input type="file" className="hidden" disabled={ocupado} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setOcupado(true);
            setMsg("");
            const fd = new FormData();
            fd.set("arquivo", f);
            fd.set("tipo", tipo);
            const res = await fetch(`/api/imoveis/${propertyId}/documentos`, { method: "POST", body: fd });
            setOcupado(false);
            if (res.ok) {
              const r = await res.json().catch(() => ({}));
              setMsg(r.versao > 1
                ? `Versão ${r.versao} anexada. A anterior ficou guardada em “Versões anteriores”${podeConferir ? "" : " e a nova aguarda conferência da Arini"}.`
                : "Documento anexado.");
              carregar(verAnteriores);
            }
            else setMsg((await res.json().catch(() => ({}))).error ?? "Falha no envio.");
          }} />
        </label>
        {jaTem && <span className="text-xs text-texto-2">Já existe {rotuloTipo(tipo).toLowerCase()}: o envio vira a próxima versão.</span>}
      </div>
      {msg && <p className="text-xs text-verde">{msg}</p>}
      <ul className="divide-y divide-linha text-sm">
        {docs.map((d) => (
          <li key={d.id} className="py-2 flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-40">
              <span className="block">
                {rotuloTipo(d.tipo)}
                {(d.versao ?? 1) > 1 && (
                  <span className="ml-2 text-[11px] rounded-full border border-linha px-2 py-0.5 text-texto-2">versão {d.versao}</span>
                )}
              </span>
              {d.nome_arquivo && <span className="block text-xs text-texto-2 truncate">{d.nome_arquivo}</span>}
            </span>
            <span className="text-xs text-texto-2">{data(d.created_at)}</span>
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
                  if (res.ok) carregar(verAnteriores); else setMsg((await res.json()).error ?? "Falha ao conferir.");
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

      {(temHistorico || verAnteriores) && (
        <div className="space-y-2">
          <button type="button" onClick={() => setVerAnteriores(!verAnteriores)}
            className="text-xs text-verde hover:underline">
            {verAnteriores ? "Ocultar versões anteriores" : "Ver versões anteriores"}
          </button>
          {verAnteriores && (
            <ul className="divide-y divide-linha text-sm rounded-xl border border-linha bg-superficie-2 px-3">
              {(anteriores ?? []).map((d) => (
                <li key={d.id} className="py-2 flex items-center gap-3 flex-wrap text-texto-2">
                  <span className="flex-1 min-w-40">
                    <span className="block text-texto">
                      {rotuloTipo(d.tipo)} <span className="text-[11px]">· versão {d.versao ?? 1}</span>
                    </span>
                    <span className="block text-xs truncate">
                      {d.nome_arquivo ?? "arquivo"} · enviada em {data(d.created_at)}
                      {d.substituido_em && ` · substituída em ${data(d.substituido_em)}`}
                      {d.enviado_por_nome && ` · por ${d.enviado_por_nome}`}
                      {d.verificado && " · tinha sido conferida"}
                    </span>
                  </span>
                  {d.url && <a href={d.url} target="_blank" className="text-xs text-verde hover:underline">abrir</a>}
                </li>
              ))}
              {anteriores && !anteriores.length && <li className="py-2 text-xs">Nenhuma versão anterior.</li>}
              {!anteriores && <li className="py-2 text-xs">Carregando…</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
