"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { ARQUIVOS_ACEITOS, STATUS_SOLICITACAO_LABEL, tamanhoLegivel, type StatusSolicitacao } from "@/lib/cartografia/solicitacoes";

const input = "w-full rounded-lg cartao px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";

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
      <p className="text-sm text-texto-2">
        Solicitação {STATUS_SOLICITACAO_LABEL[status].toLowerCase()}. Se o problema continuar, abra uma nova solicitação.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao p-5 space-y-3">
      <h2 className="font-semibold text-texto">Falar com a cartografia</h2>
      <textarea rows={3} className={input} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder={podeAnexar ? "Explique o que está enviando" : "Mensagem para a equipe"} />
      {podeAnexar && (
        <div>
          <input type="file" multiple accept={ARQUIVOS_ACEITOS.accept} className={input}
            onChange={(e) => { setArquivos((a) => [...a, ...Array.from(e.target.files ?? [])].slice(0, ARQUIVOS_ACEITOS.maxQuantidade)); e.target.value = ""; }} />
          <p className="text-xs text-texto-2 mt-1">{ARQUIVOS_ACEITOS.descricao}</p>
          {arquivos.length > 0 && (
            <ul className="mt-1 text-xs space-y-0.5">
              {arquivos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                  <span className="truncate text-texto">{f.name} <span className="text-texto-2">· {tamanhoLegivel(f.size)}</span></span>
                  <button type="button" className="text-critico hover:underline" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}>remover</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {erro && (
        <div className="text-sm space-y-0.5">
          <p className="text-critico">{erro.mensagem}</p>
          {erro.motivo && <p className="text-texto-2 text-xs">{erro.motivo}</p>}
          {erro.solucao && <p className="text-texto text-xs">{erro.solucao}</p>}
        </div>
      )}
      {aviso && <p className="text-sm text-verde">{aviso}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button disabled={ocupado || (texto.trim().length < 2 && !arquivos.length)} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">
          {ocupado ? "Enviando…" : podeAnexar && arquivos.length ? "Enviar documentação" : "Enviar mensagem"}
        </button>
        {podeCancelar && (
          <button type="button" disabled={ocupado} onClick={cancelar} className="text-sm text-critico hover:underline disabled:opacity-60">
            Cancelar solicitação
          </button>
        )}
      </div>
    </form>
  );
}
