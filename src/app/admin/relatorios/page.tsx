import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPAS, ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";

export default async function AdminRelatorios() {
  const admin = supabaseAdmin();
  const [{ data: opps }, { data: vendas }, { data: comissoes }, { data: faturas }, { data: leads }] = await Promise.all([
    admin.from("opportunities").select("etapa"),
    admin.from("sales").select("valor_final, data_venda"),
    admin.from("commissions").select("valor, status"),
    admin.from("invoices").select("valor, status"),
    admin.from("leads").select("origem"),
  ]);

  const porEtapa = new Map<string, number>();
  for (const o of opps ?? []) porEtapa.set(o.etapa, (porEtapa.get(o.etapa) ?? 0) + 1);
  const totalOpps = opps?.length ?? 0;
  const fechadas = (porEtapa.get("fechado") ?? 0) + (porEtapa.get("pos_venda") ?? 0);
  const perdidas = porEtapa.get("perdido") ?? 0;
  const conversao = totalOpps ? ((fechadas / totalOpps) * 100).toFixed(1) : "0";

  const somaVendas = (vendas ?? []).reduce((s, v) => s + Number(v.valor_final), 0);
  const somaComissao = (st: string[]) => (comissoes ?? []).filter((c) => st.includes(c.status)).reduce((s, c) => s + Number(c.valor), 0);
  const somaFaturas = (st: string[]) => (faturas ?? []).filter((f) => st.includes(f.status)).reduce((s, f) => s + Number(f.valor), 0);

  const porOrigem = new Map<string, number>();
  for (const l of leads ?? []) porOrigem.set(l.origem, (porOrigem.get(l.origem) ?? 0) + 1);

  const maxEtapa = Math.max(1, ...[...porEtapa.values()]);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-verde-escuro">Relatórios</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Oportunidades", v: String(totalOpps) },
          { l: "Conversão em venda", v: `${conversao}%` },
          { l: "Volume vendido (VGV)", v: formatBRL(somaVendas) },
          { l: "Comissão recebida", v: formatBRL(somaComissao(["paga", "conciliada"])) },
          { l: "Comissão a receber", v: formatBRL(somaComissao(["registrada", "cobrada"])) },
          { l: "Mensalidades recebidas", v: formatBRL(somaFaturas(["paga"])) },
          { l: "Mensalidades em aberto", v: formatBRL(somaFaturas(["aberta", "vencida"])) },
          { l: "Oportunidades perdidas", v: String(perdidas) },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-linha bg-white p-4">
            <p className="text-xs text-foreground/60">{c.l}</p>
            <p className="text-lg font-semibold tabular-nums">{c.v}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-linha bg-white p-5 space-y-2">
        <h2 className="font-semibold text-verde-escuro">Funil por etapa</h2>
        {[...ETAPAS, "perdido"].map((e) => {
          const n = porEtapa.get(e) ?? 0;
          return (
            <div key={e} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-foreground/70">{ETAPA_LABEL[e]}</span>
              <div className="flex-1 h-5 bg-areia rounded overflow-hidden">
                <div className={`h-full ${e === "perdido" ? "bg-red-300" : "bg-verde"}`}
                  style={{ width: `${(n / maxEtapa) * 100}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums">{n}</span>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-linha bg-white p-5 space-y-1">
        <h2 className="font-semibold text-verde-escuro mb-2">Leads por origem</h2>
        {[...porOrigem.entries()].map(([origem, n]) => (
          <p key={origem} className="text-sm flex justify-between"><span className="capitalize">{origem}</span><span className="tabular-nums">{n}</span></p>
        ))}
        {!porOrigem.size && <p className="text-sm text-foreground/50">Sem leads ainda.</p>}
      </section>
    </div>
  );
}
