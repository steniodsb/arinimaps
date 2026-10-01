"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde";

export default function Atendimento({
  id, situacao, prioridade, responsavel, equipe, semConta,
}: {
  id: string; situacao: string; prioridade: string; responsavel: string;
  equipe: { user_id: string; nome: string }[]; semConta: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(body: Record<string, unknown>) {
    setOcupado(true); setErro("");
    const res = await fetch("/api/admin/suporte", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }),
    });
    setOcupado(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar."); return false; }
    router.refresh();
    return true;
  }

  return (
    <div className="cartao p-5 space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-texto-2">Situação</span>
          <select className={input} value={situacao} disabled={ocupado} onChange={(e) => salvar({ status: e.target.value })}>
            <option value="aberto">Aberto</option>
            <option value="em_atendimento">Em atendimento</option>
            <option value="aguardando_cliente">Aguardando cliente</option>
            <option value="resolvido">Resolvido</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-texto-2">Responsável</span>
          <select className={input} value={responsavel} disabled={ocupado} onChange={(e) => salvar({ responsavel: e.target.value })}>
            <option value="">Sem responsável</option>
            {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome || "—"}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-texto-2">Prioridade</span>
          <select className={input} value={prioridade} disabled={ocupado} onChange={(e) => salvar({ prioridade: e.target.value })}>
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
          </select>
        </label>
      </div>

      <form className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await salvar({ mensagem: texto, interno })) setTexto("");
        }}>
        <textarea required rows={4} className={input + " w-full"} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={interno ? "Nota para a equipe — o cliente não vê" : "Resposta ao cliente"} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-texto-2">
            <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
            Nota interna (não enviar ao cliente)
          </label>
          <button disabled={ocupado} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">
            {interno ? "Salvar nota" : "Responder"}
          </button>
        </div>
        {!interno && (
          <p className="text-xs text-texto-2">
            A resposta vai por e-mail{semConta ? " (este visitante não tem conta, então o e-mail é o único canal)" : " e aparece em Meus chamados"}.
            Sem o serviço de e-mail configurado, ela fica só registrada aqui.
          </p>
        )}
        {erro && <p className="text-sm text-critico">{erro}</p>}
      </form>
    </div>
  );
}
