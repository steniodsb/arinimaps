"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Membro = { user_id: string; nome: string; role: string; ativo: boolean; email: string };

export default function GestaoUsuarios({
  equipe, souEu, ehDiretoria,
}: { equipe: Membro[]; souEu: string; ehDiretoria: boolean }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nome: "", email: "", senha: "", role: "analista_arini" });

  const input = "w-full rounded-lg border border-linha bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde transition";

  async function chamar(method: "POST" | "PATCH", body: unknown) {
    setOcupado(true); setErro(""); setMsg("");
    const res = await fetch("/api/admin/usuarios", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) { setErro(data.error ?? "Falha na operação."); return false; }
    router.refresh();
    return true;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-verde-escuro">Equipe Arini ({equipe.length})</h2>
        {ehDiretoria && (
          <button onClick={() => setCriando(!criando)}
            className="rounded-lg border border-linha px-4 py-2 text-sm font-medium hover:bg-areia transition">
            {criando ? "Cancelar" : "+ Novo acesso"}
          </button>
        )}
      </div>

      {criando && (
        <div className="rounded-2xl border border-linha bg-white p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nome completo"
              value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <input className={input} type="email" placeholder="E-mail de acesso"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} type="password" placeholder="Senha (mínimo 8 caracteres)"
              value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="analista_arini">Analista — opera imóveis, funil e visitas</option>
              <option value="admin_central">Diretoria — acesso total, comissões e configurações</option>
            </select>
          </div>
          <button disabled={ocupado} className="btn-ouro px-6 py-2.5 disabled:opacity-50"
            onClick={async () => {
              if (await chamar("POST", form)) {
                setMsg(`Acesso criado para ${form.email}.`);
                setForm({ nome: "", email: "", senha: "", role: "analista_arini" });
                setCriando(false);
              }
            }}>
            Criar acesso
          </button>
        </div>
      )}

      {erro && <p className="text-sm text-red-700">{erro}</p>}
      {msg && <p className="text-sm text-verde">{msg}</p>}

      <div className="rounded-2xl border border-linha bg-white divide-y divide-linha">
        {equipe.map((m) => (
          <div key={m.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
            <div className="flex-1 min-w-44">
              <p className="font-medium">
                {m.nome || "—"}
                {m.user_id === souEu && <span className="ml-2 text-xs text-foreground/45">(você)</span>}
              </p>
              <p className="text-xs text-foreground/50">{m.email}</p>
            </div>
            {ehDiretoria && m.user_id !== souEu ? (
              <select value={m.role} disabled={ocupado}
                onChange={(e) => chamar("PATCH", { user_id: m.user_id, role: e.target.value })}
                className="rounded-lg border border-linha px-3 py-1.5 text-xs">
                <option value="analista_arini">Analista</option>
                <option value="admin_central">Diretoria</option>
              </select>
            ) : (
              <span className="text-xs rounded-full bg-areia px-3 py-1">
                {m.role === "admin_central" ? "Diretoria" : "Analista"}
              </span>
            )}
            <span className={`text-xs rounded-full px-3 py-1 ${m.ativo ? "bg-verde/10 text-verde" : "bg-red-50 text-red-700"}`}>
              {m.ativo ? "ativo" : "desativado"}
            </span>
            {ehDiretoria && m.user_id !== souEu && (
              <button disabled={ocupado}
                onClick={() => chamar("PATCH", { user_id: m.user_id, ativo: !m.ativo })}
                className="rounded-lg border border-linha px-3 py-1.5 text-xs hover:bg-areia transition">
                {m.ativo ? "Desativar" : "Reativar"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
