import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ENTIDADES = ["properties", "opportunities", "leads", "proposals", "visits", "contracts", "sales", "commissions", "invoices", "subscriptions", "partners", "owners", "settings", "profiles", "property_documents", "cartography_layers", "municipalities"];

export default async function AdminAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  const sp = await searchParams;
  const entidade = typeof sp.entidade === "string" && ENTIDADES.includes(sp.entidade) ? sp.entidade : null;
  const acao = typeof sp.acao === "string" && sp.acao ? sp.acao : null;

  const admin = supabaseAdmin();
  let q = admin.from("audit_log")
    .select("id, acao, entidade, entidade_id, property_id, opportunity_id, created_at, usuario:profiles(nome)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (entidade) q = q.eq("entidade", entidade);
  if (acao) q = q.ilike("acao", `%${acao}%`);
  const { data: logs } = await q;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Auditoria</h1>
        <p className="text-sm text-texto-2">Registro imutável de todas as ações: quem fez, o quê, quando e sobre qual imóvel/oportunidade.</p>
      </div>

      <form className="flex gap-2 flex-wrap text-sm" method="get">
        <select name="entidade" defaultValue={entidade ?? ""} className="rounded-lg cartao px-3 py-2">
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input name="acao" defaultValue={acao ?? ""} placeholder="Filtrar por ação (ex.: publicado)"
          className="rounded-lg cartao px-3 py-2" />
        <button className="rounded-lg bg-verde text-white px-4 py-2 font-medium hover:bg-verde-escuro">Filtrar</button>
        {(entidade || acao) && <Link href="/admin/auditoria" className="px-3 py-2 text-verde hover:underline">limpar</Link>}
      </form>

      <div className="cartao overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Quem</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Entidade</th>
              <th className="px-4 py-3">Vínculos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-xs tabular-nums text-texto-2 whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-2.5">{(l.usuario as unknown as { nome: string } | null)?.nome ?? "sistema"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{l.acao}</td>
                <td className="px-4 py-2.5 text-xs">{l.entidade}</td>
                <td className="px-4 py-2.5 text-xs space-x-2">
                  {l.property_id && <Link className="text-verde hover:underline" href={`/admin/imoveis/${l.property_id}`}>imóvel</Link>}
                  {l.opportunity_id && <Link className="text-verde hover:underline" href={`/admin/oportunidades/${l.opportunity_id}`}>oportunidade</Link>}
                </td>
              </tr>
            ))}
            {!logs?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-texto-2">Nada encontrado com esse filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
