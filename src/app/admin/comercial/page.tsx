import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { ETAPAS, ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, contar, dataHoraBR } from "@/components/admin/Painel";

const dias = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** Comercial: o funil em números, as visitas marcadas e o que está parado. */
export default async function PainelComercial() {
  const user = await exigirSetor("comercial");
  const admin = supabaseAdmin();
  const agora = new Date().toISOString();
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [leads30, { data: opps }, { data: visitas }, { data: propostas }, vendas30, parceirosAtivos] = await Promise.all([
    contar("leads", (q) => q.gte("created_at", ha30)),
    admin.from("opportunities")
      .select("id, codigo, etapa, updated_at, responsavel_tipo, lead:leads(nome), property:properties(codigo, titulo)")
      .not("etapa", "in", "(fechado,pos_venda,perdido)").order("updated_at").limit(300),
    admin.from("visits")
      .select("id, data_hora, status, opportunity:opportunities(id, codigo, lead:leads(nome), property:properties(titulo))")
      .eq("status", "agendada").gte("data_hora", agora).order("data_hora").limit(12),
    admin.from("proposals")
      .select("id, valor, autor_lado, created_at, opportunity:opportunities(id, codigo, property:properties(titulo))")
      .eq("status", "enviada").order("created_at", { ascending: false }).limit(12),
    admin.from("sales").select("valor_final").gte("created_at", ha30)
      .then(({ data }) => ({ n: data?.length ?? 0, volume: (data ?? []).reduce((s, v) => s + Number(v.valor_final), 0) })),
    contar("partners", (q) => q.in("status", ["aprovado", "ativo"])),
  ]);

  const porEtapa = new Map<string, number>();
  for (const o of opps ?? []) porEtapa.set(o.etapa, (porEtapa.get(o.etapa) ?? 0) + 1);
  const maior = Math.max(1, ...porEtapa.values());
  const novos = porEtapa.get("novo_lead") ?? 0;
  // sem movimento há 7 dias ou mais: o lead esfria
  const paradas = (opps ?? []).filter((o) => dias(o.updated_at) >= 7).slice(0, 12);

  type Opp = { id: string; codigo: string; lead?: { nome: string } | null; property?: { codigo?: string; titulo: string } | null };

  return (
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="comercial" />

      <Indicadores itens={[
        { rotulo: "Leads novos sem contato", valor: novos, href: "/admin/leads", destaque: novos > 0 },
        { rotulo: "Interessados em 30 dias", valor: leads30 },
        { rotulo: "Vendas em 30 dias", valor: vendas30.n, nota: vendas30.n ? formatBRL(vendas30.volume) : undefined },
        { rotulo: "Parceiros ativos", valor: parceirosAtivos, href: "/admin/cadastros" },
      ]} />

      <Secao titulo="Funil agora" acao={<Link href="/admin/funil" className="text-xs text-verde hover:underline">Abrir o funil</Link>}>
        <div className="cartao p-4 space-y-2">
          {ETAPAS.filter((e) => !["fechado", "pos_venda"].includes(e)).map((e) => {
            const n = porEtapa.get(e) ?? 0;
            return (
              <div key={e} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-texto-2 truncate">{ETAPA_LABEL[e]}</span>
                <span className="h-2 rounded-full bg-superficie-2 overflow-hidden">
                  <span className="block h-full rounded-full bg-verde" style={{ width: `${(n / maior) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-texto">{n}</span>
              </div>
            );
          })}
        </div>
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Próximas visitas">
          <div className="cartao divide-y divide-linha">
            {(visitas ?? []).map((v) => {
              const o = v.opportunity as unknown as Opp | null;
              return (
                <Link key={v.id} href={o ? `/admin/oportunidades/${o.id}` : "/admin/funil"}
                  className="px-4 py-3 block text-sm hover:bg-superficie-2 transition">
                  <p className="text-texto">{dataHoraBR(v.data_hora)} · {o?.lead?.nome ?? "interessado"}</p>
                  <p className="text-xs text-texto-2">{o?.codigo} · {o?.property?.titulo}</p>
                </Link>
              );
            })}
            {!visitas?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma visita marcada.</p>}
          </div>
        </Secao>

        <Secao titulo="Propostas aguardando resposta">
          <div className="cartao divide-y divide-linha">
            {(propostas ?? []).map((p) => {
              const o = p.opportunity as unknown as Opp | null;
              return (
                <Link key={p.id} href={o ? `/admin/oportunidades/${o.id}` : "/admin/funil"}
                  className="px-4 py-3 block text-sm hover:bg-superficie-2 transition">
                  <p className="text-texto">{formatBRL(Number(p.valor))} · do {p.autor_lado}</p>
                  <p className="text-xs text-texto-2">{o?.codigo} · {o?.property?.titulo}</p>
                </Link>
              );
            })}
            {!propostas?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma proposta em aberto.</p>}
          </div>
        </Secao>
      </div>

      <Secao titulo="Oportunidades paradas há 7 dias ou mais">
        <div className="cartao divide-y divide-linha">
          {paradas.map((o) => {
            const op = o as unknown as Opp & { etapa: string; updated_at: string };
            return (
              <Link key={op.id} href={`/admin/oportunidades/${op.id}`}
                className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
                <span className="font-mono text-xs text-texto-2">{op.codigo}</span>
                <span className="flex-1 min-w-48 text-texto">
                  {op.lead?.nome ?? "interessado"}<span className="text-xs text-texto-2"> · {op.property?.titulo}</span>
                </span>
                <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">{ETAPA_LABEL[op.etapa]}</span>
                <span className="text-xs text-alerta tabular-nums">{dias(op.updated_at)} dias</span>
              </Link>
            );
          })}
          {!paradas.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma oportunidade parada.</p>}
        </div>
      </Secao>

      <TarefasDoSetor setor="comercial" souEu={user.id} />
    </div>
  );
}
