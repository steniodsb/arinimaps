"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SETORES } from "@/lib/setores";
import { SENHA_MIN } from "@/lib/seguranca/senha";

type Membro = { user_id: string; nome: string; role: string; ativo: boolean; email: string; setores: string[] };

// a diretoria entra em todos os setores; para os demais, escolhe-se aqui
const ESCOLHIVEIS = SETORES.filter((s) => s.id !== "diretoria");

export default function GestaoUsuarios({
  equipe, souEu, ehDiretoria,
}: { equipe: Membro[]; souEu: string; ehDiretoria: boolean }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nome: "", email: "", senha: "", role: "analista_arini", setores: ["operacoes"] as string[] });

  const input = "w-full rounded-lg cartao px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde transition";

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
        <h2 className="font-semibold text-texto">Equipe Arini ({equipe.length})</h2>
        {ehDiretoria && (
          <button onClick={() => setCriando(!criando)}
            className="rounded-lg btn-contorno px-4 py-2 text-sm font-medium hover:bg-superficie-2 transition">
            {criando ? "Cancelar" : "+ Novo acesso"}
          </button>
        )}
      </div>

      {criando && (
        <div className="cartao p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nome completo"
              value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <input className={input} type="email" placeholder="E-mail de acesso"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={input} type="password" placeholder={`Senha provisória (mínimo ${SENHA_MIN} caracteres, letras e números)`}
              value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="analista_arini">Equipe — entra só nos setores marcados abaixo</option>
              <option value="admin_central">Diretoria — entra em todos os setores</option>
            </select>
          </div>
          {form.role === "analista_arini" && (
            <div className="flex flex-wrap gap-2">
              {ESCOLHIVEIS.map((s) => {
                const marcado = form.setores.includes(s.id);
                return (
                  <label key={s.id}
                    className={"rounded-full border px-3 py-1 text-xs cursor-pointer transition " +
                      (marcado ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2")}>
                    <input type="checkbox" className="hidden" checked={marcado}
                      onChange={() => setForm({ ...form, setores: marcado ? form.setores.filter((x) => x !== s.id) : [...form.setores, s.id] })} />
                    {s.nome}
                  </label>
                );
              })}
            </div>
          )}
          <button disabled={ocupado} className="btn-ouro px-6 py-2.5 disabled:opacity-50"
            onClick={async () => {
              if (await chamar("POST", form)) {
                setMsg(`Acesso criado para ${form.email}.`);
                setForm({ nome: "", email: "", senha: "", role: "analista_arini", setores: ["operacoes"] });
                setCriando(false);
              }
            }}>
            Criar acesso
          </button>
        </div>
      )}

      {erro && <p className="text-sm text-critico">{erro}</p>}
      {msg && <p className="text-sm text-verde">{msg}</p>}

      <div className="cartao divide-y divide-linha">
        {equipe.map((m) => (
          <div key={m.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
            <div className="flex-1 min-w-44">
              <p className="font-medium">
                {m.nome || "—"}
                {m.user_id === souEu && <span className="ml-2 text-xs text-texto-2">(você)</span>}
              </p>
              <p className="text-xs text-texto-2">{m.email}</p>
              {m.role === "admin_central" ? (
                <p className="text-xs text-texto-2 mt-1.5">Todos os setores</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ESCOLHIVEIS.map((s) => {
                    const marcado = m.setores.includes(s.id);
                    return ehDiretoria ? (
                      <button key={s.id} type="button" disabled={ocupado}
                        onClick={() => chamar("PATCH", {
                          user_id: m.user_id,
                          setores: marcado ? m.setores.filter((x) => x !== s.id) : [...m.setores, s.id],
                        })}
                        className={"rounded-full border px-2.5 py-0.5 text-[11px] transition " +
                          (marcado ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2 hover:text-texto")}>
                        {s.nome}
                      </button>
                    ) : marcado ? (
                      <span key={s.id} className="rounded-full border border-verde bg-verde/10 text-verde px-2.5 py-0.5 text-[11px]">{s.nome}</span>
                    ) : null;
                  })}
                  {!m.setores.length && !ehDiretoria && <span className="text-xs text-alerta">sem setor</span>}
                </div>
              )}
            </div>
            {ehDiretoria && m.user_id !== souEu ? (
              <select value={m.role} disabled={ocupado}
                onChange={(e) => chamar("PATCH", { user_id: m.user_id, role: e.target.value })}
                className="rounded-lg border border-linha px-3 py-1.5 text-xs">
                <option value="analista_arini">Equipe</option>
                <option value="admin_central">Diretoria</option>
              </select>
            ) : (
              <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">
                {m.role === "admin_central" ? "Diretoria" : "Equipe"}
              </span>
            )}
            <span className={`text-xs rounded-full px-3 py-1 ${m.ativo ? "bg-verde/10 text-verde" : "bg-critico/10 text-critico"}`}>
              {m.ativo ? "ativo" : "desativado"}
            </span>
            {ehDiretoria && m.user_id !== souEu && (
              <button disabled={ocupado}
                onClick={() => chamar("PATCH", { user_id: m.user_id, ativo: !m.ativo })}
                className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2 transition">
                {m.ativo ? "Desativar" : "Reativar"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
