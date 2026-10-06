import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { CabecalhoSetor, Indicadores, dataHoraBR } from "@/components/admin/Painel";
import {
  STATUS_ABERTOS, STATUS_SOLICITACAO, STATUS_SOLICITACAO_COR, STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL,
  ehStatusSolicitacao, type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";

/**
 * Fila da Cartografia (requisitos §2.2): cada "não encontrei meu imóvel" e
 * "mapa divergente" chega aqui com protocolo, passa pela triagem e segue a
 * máquina de status até publicar ou rejeitar.
 */
export default async function SolicitacoesCartograficas({ searchParams }: PageProps<"/admin/cartografia/solicitacoes">) {
  const user = await exigirSetor("cartografia");
  const sp = await searchParams;
  const filtro = typeof sp.status === "string" ? sp.status : "abertas";
  const admin = supabaseAdmin();

  let q = admin.from("cartographic_requests")
    .select("id, protocolo, tipo, status, user_id, responsavel, created_at, updated_at, municipality:municipalities(nome)")
    .order("created_at", { ascending: false }).limit(200);
  if (filtro === "abertas") q = q.in("status", STATUS_ABERTOS);
  else if (filtro === "minhas") q = q.eq("responsavel", user.id).in("status", STATUS_ABERTOS);
  else if (ehStatusSolicitacao(filtro)) q = q.eq("status", filtro);

  const [{ data: lista }, { data: todas }] = await Promise.all([
    q,
    admin.from("cartographic_requests").select("status"),
  ]);
  const porStatus = new Map<string, number>();
  for (const r of todas ?? []) porStatus.set(r.status, (porStatus.get(r.status) ?? 0) + 1);
  const n = (s: StatusSolicitacao) => porStatus.get(s) ?? 0;
  const abertas = STATUS_ABERTOS.reduce((t, s) => t + n(s), 0);

  // nomes de solicitante e responsável numa consulta só (dois FKs para profiles)
  const ids = [...new Set((lista ?? []).flatMap((r) => [r.user_id, r.responsavel]).filter((x): x is string => !!x))];
  const { data: perfis } = ids.length ? await admin.from("profiles").select("user_id, nome").in("user_id", ids) : { data: [] };
  const nome = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]));
  const chip = "rounded-full border px-3 py-1 text-xs transition ";

  return (
    <div className="space-y-6 max-w-5xl">
      <CabecalhoSetor setor="cartografia">
        <Link href="/cartografia/solicitar" target="_blank" className="btn-contorno px-4 py-2 text-sm">Ver o formulário público</Link>
      </CabecalhoSetor>

      <div>
        <h2 className="font-semibold text-texto">Solicitações cartográficas</h2>
        <p className="text-sm text-texto-2">
          Imóveis ausentes ou divergentes informados pelos usuários. A geometria enviada é indicação: só vira oficial
          quando a equipe aplica e valida.
        </p>
      </div>

      <Indicadores itens={[
        { rotulo: "Recebidas (sem triagem)", valor: n("recebida"), destaque: n("recebida") > 0, href: "/admin/cartografia/solicitacoes?status=recebida" },
        { rotulo: "Em aberto", valor: abertas, href: "/admin/cartografia/solicitacoes?status=abertas" },
        { rotulo: "Aguardando documentação", valor: n("aguardando_documentacao"), href: "/admin/cartografia/solicitacoes?status=aguardando_documentacao" },
        { rotulo: "Em vetorização / revisão", valor: n("em_vetorizacao") + n("em_revisao"), href: "/admin/cartografia/solicitacoes?status=em_vetorizacao" },
      ]} />

      <div className="flex flex-wrap gap-2">
        {[["abertas", `Em aberto (${abertas})`], ["minhas", "Comigo"], ...STATUS_SOLICITACAO.map((s) => [s, `${STATUS_SOLICITACAO_LABEL[s]} (${n(s)})`]), ["todas", "Todas"]].map(([v, l]) => (
          <Link key={v} href={`/admin/cartografia/solicitacoes?status=${v}`}
            className={chip + (filtro === v ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2 hover:text-texto")}>{l}</Link>
        ))}
      </div>

      <div className="cartao divide-y divide-linha">
        <div className="hidden md:grid grid-cols-[7rem_1fr_1fr_8rem_11rem_8rem_8rem] gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-texto-2">
          <span>Protocolo</span><span>Tipo</span><span>Solicitante</span><span>Município</span><span>Status</span><span>Responsável</span><span>Criada</span>
        </div>
        {(lista ?? []).map((r) => {
          const municipio = r.municipality as unknown as { nome: string } | null;
          return (
            <Link key={r.id} href={`/admin/cartografia/solicitacoes/${r.id}`}
              className="grid md:grid-cols-[7rem_1fr_1fr_8rem_11rem_8rem_8rem] gap-x-3 gap-y-1 px-4 py-3 text-sm items-center hover:bg-superficie-2 transition">
              <span className="font-mono text-xs text-texto-2">{r.protocolo}</span>
              <span className="text-texto">{TIPO_SOLICITACAO_LABEL[r.tipo as TipoSolicitacao] ?? r.tipo}</span>
              <span className="text-texto-2 truncate">{nome.get(r.user_id) ?? "—"}</span>
              <span className="text-texto-2 truncate">{municipio?.nome ?? "—"}</span>
              <span>
                <span className={`text-xs rounded-full px-3 py-1 ${STATUS_SOLICITACAO_COR[r.status as StatusSolicitacao] ?? "bg-superficie-2"}`}>
                  {STATUS_SOLICITACAO_LABEL[r.status as StatusSolicitacao] ?? r.status}
                </span>
              </span>
              <span className="text-texto-2 truncate">{r.responsavel ? nome.get(r.responsavel) ?? "equipe" : "—"}</span>
              <span className="text-xs text-texto-2 tabular-nums">{dataHoraBR(r.created_at)}</span>
            </Link>
          );
        })}
        {!lista?.length && <p className="px-4 py-8 text-center text-sm text-texto-2">Nenhuma solicitação neste filtro.</p>}
      </div>
    </div>
  );
}
