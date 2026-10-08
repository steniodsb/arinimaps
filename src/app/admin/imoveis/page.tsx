import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import { exigirSetor } from "@/lib/setores-servidor";
import { ArrowRight, Building2, GitCompareArrows } from "lucide-react";
import { CabecalhoPagina, Etiqueta, Vazio } from "@/components/ui/Pagina";
import { aba, CODIGO, TABELA, TABELA_CAIXA, TBODY, TH, THEAD, TR } from "@/components/admin/estilos";

const FILTROS: Record<string, string[]> = {
  analise: ["pendente", "em_analise", "correcao"],
  ativos: ["aprovado", "publicado", "em_negociacao"],
  vendidos: ["vendido", "historico"],
  outros: ["rascunho", "suspenso", "inativo", "reprovado"],
};

export default async function AdminImoveis({ searchParams }: PageProps<"/admin/imoveis">) {
  await exigirSetor("operacoes");
  const { filtro, revisao } = await searchParams;
  const admin = supabaseAdmin();
  // Fluxograma §9: anúncios com alteração proposta aguardando decisão
  const { data: pendentes } = await admin.from("property_revisions").select("property_id").eq("status", "pendente");
  const comRevisao = new Set((pendentes ?? []).map((r) => r.property_id));
  const soRevisao = revisao === "1";
  const chave = soRevisao ? "revisao" : typeof filtro === "string" && FILTROS[filtro] ? filtro : "analise";

  let consulta = admin
    .from("properties")
    .select("id, codigo, titulo, tipo, status, valor, created_at, municipality:municipalities(nome)");
  consulta = soRevisao
    ? consulta.in("id", comRevisao.size ? [...comRevisao] : ["00000000-0000-0000-0000-000000000000"])
    : consulta.in("status", FILTROS[chave]);
  const { data: imoveis } = await consulta.order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <CabecalhoPagina eyebrow="Operações" titulo="Imóveis"
        subtitulo="Fila de análise, anúncios ativos e o histórico de cada imóvel." />
      <div className="flex gap-2 flex-wrap">
        {Object.keys(FILTROS).map((f) => (
          <Link key={f} href={`/admin/imoveis?filtro=${f}`} className={aba(f === chave) + " capitalize"}>
            {f === "analise" ? "Para analisar" : f}
          </Link>
        ))}
        <Link href="/admin/imoveis?revisao=1" className={aba(chave === "revisao")}>
          <GitCompareArrows className="size-4" />
          Alterações propostas{comRevisao.size ? ` (${comRevisao.size})` : ""}
        </Link>
      </div>

      {!imoveis?.length ? (
        <Vazio icone={Building2} titulo="Nada aqui neste filtro" />
      ) : (
        <div className={TABELA_CAIXA}>
          <table className={TABELA}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Código</th>
                <th className={TH}>Imóvel</th>
                <th className={TH}>Município</th>
                <th className={TH}>Valor</th>
                <th className={TH}>Status</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {imoveis.map((p) => (
                <tr key={p.id} className={TR}>
                  <td className={"px-4 py-3.5 whitespace-nowrap " + CODIGO}>{p.codigo}</td>
                  <td className="px-4 py-3.5 font-medium text-texto">{p.titulo}<span className="ml-2 text-xs font-normal text-texto-2 capitalize">({p.tipo})</span></td>
                  <td className="px-4 py-3.5">{(p.municipality as unknown as { nome: string } | null)?.nome ?? "—"}</td>
                  <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">{formatBRL(p.valor)}</td>
                  <td className="px-4 py-3.5">
                    <span className="flex flex-wrap gap-1.5">
                      <Etiqueta tom={["publicado", "aprovado", "em_negociacao"].includes(p.status) ? "verde" : ["pendente", "em_analise"].includes(p.status) ? "ouro" : p.status === "correcao" ? "alerta" : p.status === "reprovado" ? "critico" : "neutro"}>
                        {STATUS_LABEL[p.status]}
                      </Etiqueta>
                      {comRevisao.has(p.id) && <Etiqueta tom="alerta">alteração pendente</Etiqueta>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link href={`/admin/imoveis/${p.id}`} className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-verde hover:underline underline-offset-4">
                      Analisar <ArrowRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
