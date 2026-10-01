import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirEquipe } from "@/lib/setores-servidor";
import { SETORES, setorPorId, type SetorId } from "@/lib/setores";
import { formatBRL } from "@/lib/format";
import { contar } from "@/components/admin/Painel";

type Fila = { rotulo: string; n: number | string; href: string; urgente?: boolean };

/**
 * Matriz: a visão de quem administra a empresa inteira. Um cartão por setor,
 * cada um com as filas que pedem ação agora. O membro da equipe vê os
 * setores em que atua; a diretoria vê todos.
 */
export default async function Matriz({ searchParams }: PageProps<"/admin">) {
  const user = await exigirEquipe();
  const semAcesso = (await searchParams).sem_acesso;
  const admin = supabaseAdmin();
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const ha24h = new Date(Date.now() - 86_400_000).toISOString();

  const [
    emAnalise, cadastros, docsPendentes,
    leadsNovos, emNegociacao,
    comissoesAberto, faturasVencidas,
    lgpdAbertos, autVencendo,
    publicados, leads30,
    chamadosAbertos, falhasLogin,
    minhasTarefas, tarefasPorSetor,
  ] = await Promise.all([
    contar("properties", (q) => q.in("status", ["pendente", "em_analise", "correcao"])),
    Promise.all([
      contar("partners", (q) => q.in("status", ["solicitado", "em_analise"])),
      contar("owners", (q) => q.in("status", ["solicitado", "em_analise"])),
    ]).then(([a, b]) => a + b),
    contar("property_documents", (q) => q.eq("verificado", false)),
    contar("opportunities", (q) => q.eq("etapa", "novo_lead")),
    contar("opportunities", (q) => q.in("etapa", ["proposta_enviada", "contraproposta", "negociacao", "aceite", "contrato"])),
    admin.from("commissions").select("valor").in("status", ["registrada", "cobrada"])
      .then(({ data }) => (data ?? []).reduce((s, c) => s + Number(c.valor), 0)),
    contar("invoices", (q) => q.eq("status", "vencida")),
    contar("lgpd_requests", (q) => q.in("status", ["recebido", "em_analise"])),
    contar("property_authorizations", (q) => q.gte("validade", hoje).lte("validade", em30)),
    contar("properties", (q) => q.in("status", ["publicado", "em_negociacao"])),
    contar("leads", (q) => q.gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())),
    contar("support_tickets", (q) => q.in("status", ["aberto", "em_atendimento"])),
    contar("auth_events", (q) => q.in("evento", ["login_falhou", "login_bloqueado", "mfa_falhou"]).gte("created_at", ha24h)),
    admin.from("tasks").select("id, titulo, setor, prazo, prioridade")
      .eq("responsavel", user.id).in("status", ["aberta", "andamento"])
      .order("prazo", { ascending: true, nullsFirst: false }).limit(8)
      .then(({ data }) => data ?? []),
    admin.from("tasks").select("setor").in("status", ["aberta", "andamento"])
      .then(({ data }) => {
        const m = new Map<string, number>();
        for (const t of data ?? []) m.set(t.setor, (m.get(t.setor) ?? 0) + 1);
        return m;
      }),
  ]);

  const filas: Record<SetorId, Fila[]> = {
    operacoes: [
      { rotulo: "anúncios aguardando análise", n: emAnalise, href: "/admin/imoveis?filtro=analise", urgente: emAnalise > 0 },
      { rotulo: "cadastros para aprovar", n: cadastros, href: "/admin/cadastros", urgente: cadastros > 0 },
      { rotulo: "documentos sem conferência", n: docsPendentes, href: "/admin/operacoes" },
    ],
    comercial: [
      { rotulo: "leads novos", n: leadsNovos, href: "/admin/leads", urgente: leadsNovos > 0 },
      { rotulo: "negociações em andamento", n: emNegociacao, href: "/admin/funil" },
    ],
    financeiro: [
      { rotulo: "em comissões a receber", n: formatBRL(comissoesAberto), href: "/admin/comissoes" },
      { rotulo: "faturas vencidas", n: faturasVencidas, href: "/admin/mensalidades", urgente: faturasVencidas > 0 },
    ],
    juridico: [
      { rotulo: "pedidos LGPD em aberto", n: lgpdAbertos, href: "/admin/juridico/lgpd", urgente: lgpdAbertos > 0 },
      { rotulo: "autorizações vencendo em 30 dias", n: autVencendo, href: "/admin/juridico" },
    ],
    marketing: [
      { rotulo: "imóveis no ar", n: publicados, href: "/admin/marketing" },
      { rotulo: "interessados nos últimos 30 dias", n: leads30, href: "/admin/marketing" },
    ],
    cartografia: [
      { rotulo: "plantas e malha do CAR", n: "→", href: "/admin/cartografia" },
    ],
    suporte: [
      { rotulo: "chamados em aberto", n: chamadosAbertos, href: "/admin/suporte", urgente: chamadosAbertos > 0 },
    ],
    seguranca: [
      { rotulo: "tentativas de acesso recusadas em 24 h", n: falhasLogin, href: "/admin/seguranca", urgente: falhasLogin > 20 },
    ],
    diretoria: [
      { rotulo: "indicadores gerais", n: "→", href: "/admin/relatorios" },
      { rotulo: "equipe e setores", n: "→", href: "/admin/usuarios" },
    ],
  };

  const meus = SETORES.filter((s) => user.setores.includes(s.id));

  return (
    <div className="space-y-7">
      <div>
        <p className="text-[10px] tracking-[0.22em] uppercase text-ouro">Matriz</p>
        <h1 className="text-2xl font-semibold text-texto">Olá, {user.nome?.split(" ")[0] || "equipe"}</h1>
        <p className="text-sm text-texto-2">
          {user.role === "admin_central"
            ? "Visão de todos os setores da empresa. Os números em destaque pedem ação."
            : "Estes são os setores em que você atua. Os números em destaque pedem ação."}
        </p>
      </div>

      {semAcesso && (
        <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta">
          Você não atua no setor {setorPorId(String(semAcesso))?.nome ?? semAcesso}. Se precisar desse acesso, peça à diretoria
          em Equipe e usuários.
        </p>
      )}

      {!meus.length && (
        <p className="cartao p-6 text-sm text-texto-2">
          Sua conta ainda não foi colocada em nenhum setor. Peça à diretoria para definir os seus setores.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {meus.map((s) => {
          const tarefas = tarefasPorSetor.get(s.id) ?? 0;
          return (
            <div key={s.id} className="cartao p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <Link href={s.href} className="group">
                  <p className="font-semibold text-texto group-hover:text-verde transition">
                    <span className="text-ouro mr-2">{s.icone}</span>{s.nome}
                  </p>
                  <p className="text-xs text-texto-2 mt-0.5">{s.descricao}</p>
                </Link>
              </div>
              <div className="space-y-1.5 mt-auto">
                {filas[s.id].map((f) => (
                  <Link key={f.rotulo} href={f.href}
                    className={"flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm transition " +
                      (f.urgente ? "bg-ouro/10 border border-ouro/40" : "bg-superficie-2 hover:bg-linha/60")}>
                    <span className="text-texto-2">{f.rotulo}</span>
                    <span className="font-semibold text-texto tabular-nums">{f.n}</span>
                  </Link>
                ))}
                {tarefas > 0 && (
                  <Link href={`/admin/tarefas?setor=${s.id}`} className="block px-3 pt-1 text-xs text-verde hover:underline">
                    {tarefas} tarefa{tarefas === 1 ? "" : "s"} aberta{tarefas === 1 ? "" : "s"} no setor
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-texto">Minhas tarefas</h2>
          <Link href="/admin/tarefas" className="text-xs text-verde hover:underline">Ver todas</Link>
        </div>
        <div className="cartao divide-y divide-linha">
          {minhasTarefas.map((t) => (
            <Link key={t.id} href={`/admin/tarefas?setor=${t.setor}`}
              className="px-4 py-3 flex items-center justify-between gap-3 text-sm hover:bg-superficie-2 transition">
              <span className="text-texto">
                {t.prioridade === "alta" && <span className="text-critico">● </span>}{t.titulo}
              </span>
              <span className={"text-xs shrink-0 " + (t.prazo && t.prazo < hoje ? "text-critico" : "text-texto-2")}>
                {setorPorId(t.setor)?.nome}{t.prazo && ` · ${new Date(t.prazo + "T12:00:00").toLocaleDateString("pt-BR")}`}
              </span>
            </Link>
          ))}
          {!minhasTarefas.length && (
            <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma tarefa com você no momento.</p>
          )}
        </div>
      </section>
    </div>
  );
}
