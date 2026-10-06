import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { dataHoraBR } from "@/components/admin/Painel";
import MiniMapa from "@/components/map/MiniMapa";
import {
  STATUS_CANCELAVEIS, STATUS_SOLICITACAO_COR, STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL, tamanhoLegivel,
  type ArquivoSolicitacao, type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";
import { assinarArquivos, geojsonDaSolicitacao, resolverReferencia } from "@/lib/cartografia/servidor";
import MensagemSolicitacao from "./MensagemSolicitacao";

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
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/painel/cartografia" className="text-xs text-verde hover:underline">← Mapa: solicitações</Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <p className="font-mono text-xl font-semibold text-texto">{s.protocolo}</p>
          <span className={`text-xs rounded-full px-3 py-1 ${STATUS_SOLICITACAO_COR[status]}`}>{STATUS_SOLICITACAO_LABEL[status]}</span>
        </div>
        <h1 className="text-lg font-semibold text-texto mt-1">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</h1>
        <p className="text-sm text-texto-2">
          Aberta em {dataHoraBR(s.created_at)}{municipio && ` · ${municipio.nome}`}
          {geo.area_m2 != null && ` · área indicada: ${(geo.area_m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`}
        </p>
      </div>

      {s.resposta && (
        <div className="rounded-xl border border-verde/30 bg-verde/5 px-4 py-3 text-sm">
          <p className="text-xs text-texto-2 mb-1">Resposta da equipe de cartografia</p>
          <p className="whitespace-pre-wrap text-texto">{s.resposta}</p>
        </div>
      )}
      {status === "aguardando_documentacao" && (
        <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta">
          A equipe precisa de mais informações ou documentos. Envie abaixo: a solicitação volta para a análise assim que chegar.
        </p>
      )}

      {geometria && (
        <section className="space-y-2">
          <MiniMapa geometry={geometria} status={geo.geom ? "publicado" : "em_negociacao"} className="h-72 w-full rounded-xl overflow-hidden border border-linha" />
          <p className="text-xs text-texto-2">
            {referencia ? `${referencia.rotulo}. ` : ""}
            Esta é a área que você indicou. Ela não é oficial: só passa a valer no mapa depois da validação da Matriz.
          </p>
        </section>
      )}

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">O que você informou</h2>
        <p className="text-sm whitespace-pre-wrap text-texto">{s.descricao || <span className="text-texto-2">Sem descrição.</span>}</p>
        {arquivos.length > 0 && (
          <ul className="text-sm space-y-1">
            {arquivos.map((a) => (
              <li key={a.path} className="flex items-center justify-between gap-2">
                {a.url
                  ? <a href={a.url} target="_blank" className="text-verde hover:underline truncate">{a.nome}</a>
                  : <span className="text-texto-2 truncate">{a.nome}</span>}
                <span className="text-xs text-texto-2 shrink-0">{a.tipo.toUpperCase()} · {tamanhoLegivel(a.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-texto">Andamento</h2>
        <div className="cartao divide-y divide-linha">
          {(eventos ?? []).map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <p className="text-xs text-texto-2">
                {dataHoraBR(e.created_at)}
                {e.para_status && <> · <span className="text-texto">{STATUS_SOLICITACAO_LABEL[e.para_status as StatusSolicitacao] ?? e.para_status}</span></>}
              </p>
              {e.mensagem && <p className="whitespace-pre-wrap text-texto mt-0.5">{e.mensagem}</p>}
            </div>
          ))}
          {!eventos?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Sem movimentações ainda.</p>}
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
