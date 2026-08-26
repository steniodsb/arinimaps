import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/format";
import { ETAPA_LABEL } from "@/lib/funil";
import OportunidadeClient from "@/components/crm/OportunidadeClient";

export default async function OportunidadeParceiro({ params }: PageProps<"/painel/oportunidades/[id]">) {
  const { id } = await params;

  // RLS decide o acesso: se a query autenticada não devolver, é 404
  const supabase = await supabaseServer();
  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, codigo, etapa, responsavel_tipo, responsavel_partner_id, partner_comprador_id, motivo_perda")
    .eq("id", id)
    .maybeSingle();
  if (!opp) notFound();

  const admin = supabaseAdmin();
  const [{ data: detalhe }, { data: eventos }, { data: visitas }, { data: propostas }] = await Promise.all([
    admin.from("opportunities")
      .select("lead:leads(nome, telefone, email, mensagem), property:properties(codigo, titulo, valor)")
      .eq("id", id).single(),
    admin.from("opportunity_events").select("id, tipo, descricao, created_at, autor:profiles(nome)").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("visits").select("id, data_hora, status, feedback").eq("opportunity_id", id).order("data_hora", { ascending: false }),
    admin.from("proposals").select("id, numero_rodada, autor_lado, valor, entrada, prazo, condicoes, observacoes, status, created_at").eq("opportunity_id", id).order("numero_rodada", { ascending: false }),
  ]);

  const lead = detalhe?.lead as unknown as { nome: string; telefone: string | null; email: string | null; mensagem: string | null } | null;
  const prop = detalhe?.property as unknown as { codigo: string; titulo: string; valor: number | null } | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-foreground/50">{opp.codigo}</p>
          <h1 className="text-2xl font-semibold text-verde-escuro">{lead?.nome}</h1>
          <p className="text-sm text-foreground/70">
            {lead?.telefone && <span className="mr-3">📞 {lead.telefone}</span>}
            {lead?.email && <span>✉️ {lead.email}</span>}
          </p>
          {lead?.mensagem && <p className="text-sm text-foreground/60 mt-1">“{lead.mensagem}”</p>}
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full bg-ouro/20 text-ouro-escuro text-sm font-medium px-4 py-1.5">
            {ETAPA_LABEL[opp.etapa]}
          </span>
          <p className="text-xs text-foreground/60 mt-1">{prop?.codigo} — {prop?.titulo}<br />{formatBRL(prop?.valor ?? null)}</p>
        </div>
      </div>

      <OportunidadeClient
        modo="parceiro"
        oportunidade={{
          id: opp.id, etapa: opp.etapa, responsavel_tipo: opp.responsavel_tipo,
          responsavel_partner_id: opp.responsavel_partner_id, partner_comprador_id: opp.partner_comprador_id,
          motivo_perda: opp.motivo_perda, valor_imovel: prop?.valor ?? null,
        }}
        parceiros={[]}
        eventos={(eventos ?? []).map((e) => ({
          id: e.id, tipo: e.tipo, descricao: e.descricao, created_at: e.created_at,
          autor: (e.autor as unknown as { nome: string } | null)?.nome ?? null,
        }))}
        visitas={visitas ?? []}
        propostas={propostas ?? []}
        contrato={null}
        venda={null}
        percentualPadrao={1}
      />
    </div>
  );
}
