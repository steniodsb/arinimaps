import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { formatBRL } from "@/lib/format";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, dataBR } from "@/components/admin/Painel";

type Mes = {
  mes: string; vendas: number; volume_vendido: number;
  comissao_registrada: number; comissao_recebida: number;
  mensalidade_faturada: number; mensalidade_recebida: number;
};

const nomeMes = (m: string) =>
  new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

/** Financeiro: receita por mês, o que falta receber e o que está vencido. */
export default async function PainelFinanceiro() {
  const user = await exigirSetor("financeiro");
  const admin = supabaseAdmin();

  const [{ data: mensal }, { data: comissoes }, { data: faturas }, { data: assinaturas }] = await Promise.all([
    admin.rpc("fn_financeiro_mensal", { p_meses: 12 }),
    admin.from("commissions")
      .select("id, valor, status, created_at, sale:sales(data_venda, property:properties(codigo, titulo))")
      .in("status", ["registrada", "cobrada"]).order("created_at"),
    admin.from("invoices")
      .select("id, competencia, valor, status, subscription:subscriptions(property:properties(codigo, titulo))")
      .in("status", ["aberta", "vencida"]).order("competencia").limit(40),
    admin.from("subscriptions").select("valor_mensal, status"),
  ]);

  const meses = (mensal ?? []) as Mes[];
  const atual = meses[0];
  const aReceber = (comissoes ?? []).reduce((s, c) => s + Number(c.valor), 0);
  const vencidas = (faturas ?? []).filter((f) => f.status === "vencida");
  const recorrente = (assinaturas ?? []).filter((a) => a.status === "ativa").reduce((s, a) => s + Number(a.valor_mensal), 0);
  const recebido12 = meses.reduce((s, m) => s + Number(m.comissao_recebida) + Number(m.mensalidade_recebida), 0);
  const brl = (v: number) => (Number(v) ? formatBRL(Number(v)) : "—");

  return (
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="financeiro">
        <a href="/api/admin/financeiro/exportar" className="btn-contorno px-4 py-2 text-sm">Baixar planilha (CSV)</a>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Comissões a receber", valor: formatBRL(aReceber), href: "/admin/comissoes", destaque: aReceber > 0 },
        { rotulo: "Faturas vencidas", valor: vencidas.length, href: "/admin/mensalidades", destaque: vencidas.length > 0,
          nota: vencidas.length ? formatBRL(vencidas.reduce((s, f) => s + Number(f.valor), 0)) : undefined },
        { rotulo: "Mensalidade recorrente", valor: formatBRL(recorrente), nota: "por mês, anúncios ativos" },
        { rotulo: "Recebido em 12 meses", valor: formatBRL(recebido12), nota: atual ? `${atual.vendas} venda(s) neste mês` : undefined },
      ]} />

      <Secao titulo="Receita por mês">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Mês</th>
                <th className="px-4 py-3 text-right">Vendas</th>
                <th className="px-4 py-3 text-right">Volume vendido</th>
                <th className="px-4 py-3 text-right">Comissão gerada</th>
                <th className="px-4 py-3 text-right">Comissão recebida</th>
                <th className="px-4 py-3 text-right">Mensalidade faturada</th>
                <th className="px-4 py-3 text-right">Mensalidade recebida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha tabular-nums">
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td className="px-4 py-2.5 text-texto capitalize">{nomeMes(m.mes)}</td>
                  <td className="px-4 py-2.5 text-right">{m.vendas || "—"}</td>
                  <td className="px-4 py-2.5 text-right">{brl(m.volume_vendido)}</td>
                  <td className="px-4 py-2.5 text-right">{brl(m.comissao_registrada)}</td>
                  <td className="px-4 py-2.5 text-right text-verde">{brl(m.comissao_recebida)}</td>
                  <td className="px-4 py-2.5 text-right">{brl(m.mensalidade_faturada)}</td>
                  <td className="px-4 py-2.5 text-right text-verde">{brl(m.mensalidade_recebida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Comissões a receber" acao={<Link href="/admin/comissoes" className="text-xs text-verde hover:underline">Abrir comissões</Link>}>
          <div className="cartao divide-y divide-linha">
            {(comissoes ?? []).map((c) => {
              const venda = c.sale as unknown as { data_venda: string; property: { codigo: string; titulo: string } | null } | null;
              return (
                <div key={c.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span>
                    <span className="text-texto">{venda?.property?.titulo ?? "Venda"}</span>
                    <span className="block text-xs text-texto-2">{venda?.property?.codigo} · venda em {dataBR(venda?.data_venda)} · {c.status}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatBRL(Number(c.valor))}</span>
                </div>
              );
            })}
            {!comissoes?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma comissão em aberto.</p>}
          </div>
        </Secao>

        <Secao titulo="Faturas em aberto" acao={<Link href="/admin/mensalidades" className="text-xs text-verde hover:underline">Abrir mensalidades</Link>}>
          <div className="cartao divide-y divide-linha">
            {(faturas ?? []).map((f) => {
              const p = (f.subscription as unknown as { property: { codigo: string; titulo: string } | null } | null)?.property;
              return (
                <div key={f.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span>
                    <span className="text-texto">{p?.titulo ?? "Anúncio"}</span>
                    <span className={"block text-xs " + (f.status === "vencida" ? "text-critico" : "text-texto-2")}>
                      {p?.codigo} · competência {new Date(f.competencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })} · {f.status}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatBRL(Number(f.valor))}</span>
                </div>
              );
            })}
            {!faturas?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma fatura em aberto.</p>}
          </div>
        </Secao>
      </div>

      <TarefasDoSetor setor="financeiro" souEu={user.id} />
    </div>
  );
}
