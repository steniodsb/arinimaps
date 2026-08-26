import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/format";
import ComissaoBotoes from "./ComissaoBotoes";

const LABEL: Record<string, string> = {
  registrada: "Registrada", cobrada: "Cobrada", paga: "Paga", conciliada: "Conciliada",
};

export default async function AdminComissoes() {
  const { data: comissoes } = await supabaseAdmin()
    .from("commissions")
    .select(`
      id, base_calculo, percentual, valor, regra_contratual, status, pago_em, created_at,
      sale:sales(data_venda, opportunity:opportunities(codigo), property:properties(codigo, titulo))
    `)
    .order("created_at", { ascending: false });

  const total = (status: string[]) =>
    (comissoes ?? []).filter((c) => status.includes(c.status)).reduce((s, c) => s + Number(c.valor), 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-verde-escuro">Comissões</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-linha bg-white p-4">
          <p className="text-xs text-foreground/60">A receber (registrada + cobrada)</p>
          <p className="text-xl font-semibold tabular-nums">{formatBRL(total(["registrada", "cobrada"]))}</p>
        </div>
        <div className="rounded-xl border border-linha bg-white p-4">
          <p className="text-xs text-foreground/60">Recebido</p>
          <p className="text-xl font-semibold tabular-nums text-verde">{formatBRL(total(["paga", "conciliada"]))}</p>
        </div>
        <div className="rounded-xl border border-linha bg-white p-4">
          <p className="text-xs text-foreground/60">Vendas com comissão</p>
          <p className="text-xl font-semibold tabular-nums">{comissoes?.length ?? 0}</p>
        </div>
      </div>

      {!comissoes?.length ? (
        <div className="rounded-xl border border-linha bg-white p-10 text-center text-foreground/60">
          Nenhuma comissão ainda — elas nascem automaticamente ao registrar uma venda.
        </div>
      ) : (
        <div className="rounded-xl border border-linha bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-foreground/50 border-b border-linha">
                <th className="px-4 py-3">Venda</th>
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">%</th>
                <th className="px-4 py-3">Comissão</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {comissoes.map((c) => {
                const sale = c.sale as unknown as { data_venda: string; opportunity: { codigo: string } | null; property: { codigo: string; titulo: string } | null } | null;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono text-xs">{sale?.opportunity?.codigo}<br />{sale ? new Date(sale.data_venda + "T12:00:00").toLocaleDateString("pt-BR") : ""}</td>
                    <td className="px-4 py-3">{sale?.property?.titulo}<br /><span className="font-mono text-xs text-foreground/50">{sale?.property?.codigo}</span></td>
                    <td className="px-4 py-3 tabular-nums">{formatBRL(c.base_calculo)}</td>
                    <td className="px-4 py-3 tabular-nums">{Number(c.percentual).toLocaleString("pt-BR")}%</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatBRL(c.valor)}</td>
                    <td className="px-4 py-3">{LABEL[c.status]}{c.pago_em ? ` em ${new Date(c.pago_em + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}</td>
                    <td className="px-4 py-3"><ComissaoBotoes id={c.id} status={c.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
