"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Pedido = {
  id: string; codigo: string; nome: string; email: string; cpf: string | null; tipo: string;
  descricao: string | null; status: string; resposta: string | null; prazo: string;
  atendido_em: string | null; created_at: string;
};

const TIPO: Record<string, string> = {
  acesso: "Acesso aos dados", correcao: "Correção", exclusao: "Exclusão", portabilidade: "Portabilidade",
  revogacao: "Revogação de consentimento", informacao: "Informação sobre o tratamento", outro: "Outro",
};
const STATUS: Record<string, string> = { recebido: "Recebido", em_analise: "Em análise", atendido: "Atendido", negado: "Negado" };
const input = "w-full rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde";

export default function PedidosLgpd({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", cpf: "", tipo: "acesso", descricao: "" });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const hoje = new Date().toISOString().slice(0, 10);

  async function chamar(method: "POST" | "PATCH", body: unknown) {
    setOcupado(true); setErro("");
    const res = await fetch("/api/admin/lgpd", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setOcupado(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar."); return false; }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setNovo(!novo)} className="btn-contorno px-4 py-2 text-sm">
        {novo ? "Cancelar" : "+ Registrar pedido recebido por outro canal"}
      </button>

      {novo && (
        <form className="cartao p-5 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await chamar("POST", form)) { setNovo(false); setForm({ nome: "", email: "", cpf: "", tipo: "acesso", descricao: "" }); }
          }}>
          <input required className={input} placeholder="Nome do titular" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <input required type="email" className={input} placeholder="E-mail para resposta" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={input} placeholder="CPF (opcional)" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          <select className={input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {Object.entries(TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <textarea rows={3} className={input + " sm:col-span-2"} placeholder="O que foi pedido" value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <button disabled={ocupado} className="btn-verde px-5 py-2.5 text-sm sm:col-span-2 justify-self-start disabled:opacity-60">Registrar pedido</button>
        </form>
      )}
      {erro && <p className="text-sm text-critico">{erro}</p>}

      <div className="cartao divide-y divide-linha">
        {pedidos.map((p) => {
          const emAberto = ["recebido", "em_analise"].includes(p.status);
          const atrasado = emAberto && p.prazo < hoje;
          return (
            <div key={p.id} className="px-4 py-3 text-sm">
              <button className="w-full flex items-center gap-3 flex-wrap text-left"
                onClick={() => { setAberto(aberto === p.id ? null : p.id); setResposta(p.resposta ?? ""); }}>
                <span className="font-mono text-xs text-texto-2">{p.codigo}</span>
                <span className="flex-1 min-w-48 text-texto">{TIPO[p.tipo] ?? p.tipo}<span className="text-xs text-texto-2"> · {p.nome}</span></span>
                <span className={"text-xs rounded-full px-3 py-1 " + (emAberto ? "bg-ouro/15 text-ouro" : "bg-superficie-2 text-texto-2")}>{STATUS[p.status]}</span>
                <span className={"text-xs tabular-nums " + (atrasado ? "text-critico" : "text-texto-2")}>
                  {emAberto ? `prazo ${new Date(p.prazo + "T12:00:00").toLocaleDateString("pt-BR")}` : `encerrado em ${p.atendido_em ? new Date(p.atendido_em).toLocaleDateString("pt-BR") : "—"}`}
                </span>
              </button>

              {aberto === p.id && (
                <div className="mt-3 space-y-3 border-t border-linha pt-3">
                  <p className="text-xs text-texto-2">
                    {p.email}{p.cpf && ` · CPF ${p.cpf}`} · recebido em {new Date(p.created_at).toLocaleString("pt-BR")}
                  </p>
                  {p.descricao && <p className="whitespace-pre-wrap text-texto-2">{p.descricao}</p>}
                  <textarea rows={4} className={input} placeholder="Resposta ao titular (obrigatória para encerrar; é enviada por e-mail)"
                    value={resposta} onChange={(e) => setResposta(e.target.value)} disabled={!emAberto} />
                  {emAberto && (
                    <div className="flex flex-wrap gap-2">
                      {p.status === "recebido" && (
                        <button disabled={ocupado} onClick={() => chamar("PATCH", { id: p.id, status: "em_analise", resposta })}
                          className="btn-contorno px-4 py-2 text-xs">Marcar em análise</button>
                      )}
                      <button disabled={ocupado} onClick={() => chamar("PATCH", { id: p.id, status: "atendido", resposta })}
                        className="btn-verde px-4 py-2 text-xs disabled:opacity-60">Atender e responder</button>
                      <button disabled={ocupado} onClick={() => chamar("PATCH", { id: p.id, status: "negado", resposta })}
                        className="rounded-lg border border-critico/50 text-critico px-4 py-2 text-xs">Negar com justificativa</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!pedidos.length && <p className="px-4 py-8 text-center text-sm text-texto-2">Nenhum pedido de titular até agora.</p>}
      </div>
    </div>
  );
}
