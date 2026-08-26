import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/format";
import MensalidadeAcoes, { FaturaAcoes, ValorMensal } from "./MensalidadeAcoes";

const SUB_LABEL: Record<string, string> = {
  ativa: "Ativa", pendente: "Pendente", inadimplente: "Inadimplente", isenta: "Isenta", cancelada: "Cancelada",
};

export default async function AdminMensalidades() {
  const admin = supabaseAdmin();
  const [{ data: subs }, { data: invoices }] = await Promise.all([
    admin.from("subscriptions")
      .select("id, valor_mensal, dia_vencimento, status, property:properties(codigo, titulo, status)")
      .order("created_at", { ascending: false }),
    admin.from("invoices")
      .select("id, competencia, valor, status, pago_em, gateway_id, subscription:subscriptions(property:properties(codigo))")
      .order("competencia", { ascending: false }).limit(60),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-verde-escuro">Mensalidades</h1>
        <MensalidadeAcoes />
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-verde-escuro">Assinaturas por imóvel publicado</h2>
        <div className="rounded-xl border border-linha bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-foreground/50 border-b border-linha">
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Valor mensal</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {(subs ?? []).map((s) => {
                const prop = s.property as unknown as { codigo: string; titulo: string; status: string } | null;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">{prop?.titulo}<br /><span className="font-mono text-xs text-foreground/50">{prop?.codigo}</span></td>
                    <td className="px-4 py-3"><ValorMensal id={s.id} valor={Number(s.valor_mensal)} /></td>
                    <td className="px-4 py-3">dia {s.dia_vencimento}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-3 py-1 ${s.status === "inadimplente" ? "bg-red-100 text-red-800" : s.status === "ativa" ? "bg-verde/10 text-verde" : "bg-areia"}`}>
                        {SUB_LABEL[s.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!subs?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-foreground/50">Nenhuma assinatura — nascem ao publicar um imóvel.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-verde-escuro">Faturas</h2>
        <div className="rounded-xl border border-linha bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-foreground/50 border-b border-linha">
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {(invoices ?? []).map((i) => {
                const sub = i.subscription as unknown as { property: { codigo: string } | null } | null;
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-3 font-mono text-xs">{sub?.property?.codigo}</td>
                    <td className="px-4 py-3">{new Date(i.competencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</td>
                    <td className="px-4 py-3 tabular-nums">{formatBRL(i.valor)}</td>
                    <td className="px-4 py-3">
                      {i.status}{i.pago_em ? ` em ${new Date(i.pago_em + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
                      {i.gateway_id && <span className="text-xs text-foreground/50"> · Asaas</span>}
                    </td>
                    <td className="px-4 py-3">{i.status !== "paga" && <FaturaAcoes id={i.id} />}</td>
                  </tr>
                );
              })}
              {!invoices?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-foreground/50">Nenhuma fatura — use “Gerar faturas do mês”.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
