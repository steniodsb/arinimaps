import Link from "next/link";
import { Map as MapIcon, Plus, ChevronRight } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { dataHoraBR } from "@/components/admin/Painel";
import {
  STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL,
  type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";
import { Secao, Vazio, Etiqueta, BotaoLink } from "@/components/ui/Pagina";
import { TOM_SOLICITACAO } from "@/components/painel/tons";

/** As solicitações cartográficas de quem está logado (RLS: só as próprias). */
export default async function MinhasSolicitacoes() {
  const supabase = await supabaseServer();
  const { data: solicitacoes } = await supabase
    .from("cartographic_requests")
    .select("id, protocolo, tipo, status, resposta, created_at, updated_at")
    .order("created_at", { ascending: false });
  const lista = solicitacoes ?? [];

  return (
    <Secao
      eyebrow="Cartografia"
      titulo="Mapa: solicitações"
      subtitulo="Imóveis que você informou como ausentes ou divergentes no mapa, com o andamento da análise da cartografia."
      acao={<BotaoLink href="/cartografia/solicitar" seta={false}><Plus /> Nova solicitação</BotaoLink>}
    >
      {lista.length === 0 ? (
        <Vazio
          icone={MapIcon}
          titulo="Nenhuma solicitação ainda"
          texto="Não encontrou seu imóvel no mapa, ou a divisa está errada?"
          acao={<BotaoLink href="/cartografia/solicitar">Abra uma solicitação</BotaoLink>}
        />
      ) : (
        <div className="cartao overflow-hidden">
          <div className="hidden grid-cols-[9rem_1fr_auto_9rem] gap-4 border-b border-linha px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-2 md:grid">
            <span>Protocolo</span><span>Solicitação</span><span>Status</span><span className="text-right">Atualizada</span>
          </div>
          <div className="divide-y divide-linha">
            {lista.map((s) => (
              <Link key={s.id} href={`/painel/cartografia/${s.id}`}
                className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 transition-colors hover:bg-superficie-2/70 md:grid md:grid-cols-[9rem_1fr_auto_9rem]">
                <span className="font-mono text-sm text-texto-2">{s.protocolo}</span>
                <span className="min-w-48 flex-1">
                  <span className="text-[0.95rem] font-semibold text-texto group-hover:text-verde transition-colors">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</span>
                  {s.resposta && <span className="block truncate text-sm text-texto-2">Resposta: {s.resposta}</span>}
                </span>
                <Etiqueta tom={TOM_SOLICITACAO[s.status as StatusSolicitacao] ?? "neutro"}>
                  {STATUS_SOLICITACAO_LABEL[s.status as StatusSolicitacao] ?? s.status}
                </Etiqueta>
                <span className="flex items-center justify-end gap-1 text-xs text-texto-2 tabular-nums" title={`Aberta em ${dataHoraBR(s.created_at)}`}>
                  {dataHoraBR(s.updated_at)} <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Secao>
  );
}
