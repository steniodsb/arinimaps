import Link from "next/link";
import { Handshake, Phone, ArrowRight, Building2 } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { ETAPA_LABEL } from "@/lib/funil";
import { formatBRL } from "@/lib/format";
import { Secao, Vazio, Etiqueta } from "@/components/ui/Pagina";

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
    <Secao
      eyebrow="Atendimento"
      titulo="Minhas oportunidades"
      subtitulo="Leads que a Arini encaminhou para você atender. Registre contatos, visitas e propostas — a Arini acompanha tudo."
    >
      {!opps?.length ? (
        <Vazio icone={Handshake} titulo="Nenhuma oportunidade encaminhada ainda"
          texto="Quando um interessado chegar pela plataforma para um imóvel seu, ele aparece aqui." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {opps.map((o) => {
            const lead = o.lead as unknown as { nome: string; telefone: string | null } | null;
            const prop = o.property as unknown as { codigo: string; titulo: string; valor: number | null } | null;
            return (
              <Link key={o.id} href={`/painel/oportunidades/${o.id}`}
                className="cartao cartao-link group block p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-xs text-texto-2">{o.codigo}</span>
                  <Etiqueta tom="ouro" className="ml-auto">{ETAPA_LABEL[o.etapa]}</Etiqueta>
                </div>
                <p className="lp-display mt-3 text-xl text-texto group-hover:text-verde transition-colors">{lead?.nome}</p>
                <p className="mt-3 flex items-start gap-2 text-base text-texto-2">
                  <Building2 className="mt-1 size-4 shrink-0" />
                  <span>{prop?.titulo} · <span className="tabular-nums">{formatBRL(prop?.valor ?? null)}</span></span>
                </p>
                {lead?.telefone && (
                  <p className="mt-1.5 flex items-center gap-2 text-base text-texto-2">
                    <Phone className="size-4 shrink-0" /> {lead.telefone}
                  </p>
                )}
                <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-verde">
                  Abrir atendimento <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Secao>
  );
}
