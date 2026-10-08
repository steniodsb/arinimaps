import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/format";
import MensalidadeAcoes, { FaturaAcoes, ValorMensal } from "./MensalidadeAcoes";
import { exigirSetor } from "@/lib/setores-servidor";
import { CODIGO, TABELA, TABELA_CAIXA, TBODY, TH, THEAD, TR } from "@/components/admin/estilos";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/Pagina";
import { Secao } from "@/components/admin/Painel";

const TOM_SUB: Record<string, "verde" | "critico" | "ouro" | "neutro"> = {
  ativa: "verde", inadimplente: "critico", pendente: "ouro", isenta: "neutro", cancelada: "neutro",
};
const TOM_FATURA: Record<string, "verde" | "critico" | "ouro" | "neutro"> = {
  paga: "verde", vencida: "critico", aberta: "ouro",
};

const SUB_LABEL: Record<string, string> = {
  ativa: "Ativa", pendente: "Pendente", inadimplente: "Inadimplente", isenta: "Isenta", cancelada: "Cancelada",
};

export default async function AdminMensalidades() {
  await exigirSetor("financeiro");
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
    <div className="space-y-10 md:space-y-12">
      <CabecalhoPagina eyebrow="Financeiro" titulo="Mensalidades"
        subtitulo="Assinatura de cada imóvel publicado e as faturas do mês." acoes={<MensalidadeAcoes />} />

      <Secao titulo="Assinaturas por imóvel publicado">
        <div className={TABELA_CAIXA}>
          <table className={TABELA}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Imóvel</th>
                <th className={TH}>Valor mensal</th>
                <th className={TH}>Vencimento</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {(subs ?? []).map((s) => {
                const prop = s.property as unknown as { codigo: string; titulo: string; status: string } | null;
                return (
                  <tr key={s.id} className={TR}>
                    <td className="px-4 py-3.5"><span className="font-medium text-texto">{prop?.titulo}</span><span className={"block mt-0.5 " + CODIGO}>{prop?.codigo}</span></td>
                    <td className="px-4 py-3.5"><ValorMensal id={s.id} valor={Number(s.valor_mensal)} /></td>
                    <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">dia {s.dia_vencimento}</td>
                    <td className="px-4 py-3.5">
                      <Etiqueta tom={TOM_SUB[s.status] ?? "neutro"}>{SUB_LABEL[s.status]}</Etiqueta>
                    </td>
                  </tr>
                );
              })}
              {!subs?.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-texto-2">Nenhuma assinatura — nascem ao publicar um imóvel.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Faturas">
        <div className={TABELA_CAIXA}>
          <table className={TABELA}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Imóvel</th>
                <th className={TH}>Competência</th>
                <th className={TH}>Valor</th>
                <th className={TH}>Status</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {(invoices ?? []).map((i) => {
                const sub = i.subscription as unknown as { property: { codigo: string } | null } | null;
                return (
                  <tr key={i.id} className={TR}>
                    <td className={"px-4 py-3.5 whitespace-nowrap " + CODIGO}>{sub?.property?.codigo}</td>
                    <td className="px-4 py-3.5 capitalize whitespace-nowrap">{new Date(i.competencia + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</td>
                    <td className="px-4 py-3.5 tabular-nums whitespace-nowrap font-semibold text-texto">{formatBRL(i.valor)}</td>
                    <td className="px-4 py-3.5">
                      <Etiqueta tom={TOM_FATURA[i.status] ?? "neutro"}>
                        {i.status}{i.pago_em ? ` em ${new Date(i.pago_em + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
                      </Etiqueta>
                      {i.gateway_id && <span className="ml-2 text-xs text-texto-2">Asaas</span>}
                    </td>
                    <td className="px-4 py-3.5">{i.status !== "paga" && <FaturaAcoes id={i.id} />}</td>
                  </tr>
                );
              })}
              {!invoices?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-texto-2">Nenhuma fatura — use “Gerar faturas do mês”.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  );
}
