"use client";

import { useState } from "react";

const INPUT = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition";

export default function FormAcesso() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    const volta = new URLSearchParams(window.location.search).get("volta");
    const res = await fetch("/api/acesso", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha, volta }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOcupado(false);
      setErro(j.error ?? "Não foi possível entrar.");
      return;
    }
    // recarga completa: o cookie novo precisa ir no próximo pedido ao servidor
    window.location.href = j.volta ?? "/";
  }

  return (
    <form onSubmit={entrar} className="w-full max-w-sm cartao p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-texto">Acesso restrito</h1>
        <p className="text-sm text-texto-2">
          O Arini Imóveis Brasil está em fase de testes. Digite a senha de acesso para continuar.
        </p>
      </div>
      <input type="password" autoFocus required autoComplete="current-password"
        aria-label="Senha de acesso" placeholder="Senha de acesso" className={INPUT}
        value={senha} onChange={(e) => setSenha(e.target.value)} />
      {erro && <p className="text-sm text-critico" role="alert">{erro}</p>}
      <button type="submit" disabled={ocupado} className="btn-verde w-full text-center">
        {ocupado ? "Conferindo…" : "Entrar"}
      </button>
    </form>
  );
}
