import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import { exigirSetor } from "@/lib/setores-servidor";

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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-texto">Imóveis</h1>
      <div className="flex gap-2 text-sm flex-wrap">
        {Object.keys(FILTROS).map((f) => (
          <Link key={f} href={`/admin/imoveis?filtro=${f}`}
            className={`rounded-full px-4 py-1.5 border capitalize ${f === chave ? "bg-verde text-white border-verde" : "border-linha bg-superficie hover:bg-superficie-2"}`}>
            {f === "analise" ? "Para analisar" : f}
          </Link>
        ))}
        <Link href="/admin/imoveis?revisao=1"
          className={`rounded-full px-4 py-1.5 border ${chave === "revisao" ? "bg-verde text-white border-verde" : "border-linha bg-superficie hover:bg-superficie-2"}`}>
          Alterações propostas{comRevisao.size ? ` (${comRevisao.size})` : ""}
        </Link>
      </div>

      {!imoveis?.length ? (
        <div className="cartao p-10 text-center text-texto-2">
          Nada aqui neste filtro.
        </div>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Município</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {imoveis.map((p) => (
                <tr key={p.id} className="hover:bg-superficie-2">
                  <td className="px-4 py-3 font-mono text-xs">{p.codigo}</td>
                  <td className="px-4 py-3 font-medium">{p.titulo}<span className="ml-2 text-xs text-texto-2 capitalize">({p.tipo})</span></td>
                  <td className="px-4 py-3">{(p.municipality as unknown as { nome: string } | null)?.nome ?? "—"}</td>
                  <td className="px-4 py-3">{formatBRL(p.valor)}</td>
                  <td className="px-4 py-3">
                    {STATUS_LABEL[p.status]}
                    {comRevisao.has(p.id) && (
                      <span className="ml-2 text-xs rounded-full bg-alerta/15 text-alerta px-2.5 py-0.5">alteração pendente</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/imoveis/${p.id}`} className="text-verde font-medium hover:underline">
                      Analisar →
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
