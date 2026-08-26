"use client";

import { useState } from "react";

export default function InteresseForm({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "erro">("idle");
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", mensagem: "", consentimento: false });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro("");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, ...form }),
    });
    const data = await res.json();
    if (res.ok) {
      setEstado("ok");
    } else {
      setEstado("erro");
      setErro(data.error ?? "Não foi possível enviar. Tente novamente.");
    }
  }

  if (estado === "ok") {
    return (
      <div className="rounded-xl bg-verde text-white p-6 text-center space-y-1">
        <p className="text-lg font-semibold">Interesse registrado!</p>
        <p className="text-sm text-white/85">A equipe da Arini vai falar com você em breve.</p>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";

  return (
    <form onSubmit={enviar} className="rounded-xl border border-linha bg-white p-5 space-y-3">
      <p className="font-semibold text-verde-escuro">Tenho interesse</p>
      <input required placeholder="Seu nome" className={input}
        value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      <input placeholder="WhatsApp / telefone" className={input}
        value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
      <input type="email" placeholder="E-mail" className={input}
        value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <textarea rows={3} placeholder="Mensagem (opcional)" className={input}
        value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
      <label className="flex items-start gap-2 text-xs text-foreground/70">
        <input type="checkbox" required checked={form.consentimento}
          onChange={(e) => setForm({ ...form, consentimento: e.target.checked })} className="mt-0.5" />
        Autorizo a Arini a entrar em contato sobre este imóvel (LGPD).
      </label>
      {erro && <p className="text-sm text-red-700">{erro}</p>}
      <button
        disabled={estado === "enviando"}
        className="w-full rounded-lg bg-ouro text-verde-escuro font-semibold py-2.5 hover:bg-ouro-escuro hover:text-white disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando…" : "Enviar interesse"}
      </button>
    </form>
  );
}
