import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA_LABEL } from "@/lib/funil";
import { exigirSetor } from "@/lib/setores-servidor";
import { ArrowRight, Building2, Filter, Mail, Phone, Users } from "lucide-react";
import { BotaoLink, CabecalhoPagina, Etiqueta, Vazio } from "@/components/ui/Pagina";
import { CODIGO, LISTA } from "@/components/admin/estilos";

export default async function AdminLeads() {
  await exigirSetor("comercial");
  const { data: opps } = await supabaseAdmin()
    .from("opportunities")
    .select(`
      id, codigo, etapa, created_at,
      lead:leads(nome, telefone, email, mensagem, origem),
      property:properties(codigo, titulo)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <CabecalhoPagina eyebrow="Comercial" titulo="Leads e oportunidades"
        subtitulo={<>Todo interesse vira uma oportunidade com ID único. Abra a oportunidade para qualificar, encaminhar,
          agendar visita, registrar propostas e fechar a venda — ou acompanhe tudo pelo Funil comercial.</>}
        acoes={<BotaoLink href="/admin/funil" variante="contorno" seta={false}><Filter /> Funil comercial</BotaoLink>} />

      {!opps?.length ? (
        <Vazio icone={Users} titulo="Nenhum lead ainda"
          texto="Quando alguém clicar em “Tenho interesse”, aparece aqui na hora." />
      ) : (
        <div className={LISTA}>
          {opps.map((o) => {
            const lead = o.lead as unknown as { nome: string; telefone: string | null; email: string | null; mensagem: string | null; origem: string } | null;
            const prop = o.property as unknown as { codigo: string; titulo: string } | null;
            return (
              <div key={o.id} className="flex flex-wrap items-start gap-x-5 gap-y-3 px-5 py-4 transition-colors hover:bg-superficie-2/70">
                <div className="flex-1 min-w-60">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="lp-display text-lg text-texto">{lead?.nome ?? "—"}</span>
                    <span className={CODIGO}>{o.codigo}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-2">
                    {lead?.telefone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{lead.telefone}</span>}
                    {lead?.email && <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{lead.email}</span>}
                  </p>
                  {lead?.mensagem && <p className="mt-2 text-[0.95rem] leading-relaxed text-texto-2">“{lead.mensagem}”</p>}
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-texto-2">
                    <Building2 className="size-3.5 shrink-0" />
                    <span className="font-mono text-xs">{prop?.codigo}</span> — {prop?.titulo}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Etiqueta tom="ouro">{ETAPA_LABEL[o.etapa] ?? o.etapa}</Etiqueta>
                  <p className="text-xs text-texto-2 tabular-nums">
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </p>
                  <Link href={`/admin/oportunidades/${o.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-verde hover:underline underline-offset-4">
                    Abrir oportunidade <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
