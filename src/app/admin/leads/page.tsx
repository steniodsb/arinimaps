import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ETAPA_LABEL } from "@/lib/funil";

export default async function AdminLeads() {
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Leads e oportunidades</h1>
        <p className="text-sm text-texto-2">
          Todo interesse vira uma oportunidade com ID único. Abra a oportunidade para qualificar, encaminhar,
          agendar visita, registrar propostas e fechar a venda — ou acompanhe tudo pelo Funil comercial.
        </p>
      </div>

      {!opps?.length ? (
        <div className="cartao p-10 text-center text-texto-2">
          Nenhum lead ainda. Quando alguém clicar em “Tenho interesse”, aparece aqui na hora.
        </div>
      ) : (
        <div className="space-y-3">
          {opps.map((o) => {
            const lead = o.lead as unknown as { nome: string; telefone: string | null; email: string | null; mensagem: string | null; origem: string } | null;
            const prop = o.property as unknown as { codigo: string; titulo: string } | null;
            return (
              <div key={o.id} className="cartao p-4 flex flex-wrap gap-3 items-start">
                <span className="font-mono text-xs bg-superficie-2 rounded px-2 py-1">{o.codigo}</span>
                <div className="flex-1 min-w-52">
                  <p className="font-medium">{lead?.nome ?? "—"}</p>
                  <p className="text-sm text-texto-2">
                    {lead?.telefone && <span className="mr-3">📞 {lead.telefone}</span>}
                    {lead?.email && <span>✉️ {lead.email}</span>}
                  </p>
                  {lead?.mensagem && <p className="text-sm text-texto-2 mt-1">“{lead.mensagem}”</p>}
                  <p className="text-xs text-texto-2 mt-1">
                    Imóvel: <span className="font-mono">{prop?.codigo}</span> — {prop?.titulo}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <span className="inline-block text-xs rounded-full bg-ouro/20 text-ouro-escuro px-3 py-1 font-medium">
                    {ETAPA_LABEL[o.etapa] ?? o.etapa}
                  </span>
                  <p className="text-xs text-texto-2">
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </p>
                  <Link href={`/admin/oportunidades/${o.id}`}
                    className="inline-block text-xs text-verde font-medium hover:underline">
                    Abrir oportunidade →
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
