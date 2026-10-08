import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPAS, ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";
import { exigirSetor } from "@/lib/setores-servidor";
import {
  CircleDollarSign, Filter, Hourglass, Percent, Receipt, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { CabecalhoPagina, Estatistica } from "@/components/ui/Pagina";
import { Secao } from "@/components/admin/Painel";

export default async function AdminRelatorios() {
  await exigirSetor("diretoria");
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
    <div className="space-y-10 md:space-y-12">
      <CabecalhoPagina eyebrow="Diretoria" titulo="Relatórios"
        subtitulo="Indicadores gerais da empresa: funil, vendas, comissões e mensalidades." />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Oportunidades", v: String(totalOpps), i: Filter },
          { l: "Conversão em venda", v: `${conversao}%`, i: Percent },
          { l: "Volume vendido (VGV)", v: formatBRL(somaVendas), i: TrendingUp },
          { l: "Comissão recebida", v: formatBRL(somaComissao(["paga", "conciliada"])), i: CircleDollarSign },
          { l: "Comissão a receber", v: formatBRL(somaComissao(["registrada", "cobrada"])), i: Wallet },
          { l: "Mensalidades recebidas", v: formatBRL(somaFaturas(["paga"])), i: Receipt },
          { l: "Mensalidades em aberto", v: formatBRL(somaFaturas(["aberta", "vencida"])), i: Hourglass },
          { l: "Oportunidades perdidas", v: String(perdidas), i: TrendingDown },
        ].map((c) => (
          <Estatistica key={c.l} icone={c.i} valor={<span className="tabular-nums text-[1.6rem] md:text-3xl">{c.v}</span>} rotulo={c.l} />
        ))}
      </div>

      <div className="grid gap-10 lg:gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Secao titulo="Funil por etapa">
          <div className="cartao p-6 space-y-3">
            {[...ETAPAS, "perdido"].map((e) => {
              const n = porEtapa.get(e) ?? 0;
              return (
                <div key={e} className="grid grid-cols-[8rem_1fr_2.5rem] sm:grid-cols-[11rem_1fr_3rem] items-center gap-4 text-[0.95rem]">
                  <span className="truncate text-texto-2">{ETAPA_LABEL[e]}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-superficie-2">
                    <div className={`h-full rounded-full ${e === "perdido" ? "bg-critico/70" : "bg-verde"}`}
                      style={{ width: `${(n / maxEtapa) * 100}%` }} />
                  </div>
                  <span className="lp-display text-right text-lg leading-none tabular-nums text-texto">{n}</span>
                </div>
              );
            })}
          </div>
        </Secao>

        <Secao titulo="Leads por origem">
          <div className="cartao p-6 text-[0.95rem]">
            {[...porOrigem.entries()].map(([origem, n]) => (
              <p key={origem} className="flex justify-between gap-3 border-b border-linha py-2.5 last:border-0">
                <span className="capitalize text-texto-2">{origem}</span>
                <span className="font-semibold tabular-nums text-texto">{n}</span>
              </p>
            ))}
            {!porOrigem.size && <p className="py-4 text-center text-texto-2">Sem leads ainda.</p>}
          </div>
        </Secao>
      </div>
    </div>
  );
}
