"use client";

import { useEffect, useRef } from "react";
import { useConversa, type MsgSuporte } from "@/components/suporte/useConversa";

const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Conversa do chamado na Central, ao vivo (10.2): novas mensagens a cada 5 s. */
export default function Conversa({ id, inicial, temConta }: { id: string; inicial: MsgSuporte[]; temConta: boolean }) {
  const { mensagens, extra } = useConversa<MsgSuporte, { cliente_online: boolean; status: string }>(
    `/api/admin/suporte/${id}`, inicial,
  );
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [mensagens.length]);

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-texto-2">
        <span className={"w-2 h-2 rounded-full " + (extra.cliente_online ? "bg-verde" : "bg-texto-2/40")} aria-hidden />
        {!temConta
          ? "Visitante sem conta: a resposta vai só por e-mail."
          : extra.cliente_online
            ? "Cliente com a conversa aberta agora — a resposta aparece para ele na hora (sem e-mail)."
            : "Cliente fora da página — a resposta também vai por e-mail."}
      </p>
      {mensagens.map((m) => (
        <div key={m.id}
          className={"rounded-2xl border p-5 " +
            (m.interno ? "border-alerta/40 bg-alerta/10" : m.da_equipe ? "border-verde/30 bg-verde/5 ml-6 md:ml-12" : "border-linha bg-superficie mr-6 md:mr-12")}>
          <p className="text-sm text-texto-2 mb-1.5">
            <span className="font-semibold text-texto">{m.autor_nome}</span>{m.da_equipe && " · equipe"}{m.interno && " · nota interna (o cliente não vê)"} · {quando(m.created_at)}
          </p>
          <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-texto">{m.corpo}</p>
        </div>
      ))}
      <div ref={fim} />
    </div>
  );
}
