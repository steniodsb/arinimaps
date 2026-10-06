"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { STATUS_SOLICITACAO_LABEL, TRANSICOES, type StatusSolicitacao } from "@/lib/cartografia/solicitacoes";

const input = "w-full rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde";
const COR_BOTAO: Partial<Record<StatusSolicitacao, string>> = {
  rejeitada: "border-critico/50 text-critico hover:bg-critico/10",
  cancelada: "border-critico/50 text-critico hover:bg-critico/10",
  aprovada: "border-verde text-verde hover:bg-verde/10",
  publicada: "bg-verde text-white border-verde hover:bg-verde-escuro",
};

/**
 * Painel de ações da solicitação. Os botões de status seguem TRANSICOES
 * (espelho do trigger do banco); o banco recusa qualquer outro caminho.
 */
export default function AcoesSolicitacao({
  id, protocolo, status, responsavel, equipe, imovel, temGeometria, resposta,
}: {
  id: string; protocolo: string; status: StatusSolicitacao; responsavel: string;
  equipe: { user_id: string; nome: string }[];
  imovel: { id: string; codigo: string } | null;
  temGeometria: boolean; resposta: string;
}) {
  const router = useRouter();
  const [mensagem, setMensagem] = useState("");
  const [interno, setInterno] = useState(false);
  const [devolutiva, setDevolutiva] = useState(resposta);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [aviso, setAviso] = useState("");

  async function agir(rotulo: string, corpo: Record<string, unknown>, depois?: () => void) {
    setOcupado(rotulo); setErro(null); setAviso("");
    const r = await enviarJson(`/api/admin/cartografia/solicitacoes/${id}`, "PATCH", corpo);
    setOcupado("");
    if (!r.ok) { setErro(r.erro); return false; }
    depois?.();
    router.refresh();
    return true;
  }

  const proximos = TRANSICOES[status];
  const podeAplicar = temGeometria && !!imovel;

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 self-start">
      <section className="cartao p-4 space-y-3">
        <h2 className="font-semibold text-texto text-sm">Mudar situação</h2>
        <textarea rows={3} className={input} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
          placeholder={interno ? "Nota para a equipe — o solicitante não vê" : "Mensagem registrada junto da mudança (o solicitante vê)"} />
        <label className="flex items-center gap-2 text-xs text-texto-2">
          <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
          Nota interna (não mostrar ao solicitante)
        </label>
        <div className="flex flex-wrap gap-2">
          {proximos.map((p) => (
            <button key={p} type="button" disabled={!!ocupado}
              onClick={() => agir(p, { acao: "status", status: p, mensagem, interno }, () => setMensagem(""))}
              className={"rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-60 " + (COR_BOTAO[p] ?? "border-linha text-texto hover:bg-superficie-2")}>
              {ocupado === p ? "…" : STATUS_SOLICITACAO_LABEL[p]}
            </button>
          ))}
          {!proximos.length && <p className="text-xs text-texto-2">Solicitação encerrada: não há mais transições.</p>}
          <button type="button" disabled={!!ocupado || mensagem.trim().length < 2}
            onClick={() => agir("nota", { acao: "nota", mensagem, interno }, () => setMensagem(""))}
            className="rounded-lg border border-dashed border-linha px-3 py-1.5 text-xs text-texto-2 hover:text-texto disabled:opacity-60">
            {ocupado === "nota" ? "…" : interno ? "Só registrar a nota" : "Só registrar a mensagem"}
          </button>
        </div>
        <p className="text-[11px] text-texto-2">
          Rejeitar, aprovar, publicar e pedir documentação avisam o solicitante por e-mail (com a mensagem, se não for interna).
        </p>
      </section>

      <section className="cartao p-4 space-y-2">
        <h2 className="font-semibold text-texto text-sm">Responsável</h2>
        <select className={input} value={responsavel} disabled={!!ocupado}
          onChange={(e) => agir("responsavel", { acao: "responsavel", user_id: e.target.value || null })}>
          <option value="">Sem responsável</option>
          {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome || "—"}</option>)}
        </select>
      </section>

      <section className="cartao p-4 space-y-2">
        <h2 className="font-semibold text-texto text-sm">Devolutiva ao solicitante</h2>
        <textarea rows={4} className={input} value={devolutiva} onChange={(e) => setDevolutiva(e.target.value)}
          placeholder="O que foi conferido, o que foi corrigido, o que falta. Vai por e-mail e fica na solicitação." />
        <button type="button" disabled={!!ocupado || devolutiva.trim().length < 2}
          onClick={() => agir("resposta", { acao: "resposta", resposta: devolutiva })}
          className="btn-verde px-4 py-2 text-xs disabled:opacity-60">
          {ocupado === "resposta" ? "Enviando…" : "Enviar devolutiva"}
        </button>
      </section>

      <section className="cartao p-4 space-y-2">
        <h2 className="font-semibold text-texto text-sm">Imóvel vinculado</h2>
        {imovel
          ? <p className="text-xs text-texto-2">Ligada a <span className="font-mono text-texto">{imovel.codigo}</span>. Informe outro código para trocar.</p>
          : <p className="text-xs text-texto-2">Nenhum. Vincule o imóvel cadastrado a que esta solicitação se refere.</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); agir("vincular", { acao: "vincular_imovel", codigo }, () => setCodigo("")); }}>
          <input className={input} placeholder="ARINI-MAP-000010" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button disabled={!!ocupado || !codigo.trim()} className="btn-contorno px-3 py-2 text-xs shrink-0 disabled:opacity-60">
            {ocupado === "vincular" ? "…" : "Vincular"}
          </button>
        </form>
      </section>

      <section className="cartao p-4 space-y-2">
        <h2 className="font-semibold text-texto text-sm">Aplicar geometria ao imóvel</h2>
        <p className="text-xs text-texto-2">
          {!temGeometria ? "A solicitação não tem área desenhada (só ponto ou anexos): vetorize na análise do imóvel."
            : !imovel ? "Vincule um imóvel antes de aplicar a área."
            : `Grava a área desenhada em ${protocolo} como a divisa de ${imovel.codigo}, numa nova versão validada pela Matriz.`}
        </p>
        <button type="button" disabled={!podeAplicar || !!ocupado}
          onClick={() => {
            if (!imovel) return;
            if (!confirm(
              `Aplicar a geometria da solicitação ${protocolo} ao imóvel ${imovel.codigo}?\n\n` +
              "Isso cria uma NOVA versão da divisa do imóvel, já marcada como validada pela Matriz, e substitui a geometria atual no mapa. " +
              "A versão anterior fica no histórico. Confira a área no mapa antes de confirmar."
            )) return;
            agir("aplicar", { acao: "aplicar_geometria", motivo: mensagem.trim() || undefined }, () => setAviso("Geometria aplicada e validada."));
          }}
          className="btn-ouro px-4 py-2 text-xs disabled:opacity-50">
          {ocupado === "aplicar" ? "Aplicando…" : "Aplicar geometria ao imóvel vinculado"}
        </button>
      </section>

      {aviso && <p className="text-sm text-verde">{aviso}</p>}
      {erro && (
        <div className="rounded-lg border border-critico/40 bg-critico/10 px-3 py-2 text-sm space-y-0.5">
          <p className="text-critico font-medium">{erro.mensagem}</p>
          {erro.motivo && <p className="text-texto-2 text-xs">{erro.motivo}</p>}
          {erro.solucao && <p className="text-texto text-xs">{erro.solucao}</p>}
        </div>
      )}
    </aside>
  );
}
