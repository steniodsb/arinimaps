import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";

export default async function MinhasOportunidades() {
  const supabase = await supabaseServer();
  // RLS: só vêm as oportunidades encaminhadas a este parceiro/proprietário
  const { data: opps } = await supabase
    .from("opportunities")
    .select(`
      id, codigo, etapa, created_at,
      lead:leads(nome, telefone),
      property:properties(codigo, titulo, valor)
    `)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-verde-escuro">Minhas oportunidades</h1>
        <p className="text-sm text-foreground/60">
          Leads que a Arini encaminhou para você atender. Registre contatos, visitas e propostas — a Arini acompanha tudo.
        </p>
      </div>

      {!opps?.length ? (
        <div className="rounded-xl border border-linha bg-white p-10 text-center text-foreground/60">
          Nenhuma oportunidade encaminhada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {opps.map((o) => {
            const lead = o.lead as unknown as { nome: string; telefone: string | null } | null;
            const prop = o.property as unknown as { codigo: string; titulo: string; valor: number | null } | null;
            return (
              <Link key={o.id} href={`/painel/oportunidades/${o.id}`}
                className="block rounded-xl border border-linha bg-white p-4 hover:shadow transition">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs bg-areia rounded px-2 py-1">{o.codigo}</span>
                  <span className="font-medium flex-1">{lead?.nome}</span>
                  <span className="text-xs rounded-full bg-ouro/20 text-ouro-escuro px-3 py-1">{ETAPA_LABEL[o.etapa]}</span>
                </div>
                <p className="text-sm text-foreground/60 mt-1">
                  {prop?.titulo} · {formatBRL(prop?.valor ?? null)}
                  {lead?.telefone && ` · 📞 ${lead.telefone}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
