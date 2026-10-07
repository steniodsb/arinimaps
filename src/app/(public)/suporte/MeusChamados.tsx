"use client";

import { useEffect, useRef, useState } from "react";
import { useConversa, type MsgSuporte } from "@/components/suporte/useConversa";

export type Chamado = {
  id: string; codigo: string; assunto: string; status: string; created_at: string; updated_at: string;
  mensagens: MsgSuporte[];
};

const SITUACAO: Record<string, string> = {
  aberto: "Recebido", em_atendimento: "Em atendimento", aguardando_cliente: "Aguardando você", resolvido: "Resolvido",
};
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const corSituacao = (s: string) =>
  s === "aguardando_cliente" ? "bg-ouro/15 text-ouro" : s === "resolvido" ? "bg-verde/10 text-verde" : "bg-superficie-2 text-texto-2";

export default function MeusChamados({ chamados }: { chamados: Chamado[] }) {
  const [aberto, setAberto] = useState<string | null>(chamados.find((c) => c.status === "aguardando_cliente")?.id ?? null);

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
              <span className={"text-xs rounded-full px-3 py-1 " + corSituacao(c.status)}>{SITUACAO[c.status]}</span>
            </button>
            {aberto === c.id && <Conversa chamado={c} />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Conversa ao vivo de um chamado: atualiza sozinha a cada 5 s enquanto aberta. */
function Conversa({ chamado }: { chamado: Chamado }) {
  const { mensagens, extra, adicionar } = useConversa<MsgSuporte, { status: string; atendente_online: boolean }>(
    `/api/suporte/${chamado.id}`, chamado.mensagens,
  );
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const status = extra.status ?? chamado.status;

  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [mensagens.length]);

  async function responder() {
    setOcupado(true); setErro("");
    const res = await fetch(`/api/suporte/${chamado.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagem: texto }),
    });
    setOcupado(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(d.error ?? "Não foi possível enviar."); return; }
    setTexto("");
    if (d.mensagem) adicionar([d.mensagem]);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-linha pt-3">
      <p className="flex items-center gap-2 text-xs text-texto-2">
        <span className={"w-2 h-2 rounded-full " + (extra.atendente_online ? "bg-verde" : "bg-texto-2/40")} aria-hidden />
        {extra.atendente_online === undefined
          ? "Conectando…"
          : extra.atendente_online
            ? "Atendente online — a resposta aparece aqui sem recarregar."
            : "Equipe fora agora — respondemos aqui e por e-mail assim que possível."}
        {status !== chamado.status && <span className={"ml-auto rounded-full px-2 py-0.5 " + corSituacao(status)}>{SITUACAO[status]}</span>}
      </p>
      <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
        {mensagens.map((m) => (
          <div key={m.id} className={"rounded-xl border p-3 " + (m.da_equipe ? "border-verde/30 bg-verde/5 mr-6" : "border-linha bg-superficie-2 ml-6")}>
            <p className="text-xs text-texto-2 mb-1">{m.da_equipe ? `${m.autor_nome} · equipe Arini` : "Você"} · {quando(m.created_at)}</p>
            <p className="whitespace-pre-wrap text-texto">{m.corpo}</p>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); responder(); }}>
        <textarea required rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra a linha
            if (e.key === "Enter" && !e.shiftKey && texto.trim().length >= 2 && !ocupado) { e.preventDefault(); responder(); }
          }}
          placeholder={status === "resolvido" ? "Escreva para reabrir o chamado" : "Sua mensagem (Enter envia, Shift+Enter quebra a linha)"}
          className="w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde" />
        {erro && <p className="text-sm text-critico">{erro}</p>}
        <button disabled={ocupado} className="btn-contorno px-4 py-2 text-sm disabled:opacity-60">{ocupado ? "Enviando…" : "Enviar"}</button>
      </form>
    </div>
  );
}
