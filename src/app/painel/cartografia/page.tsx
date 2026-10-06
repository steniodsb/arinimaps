import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { dataHoraBR } from "@/components/admin/Painel";
import {
  STATUS_SOLICITACAO_COR, STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL,
  type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";

/** As solicitações cartográficas de quem está logado (RLS: só as próprias). */
export default async function MinhasSolicitacoes() {
  const supabase = await supabaseServer();
  const { data: solicitacoes } = await supabase
    .from("cartographic_requests")
    .select("id, protocolo, tipo, status, resposta, created_at, updated_at")
    .order("created_at", { ascending: false });
  const lista = solicitacoes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Mapa: solicitações</h1>
          <p className="text-texto-2 text-sm">
            Imóveis que você informou como ausentes ou divergentes no mapa, com o andamento da análise da cartografia.
          </p>
        </div>
        <Link href="/cartografia/solicitar" className="btn-verde px-4 py-2 text-sm">+ Nova solicitação</Link>
      </div>

      {lista.length === 0 ? (
        <div className="cartao p-10 text-center text-texto-2 text-sm">
          Nenhuma solicitação ainda. Não encontrou seu imóvel no mapa, ou a divisa está errada?{" "}
          <Link href="/cartografia/solicitar" className="text-verde hover:underline">Abra uma solicitação</Link>.
        </div>
      ) : (
        <div className="cartao divide-y divide-linha">
          {lista.map((s) => (
            <Link key={s.id} href={`/painel/cartografia/${s.id}`}
              className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
              <span className="font-mono text-xs text-texto-2">{s.protocolo}</span>
              <span className="flex-1 min-w-48">
                <span className="text-texto font-medium">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</span>
                {s.resposta && <span className="block text-xs text-texto-2 truncate">Resposta: {s.resposta}</span>}
              </span>
              <span className={`text-xs rounded-full px-3 py-1 ${STATUS_SOLICITACAO_COR[s.status as StatusSolicitacao] ?? "bg-superficie-2"}`}>
                {STATUS_SOLICITACAO_LABEL[s.status as StatusSolicitacao] ?? s.status}
              </span>
              <span className="text-xs text-texto-2 tabular-nums" title={`Aberta em ${dataHoraBR(s.created_at)}`}>
                {dataHoraBR(s.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
