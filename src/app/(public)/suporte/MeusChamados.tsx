"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Chamado = {
  id: string; codigo: string; assunto: string; status: string; created_at: string; updated_at: string;
  mensagens: { id: string; autor_nome: string; da_equipe: boolean; corpo: string; created_at: string }[];
};

const SITUACAO: Record<string, string> = {
  aberto: "Recebido", em_atendimento: "Em atendimento", aguardando_cliente: "Aguardando você", resolvido: "Resolvido",
};
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function MeusChamados({ chamados }: { chamados: Chamado[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<string | null>(chamados.find((c) => c.status === "aguardando_cliente")?.id ?? null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function responder(id: string) {
    setOcupado(true); setErro("");
    const res = await fetch(`/api/suporte/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagem: texto }),
    });
    setOcupado(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível enviar."); return; }
    setTexto("");
    router.refresh();
  }

  if (!chamados.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-texto text-lg">Meus chamados</h2>
      <div className="cartao divide-y divide-linha">
        {chamados.map((c) => (
          <div key={c.id} className="px-4 py-3 text-sm">
            <button className="w-full flex items-center gap-3 flex-wrap text-left" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
              <span className="font-mono text-xs text-texto-2">{c.codigo}</span>
              <span className="flex-1 min-w-40 text-texto">{c.assunto}</span>
              <span className={"text-xs rounded-full px-3 py-1 " +
                (c.status === "aguardando_cliente" ? "bg-ouro/15 text-ouro" : c.status === "resolvido" ? "bg-verde/10 text-verde" : "bg-superficie-2 text-texto-2")}>
                {SITUACAO[c.status]}
              </span>
            </button>

            {aberto === c.id && (
              <div className="mt-3 space-y-3 border-t border-linha pt-3">
                {c.mensagens.map((m) => (
                  <div key={m.id} className={"rounded-xl border p-3 " + (m.da_equipe ? "border-verde/30 bg-verde/5 mr-6" : "border-linha bg-superficie-2 ml-6")}>
                    <p className="text-xs text-texto-2 mb-1">{m.da_equipe ? `${m.autor_nome} · equipe Arini` : "Você"} · {quando(m.created_at)}</p>
                    <p className="whitespace-pre-wrap text-texto">{m.corpo}</p>
                  </div>
                ))}
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); responder(c.id); }}>
                  <textarea required rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
                    placeholder={c.status === "resolvido" ? "Escreva para reabrir o chamado" : "Sua resposta"}
                    className="w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde" />
                  {erro && <p className="text-sm text-critico">{erro}</p>}
                  <button disabled={ocupado} className="btn-contorno px-4 py-2 text-sm disabled:opacity-60">Enviar resposta</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
