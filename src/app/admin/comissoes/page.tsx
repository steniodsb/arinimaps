import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/format";
import ComissaoBotoes from "./ComissaoBotoes";
import { exigirSetor } from "@/lib/setores-servidor";
import { CODIGO, TABELA, TABELA_CAIXA, TBODY, TH, THEAD, TR } from "@/components/admin/estilos";
import { CircleDollarSign, Handshake, Percent, Wallet } from "lucide-react";
import { CabecalhoPagina, Estatistica, Etiqueta, Vazio } from "@/components/ui/Pagina";

const TOM: Record<string, "ouro" | "alerta" | "verde" | "neutro"> = {
  registrada: "ouro", cobrada: "alerta", paga: "verde", conciliada: "verde",
};

const LABEL: Record<string, string> = {
  registrada: "Registrada", cobrada: "Cobrada", paga: "Paga", conciliada: "Conciliada",
};

export default async function AdminComissoes() {
  await exigirSetor("financeiro");
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
    <div className="space-y-8">
      <CabecalhoPagina eyebrow="Financeiro" titulo="Comissões"
        subtitulo="Comissão de cada venda, do registro à conciliação." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Estatistica icone={Wallet} urgente={total(["registrada", "cobrada"]) > 0}
          valor={<span className="tabular-nums">{formatBRL(total(["registrada", "cobrada"]))}</span>} rotulo="A receber (registrada + cobrada)" />
        <Estatistica icone={CircleDollarSign}
          valor={<span className="tabular-nums text-verde">{formatBRL(total(["paga", "conciliada"]))}</span>} rotulo="Recebido" />
        <Estatistica icone={Handshake} valor={<span className="tabular-nums">{comissoes?.length ?? 0}</span>} rotulo="Vendas com comissão" />
      </div>

      {!comissoes?.length ? (
        <Vazio icone={Percent} titulo="Nenhuma comissão ainda"
          texto="Elas nascem automaticamente ao registrar uma venda." />
      ) : (
        <div className={TABELA_CAIXA}>
          <table className={TABELA}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Venda</th>
                <th className={TH}>Imóvel</th>
                <th className={TH}>Base</th>
                <th className={TH}>%</th>
                <th className={TH}>Comissão</th>
                <th className={TH}>Status</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {comissoes.map((c) => {
                const sale = c.sale as unknown as { data_venda: string; opportunity: { codigo: string } | null; property: { codigo: string; titulo: string } | null } | null;
                return (
                  <tr key={c.id} className={TR}>
                    <td className="px-4 py-3.5 whitespace-nowrap"><span className={CODIGO}>{sale?.opportunity?.codigo}</span><span className="block text-sm text-texto-2 tabular-nums">{sale ? new Date(sale.data_venda + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span></td>
                    <td className="px-4 py-3.5"><span className="font-medium text-texto">{sale?.property?.titulo}</span><span className={"block mt-0.5 " + CODIGO}>{sale?.property?.codigo}</span></td>
                    <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">{formatBRL(c.base_calculo)}</td>
                    <td className="px-4 py-3.5 tabular-nums">{Number(c.percentual).toLocaleString("pt-BR")}%</td>
                    <td className="px-4 py-3.5 tabular-nums whitespace-nowrap font-bold text-texto">{formatBRL(c.valor)}</td>
                    <td className="px-4 py-3.5"><Etiqueta tom={TOM[c.status] ?? "neutro"}>{LABEL[c.status]}{c.pago_em ? ` em ${new Date(c.pago_em + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}</Etiqueta></td>
                    <td className="px-4 py-3.5 text-right"><ComissaoBotoes id={c.id} status={c.status} /></td>
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
