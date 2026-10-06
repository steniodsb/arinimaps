"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition";
const rotulo = "block text-sm font-medium text-texto mb-1";

const CATEGORIAS = [
  ["duvida", "Tenho uma dúvida"],
  ["problema", "Algo não está funcionando"],
  ["anuncio", "Sobre o meu anúncio"],
  ["financeiro", "Cobrança ou pagamento"],
  ["dados_pessoais", "Meus dados pessoais (LGPD)"],
  ["outro", "Outro assunto"],
] as const;

const LGPD = [
  ["acesso", "Quero saber quais dados meus vocês têm"],
  ["correcao", "Quero corrigir um dado"],
  ["exclusao", "Quero excluir meus dados"],
  ["portabilidade", "Quero levar meus dados para outro serviço"],
  ["revogacao", "Quero retirar meu consentimento"],
  ["informacao", "Quero saber com quem meus dados são compartilhados"],
] as const;

export default function FormSuporte({
  nome, email, logado, assuntoInicial = "",
}: { nome: string; email: string; logado: boolean; assuntoInicial?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    nome, email, telefone: "", categoria: "duvida", lgpd_tipo: "acesso", assunto: assuntoInicial, mensagem: "",
  });
  const [estado, setEstado] = useState<"" | "enviando">("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const lgpd = form.categoria === "dados_pessoais";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setOk(""); setEstado("enviando");
    const res = await fetch("/api/suporte", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setEstado("");
    if (!res.ok) { setErro(data.error ?? "Não foi possível enviar. Tente de novo."); return; }
    setOk(data.mensagem);
    setForm({ ...form, assunto: "", mensagem: "" });
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="cartao p-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="s-nome">Nome *</label>
          <input id="s-nome" required className={input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div>
          <label className={rotulo} htmlFor="s-email">E-mail para a resposta *</label>
          <input id="s-email" required type="email" className={input} value={form.email} readOnly={logado}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className={rotulo} htmlFor="s-tel">WhatsApp / telefone</label>
          <input id="s-tel" className={input} placeholder="(34) 90000-0000" value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        </div>
        <div>
          <label className={rotulo} htmlFor="s-cat">Assunto *</label>
          <select id="s-cat" className={input} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {lgpd ? (
        <div>
          <label className={rotulo} htmlFor="s-lgpd">O que você quer pedir *</label>
          <select id="s-lgpd" className={input} value={form.lgpd_tipo} onChange={(e) => setForm({ ...form, lgpd_tipo: e.target.value })}>
            {LGPD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <p className="text-xs text-texto-2 mt-1">
            Pedidos sobre dados pessoais vão para o encarregado de dados e são respondidos em até 15 dias.
            Podemos pedir uma confirmação de identidade antes de atender.
          </p>
        </div>
      ) : (
        <div>
          <label className={rotulo} htmlFor="s-ass">Resumo em uma linha *</label>
          <input id="s-ass" required={!lgpd} className={input} placeholder="Ex.: não consigo enviar as fotos do anúncio"
            value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} />
        </div>
      )}

      <div>
        <label className={rotulo} htmlFor="s-msg">Conte o que aconteceu *</label>
        <textarea id="s-msg" required rows={5} className={input}
          placeholder="Quanto mais detalhe, mais rápida a resposta: o que você tentou fazer, em que tela e o que apareceu."
          value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
      </div>

      {erro && <p className="text-sm text-critico">{erro}</p>}
      {ok && <p className="text-sm text-verde">{ok}</p>}
      <button disabled={estado === "enviando"} className="btn-verde px-6 py-3 disabled:opacity-60">
        {estado === "enviando" ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
