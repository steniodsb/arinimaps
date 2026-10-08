import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { dataHoraBR } from "@/components/admin/Painel";
import MiniMapa from "@/components/map/MiniMapa";
import {
  STATUS_CANCELAVEIS, STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL, tamanhoLegivel,
  type ArquivoSolicitacao, type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";
import { assinarArquivos, geojsonDaSolicitacao, resolverReferencia } from "@/lib/cartografia/servidor";
import MensagemSolicitacao from "./MensagemSolicitacao";
import { ArrowLeft, AlertTriangle, MessageSquareReply, FileText, Paperclip } from "lucide-react";
import { Etiqueta } from "@/components/ui/Pagina";
import { TOM_SOLICITACAO } from "@/components/painel/tons";

export default async function MinhaSolicitacao({ params }: PageProps<"/painel/cartografia/[id]">) {
  const { id } = await params;
  const supabase = await supabaseServer();
  // RLS: só o solicitante enxerga a linha — é essa consulta que confere a posse
  const { data: s } = await supabase
    .from("cartographic_requests")
    .select("id, protocolo, tipo, status, descricao, referencia, arquivos, resposta, area_m2, created_at, updated_at, municipality:municipalities(nome)")
    .eq("id", id).maybeSingle();
  if (!s) notFound();
  const status = s.status as StatusSolicitacao;
  const municipio = s.municipality as unknown as { nome: string } | null;

  const [{ data: eventos }, geo, arquivos, referencia] = await Promise.all([
    // RLS: só eventos não internos
    supabase.from("cartographic_request_events").select("id, de_status, para_status, mensagem, created_at")
      .eq("request_id", id).order("created_at"),
    geojsonDaSolicitacao(id),
    assinarArquivos((s.arquivos ?? []) as ArquivoSolicitacao[]),
    resolverReferencia(s.referencia),
  ]);
  const geometria = geo.geom ?? geo.ponto ?? referencia?.geometry ?? null;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href="/painel/cartografia" className="inline-flex items-center gap-1.5 text-sm font-semibold text-texto-2 hover:text-verde transition-colors">
          <ArrowLeft className="size-4" /> Mapa: solicitações
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="font-mono text-base font-semibold text-texto-2">{s.protocolo}</p>
          <Etiqueta tom={TOM_SOLICITACAO[status] ?? "neutro"}>{STATUS_SOLICITACAO_LABEL[status]}</Etiqueta>
        </div>
        <h1 className="lp-display mt-2 text-2xl md:text-[2rem] text-texto">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</h1>
        <p className="mt-2 text-base text-texto-2">
          Aberta em {dataHoraBR(s.created_at)}{municipio && ` · ${municipio.nome}`}
          {geo.area_m2 != null && ` · área indicada: ${(geo.area_m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`}
        </p>
      </div>

      {s.resposta && (
        <div className="flex items-start gap-3 rounded-2xl border border-verde/30 bg-verde/5 px-5 py-4">
          <MessageSquareReply className="mt-0.5 size-5 shrink-0 text-verde" />
          <div>
            <p className="text-sm font-semibold text-texto-2">Resposta da equipe de cartografia</p>
            <p className="mt-1 whitespace-pre-wrap text-base text-texto">{s.resposta}</p>
          </div>
        </div>
      )}
      {status === "aguardando_documentacao" && (
        <p className="flex items-start gap-3 rounded-2xl border border-alerta/40 bg-alerta/10 px-5 py-4 text-base text-alerta">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          A equipe precisa de mais informações ou documentos. Envie abaixo: a solicitação volta para a análise assim que chegar.
        </p>
      )}

      {geometria && (
        <section className="space-y-2.5">
          <MiniMapa geometry={geometria} status={geo.geom ? "publicado" : "em_negociacao"} className="h-80 w-full rounded-2xl overflow-hidden border border-linha" />
          <p className="text-sm text-texto-2">
            {referencia ? `${referencia.rotulo}. ` : ""}
            Esta é a área que você indicou. Ela não é oficial: só passa a valer no mapa depois da validação da Matriz.
          </p>
        </section>
      )}

      <section className="cartao p-5 md:p-7">
        <h2 className="lp-display flex items-center gap-3 text-xl md:text-2xl text-texto">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde"><FileText className="size-5" /></span>
          O que você informou
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-texto">{s.descricao || <span className="text-texto-2">Sem descrição.</span>}</p>
        {arquivos.length > 0 && (
          <ul className="mt-5 divide-y divide-linha rounded-xl border border-linha">
            {arquivos.map((a) => (
              <li key={a.path} className="flex items-center justify-between gap-3 px-4 py-3">
                {a.url
                  ? <a href={a.url} target="_blank" className="inline-flex min-w-0 items-center gap-2 font-semibold text-verde hover:underline"><Paperclip className="size-4 shrink-0" /><span className="truncate">{a.nome}</span></a>
                  : <span className="inline-flex min-w-0 items-center gap-2 text-texto-2"><Paperclip className="size-4 shrink-0" /><span className="truncate">{a.nome}</span></span>}
                <span className="shrink-0 text-xs text-texto-2">{a.tipo.toUpperCase()} · {tamanhoLegivel(a.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="lp-display text-xl md:text-2xl text-texto">Andamento</h2>
        <div className="cartao p-5 md:p-6">
          {(eventos ?? []).length > 0 ? (
            <ol className="border-l-2 border-linha pl-5">
              {(eventos ?? []).map((e) => (
                <li key={e.id} className="relative py-2.5 before:absolute before:-left-[27px] before:top-4 before:size-3 before:rounded-full before:border-2 before:border-verde before:bg-superficie">
                  <p className="text-xs text-texto-2 tabular-nums">
                    {dataHoraBR(e.created_at)}
                    {e.para_status && <> · <span className="font-semibold text-texto">{STATUS_SOLICITACAO_LABEL[e.para_status as StatusSolicitacao] ?? e.para_status}</span></>}
                  </p>
                  {e.mensagem && <p className="mt-1 whitespace-pre-wrap text-base text-texto">{e.mensagem}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-4 text-center text-base text-texto-2">Sem movimentações ainda.</p>
          )}
        </div>
      </section>

      <MensagemSolicitacao
        id={s.id}
        status={status}
        podeAnexar={status === "aguardando_documentacao"}
        podeCancelar={STATUS_CANCELAVEIS.includes(status)}
        encerrada={["cancelada", "publicada"].includes(status)}
      />
    </div>
  );
}
