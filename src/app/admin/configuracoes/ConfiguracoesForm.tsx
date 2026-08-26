"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GRUPOS, type Campo } from "@/lib/configuracoes";

export default function ConfiguracoesForm({
  inicial, ehDiretoria,
}: { inicial: Record<string, unknown>; ehDiretoria: boolean }) {
  const router = useRouter();
  const [aba, setAba] = useState(GRUPOS[0].id);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(inicial).map(([k, v]) => [k, Array.isArray(v) ? v.join("\n") : String(v ?? "")])
    )
  );
  const [sujo, setSujo] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const grupo = GRUPOS.find((g) => g.id === aba)!;
  const alterar = (chave: string, v: string) => {
    setValores((s) => ({ ...s, [chave]: v }));
    setSujo((s) => new Set(s).add(chave));
    setMsg(""); setErro("");
  };

  async function salvar() {
    setSalvando(true); setMsg(""); setErro("");
    const corpo = Object.fromEntries([...sujo].map((k) => [k, valores[k]]));
    const res = await fetch("/api/admin/configuracoes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    const data = await res.json().catch(() => ({}));
    setSalvando(false);
    if (res.ok) {
      setMsg(`${data.salvos} configuração(ões) salva(s). As mudanças já valem no site.`);
      setSujo(new Set());
      router.refresh();
    } else setErro(data.error ?? "Falha ao salvar.");
  }

  const inputBase = "w-full rounded-lg border border-linha bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition disabled:bg-areia disabled:text-foreground/50";

  function renderCampo(c: Campo) {
    const bloqueado = c.somenteDiretoria && !ehDiretoria;
    const v = valores[c.chave] ?? "";
    return (
      <div key={c.chave} className={c.tipo === "textarea" || c.tipo === "lista" ? "sm:col-span-2" : ""}>
        <label className="block text-sm font-medium text-verde-escuro mb-1" htmlFor={c.chave}>
          {c.rotulo}
          {c.somenteDiretoria && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-ouro-escuro">diretoria</span>
          )}
        </label>
        <div className="relative">
          {c.tipo === "textarea" || c.tipo === "lista" ? (
            <textarea id={c.chave} rows={c.tipo === "lista" ? 7 : 3} className={inputBase}
              value={v} disabled={bloqueado} onChange={(e) => alterar(c.chave, e.target.value)} />
          ) : (
            <input id={c.chave} className={inputBase + (c.sufixo ? " pr-14" : "")}
              inputMode={["numero", "dinheiro", "percentual", "coordenada"].includes(c.tipo) ? "decimal" : undefined}
              value={v} disabled={bloqueado} onChange={(e) => alterar(c.chave, e.target.value)} />
          )}
          {c.sufixo && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/45">{c.sufixo}</span>
          )}
        </div>
        {c.ajuda && <p className="text-xs text-foreground/50 mt-1">{c.ajuda}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {GRUPOS.map((g) => (
          <button key={g.id} onClick={() => setAba(g.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium border transition flex items-center gap-2
              ${aba === g.id ? "bg-verde text-white border-verde shadow-sm" : "border-linha bg-white hover:bg-areia"}`}>
            <span>{g.icone}</span> {g.titulo}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-linha bg-white p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-verde-escuro text-lg">{grupo.titulo}</h2>
          <p className="text-sm text-foreground/60">{grupo.descricao}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {grupo.campos.map(renderCampo)}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap sticky bottom-4">
        <button onClick={salvar} disabled={salvando || !sujo.size}
          className="btn-ouro px-7 py-3 disabled:opacity-45">
          {salvando ? "Salvando…" : sujo.size ? `Salvar ${sujo.size} alteração(ões)` : "Nada alterado"}
        </button>
        {msg && <span className="text-sm text-verde font-medium">{msg}</span>}
        {erro && <span className="text-sm text-red-700">{erro}</span>}
      </div>
    </div>
  );
}
