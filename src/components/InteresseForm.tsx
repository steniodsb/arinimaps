"use client";

import { useState } from "react";

export default function InteresseForm({
  codigo, titulo, whatsapp,
}: { codigo: string; titulo: string; whatsapp: string | null }) {
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
    if (res.ok) setEstado("ok");
    else {
      setEstado("erro");
      setErro(data.error ?? "Não foi possível enviar. Tente novamente.");
    }
  }

  const rotulo = "block text-sm font-medium text-verde-escuro mb-1";
  const input = "w-full rounded-lg border border-linha bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition";

  const linkWhats = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Olá! Tenho interesse no imóvel ${codigo} — ${titulo}.`
      )}`
    : null;

  return (
    <div className="space-y-3">
      {estado === "ok" ? (
        <div className="rounded-2xl bg-verde text-white p-6 text-center space-y-1">
          <p className="text-2xl">✓</p>
          <p className="text-lg font-semibold">Interesse registrado!</p>
          <p className="text-sm text-white/85">A equipe da Arini vai falar com você em breve.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="rounded-2xl border border-linha bg-white p-5 space-y-3 shadow-sm">
          <div>
            <p className="text-lg font-semibold text-verde-escuro">Receba todos os detalhes</p>
            <p className="text-sm text-foreground/60">
              Preencha seus dados e falaremos com você pelo WhatsApp.
            </p>
          </div>

          <div>
            <label className={rotulo} htmlFor="nome">Nome completo *</label>
            <input id="nome" required placeholder="Seu nome" className={input}
              value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label className={rotulo} htmlFor="tel">Telefone / WhatsApp *</label>
            <input id="tel" required placeholder="(00) 00000-0000" className={input} inputMode="tel"
              value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div>
            <label className={rotulo} htmlFor="email">E-mail</label>
            <input id="email" type="email" placeholder="seu@email.com" className={input}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className={rotulo} htmlFor="msg">Mensagem</label>
            <textarea id="msg" rows={2} placeholder="Quero agendar uma visita…" className={input}
              value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
          </div>

          <label className="flex items-start gap-2 text-xs text-foreground/70">
            <input type="checkbox" required checked={form.consentimento}
              onChange={(e) => setForm({ ...form, consentimento: e.target.checked })} className="mt-0.5" />
            Autorizo a Arini a entrar em contato sobre este imóvel (LGPD).
          </label>

          {erro && <p className="text-sm text-red-700">{erro}</p>}

          <button disabled={estado === "enviando"} className="btn-ouro w-full py-3 disabled:opacity-60">
            {estado === "enviando" ? "Enviando…" : "Quero saber mais"}
          </button>
        </form>
      )}

      {linkWhats && (
        <a href={linkWhats} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-2xl bg-[#25D366] text-white font-semibold py-3.5 hover:brightness-95 hover:-translate-y-0.5 transition shadow-sm">
          <span className="text-lg">💬</span> Chamar no WhatsApp
        </a>
      )}
    </div>
  );
}
