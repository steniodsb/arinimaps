import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { Filter, Handshake, Home, X } from "lucide-react";
import { CAMPO, CabecalhoPagina, Etiqueta, ROTULO } from "@/components/ui/Pagina";

const ENTIDADES = ["properties", "opportunities", "leads", "proposals", "visits", "contracts", "sales", "commissions", "invoices", "subscriptions", "partners", "owners", "settings", "profiles", "property_documents", "cartography_layers", "municipalities"];

export default async function AdminAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  await exigirSetor("seguranca", "diretoria");
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
    <div className="mx-auto max-w-[1280px] space-y-8">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Central · Segurança"
        titulo="Auditoria"
        subtitulo="Registro imutável de todas as ações: quem fez, o quê, quando e sobre qual imóvel/oportunidade."
      />

      <form className="cartao flex flex-wrap items-end gap-4 p-5" method="get">
        <label className="block w-full sm:w-64">
          <span className={ROTULO}>Entidade</span>
          <select name="entidade" defaultValue={entidade ?? ""} className={CAMPO}>
            <option value="">Todas as entidades</option>
            {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="block min-w-0 flex-1 sm:min-w-64">
          <span className={ROTULO}>Ação</span>
          <input name="acao" defaultValue={acao ?? ""} placeholder="Filtrar por ação (ex.: publicado)" className={CAMPO} />
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-verde inline-flex items-center gap-2 px-5 py-3 text-sm"><Filter className="size-4" /> Filtrar</button>
          {(entidade || acao) && <Link href="/admin/auditoria" className="inline-flex items-center gap-1.5 px-2 py-3 text-sm font-semibold text-verde hover:underline"><X className="size-4" /> limpar</Link>}
        </div>
      </form>

      <div className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[0.95rem]">
            <thead className="bg-superficie-2">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                <th className="px-5 py-3">Quando</th>
                <th className="px-5 py-3">Quem</th>
                <th className="px-5 py-3">Ação</th>
                <th className="px-5 py-3">Entidade</th>
                <th className="px-5 py-3">Vínculos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {(logs ?? []).map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-superficie-2/60">
                  <td className="px-5 py-3.5 text-sm tabular-nums text-texto-2 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-texto">{(l.usuario as unknown as { nome: string } | null)?.nome ?? "sistema"}</td>
                  <td className="px-5 py-3.5 font-mono text-sm text-texto">{l.acao}</td>
                  <td className="px-5 py-3.5"><Etiqueta tom="neutro" className="font-mono">{l.entidade}</Etiqueta></td>
                  <td className="px-5 py-3.5 text-sm">
                    <span className="flex flex-wrap gap-3">
                      {l.property_id && <Link className="inline-flex items-center gap-1 font-semibold text-verde hover:underline" href={`/admin/imoveis/${l.property_id}`}><Home className="size-3.5" /> imóvel</Link>}
                      {l.opportunity_id && <Link className="inline-flex items-center gap-1 font-semibold text-verde hover:underline" href={`/admin/oportunidades/${l.opportunity_id}`}><Handshake className="size-3.5" /> oportunidade</Link>}
                    </span>
                  </td>
                </tr>
              ))}
              {!logs?.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-base text-texto-2">Nada encontrado com esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
