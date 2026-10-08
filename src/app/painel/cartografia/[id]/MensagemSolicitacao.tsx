"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { ARQUIVOS_ACEITOS, STATUS_SOLICITACAO_LABEL, tamanhoLegivel, type StatusSolicitacao } from "@/lib/cartografia/solicitacoes";
import { MessagesSquare, Send } from "lucide-react";
import { CAMPO } from "@/components/ui/Pagina";

const input = CAMPO;

/** O solicitante conversa com a cartografia: mensagem, anexos pedidos e cancelamento. */
export default function MensagemSolicitacao({
  id, status, podeAnexar, podeCancelar, encerrada,
}: { id: string; status: StatusSolicitacao; podeAnexar: boolean; podeCancelar: boolean; encerrada: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [aviso, setAviso] = useState("");

  function mostrarErro(e: ErroApi) { setErro(e); setAviso(""); }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setAviso("");
    const grande = arquivos.find((f) => f.size > ARQUIVOS_ACEITOS.maxBytes);
    if (grande) {
      mostrarErro({ status: 0, codigo: "arquivo_grande", mensagem: `O arquivo ${grande.name} passa de ${ARQUIVOS_ACEITOS.maxMB} MB.` });
      return;
    }
    setOcupado(true);
    const fd = new FormData();
    fd.set("mensagem", texto);
    for (const f of arquivos) fd.append("arquivos", f);
    let res: Response;
    try {
      res = await fetch(`/api/cartografia/solicitacoes/${id}/mensagem`, { method: "POST", body: fd });
    } catch {
      setOcupado(false);
      mostrarErro({ status: 0, codigo: "sem_resposta", mensagem: "O servidor não respondeu.", solucao: "Confira a internet e tente de novo." });
      return;
    }
    const corpo = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) {
      mostrarErro({ status: res.status, codigo: String(corpo.codigo ?? ""), mensagem: corpo.error ?? "Não foi possível enviar.", motivo: corpo.motivo, solucao: corpo.solucao });
      return;
    }
    setTexto(""); setArquivos([]);
    setAviso(corpo.arquivos_falharam?.length ? `Enviado, mas não conseguimos salvar: ${corpo.arquivos_falharam.join(", ")}.` : "Mensagem enviada.");
    router.refresh();
  }

  async function cancelar() {
    if (!confirm("Cancelar esta solicitação? A equipe deixa de analisá-la e ela não pode ser reaberta.")) return;
    setOcupado(true); setErro(null);
    const r = await enviarJson(`/api/cartografia/solicitacoes/${id}/mensagem`, "POST", { acao: "cancelar", mensagem: texto });
    setOcupado(false);
    if (!r.ok) { mostrarErro(r.erro); return; }
    router.refresh();
  }

  if (encerrada) {
    return (
      <p className="rounded-xl bg-superficie-2 px-5 py-4 text-base text-texto-2">
        Solicitação {STATUS_SOLICITACAO_LABEL[status].toLowerCase()}. Se o problema continuar, abra uma nova solicitação.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-5 p-5 md:p-7">
      <h2 className="lp-display flex items-center gap-3 text-xl md:text-2xl text-texto">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde"><MessagesSquare className="size-5" /></span>
        Falar com a cartografia
      </h2>
      <textarea rows={3} className={input} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder={podeAnexar ? "Explique o que está enviando" : "Mensagem para a equipe"} />
      {podeAnexar && (
        <div>
          <input type="file" multiple accept={ARQUIVOS_ACEITOS.accept} className={input}
            onChange={(e) => { setArquivos((a) => [...a, ...Array.from(e.target.files ?? [])].slice(0, ARQUIVOS_ACEITOS.maxQuantidade)); e.target.value = ""; }} />
          <p className="mt-1.5 text-sm text-texto-2">{ARQUIVOS_ACEITOS.descricao}</p>
          {arquivos.length > 0 && (
            <ul className="mt-3 divide-y divide-linha rounded-xl border border-linha text-sm">
              {arquivos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex justify-between gap-3 px-4 py-2.5">
                  <span className="truncate text-texto">{f.name} <span className="text-texto-2">· {tamanhoLegivel(f.size)}</span></span>
                  <button type="button" className="shrink-0 font-semibold text-critico hover:underline" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}>remover</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {erro && (
        <div className="space-y-0.5 rounded-xl border border-critico/30 bg-critico/10 px-4 py-3 text-sm">
          <p className="font-semibold text-critico">{erro.mensagem}</p>
          {erro.motivo && <p className="text-texto-2">{erro.motivo}</p>}
          {erro.solucao && <p className="text-texto">{erro.solucao}</p>}
        </div>
      )}
      {aviso && <p className="text-sm font-semibold text-verde">{aviso}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button disabled={ocupado || (texto.trim().length < 2 && !arquivos.length)} className="btn-verde inline-flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-60">
          <Send className="size-4" />
          {ocupado ? "Enviando…" : podeAnexar && arquivos.length ? "Enviar documentação" : "Enviar mensagem"}
        </button>
        {podeCancelar && (
          <button type="button" disabled={ocupado} onClick={cancelar} className="text-sm font-semibold text-critico hover:underline disabled:opacity-60">
            Cancelar solicitação
          </button>
        )}
      </div>
    </form>
  );
}
