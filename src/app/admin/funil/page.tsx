import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPAS, ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";

export default async function AdminFunil() {
  const { data: opps } = await supabaseAdmin()
    .from("opportunities")
    .select(`
      id, codigo, etapa, responsavel_tipo, created_at,
      lead:leads(nome),
      property:properties(codigo, titulo, valor),
      partner:partners!opportunities_responsavel_partner_id_fkey(razao_social)
    `)
    .order("created_at", { ascending: true });

  const colunas = [...ETAPAS, "perdido"] as string[];
  const porEtapa = new Map<string, NonNullable<typeof opps>>(colunas.map((e) => [e, []]));
  for (const o of opps ?? []) porEtapa.get(o.etapa)?.push(o);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Funil comercial</h1>
        <p className="text-sm text-texto-2">Clique no card para abrir a oportunidade completa (timeline, visitas, propostas, contrato, venda).</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map((etapa) => {
          const cards = porEtapa.get(etapa) ?? [];
          if (etapa === "perdido" && !cards.length) return null;
          return (
            <div key={etapa} className="w-60 shrink-0">
              <div className={`rounded-t-lg px-3 py-2 text-xs font-semibold flex justify-between ${etapa === "perdido" ? "bg-critico/15 text-critico" : etapa === "fechado" || etapa === "pos_venda" ? "bg-verde text-white" : "bg-verde-escuro text-white"}`}>
                {ETAPA_LABEL[etapa]}
                <span className="tabular-nums">{cards.length}</span>
              </div>
              <div className="bg-superficie-2 rounded-b-lg p-2 space-y-2 min-h-24">
                {cards.map((o) => {
                  const lead = o.lead as unknown as { nome: string } | null;
                  const prop = o.property as unknown as { codigo: string; titulo: string; valor: number | null } | null;
                  const partner = o.partner as unknown as { razao_social: string } | null;
                  return (
                    <Link key={o.id} href={`/admin/oportunidades/${o.id}`}
                      className="block rounded-lg bg-superficie border border-linha p-3 hover:shadow transition space-y-1">
                      <p className="font-mono text-[10px] text-texto-2">{o.codigo}</p>
                      <p className="text-sm font-medium leading-snug">{lead?.nome ?? "—"}</p>
                      <p className="text-xs text-texto-2 leading-snug">{prop?.titulo}</p>
                      <p className="text-xs text-verde font-medium">{formatBRL(prop?.valor ?? null)}</p>
                      <p className="text-[10px] text-texto-2">
                        {o.responsavel_tipo === "arini" ? "Arini" : o.responsavel_tipo === "proprietario" ? "Proprietário" : partner?.razao_social ?? "Parceiro"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
