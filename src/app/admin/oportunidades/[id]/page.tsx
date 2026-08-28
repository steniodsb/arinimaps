import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import { ETAPA_LABEL } from "@/lib/funil";
import OportunidadeClient from "@/components/crm/OportunidadeClient";

export default async function OportunidadeAdmin({ params }: PageProps<"/admin/oportunidades/[id]">) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: opp } = await admin
    .from("opportunities")
    .select(`
      id, codigo, etapa, responsavel_tipo, responsavel_partner_id, partner_comprador_id,
      qualificacao, motivo_perda, created_at,
      lead:leads(nome, telefone, email, mensagem, origem, created_at),
      property:properties(id, codigo, titulo, tipo, status, valor, owner_id, partner_id,
        municipality:municipalities(nome))
    `)
    .eq("id", id)
    .single();
  if (!opp) notFound();

  const [{ data: eventos }, { data: visitas }, { data: propostas }, { data: contrato }, { data: venda }, { data: parceiros }, { data: pctPadrao }] = await Promise.all([
    admin.from("opportunity_events").select("id, tipo, descricao, created_at, autor:profiles(nome)").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("visits").select("id, data_hora, status, feedback").eq("opportunity_id", id).order("data_hora", { ascending: false }),
    admin.from("proposals").select("id, numero_rodada, autor_lado, valor, entrada, prazo, condicoes, observacoes, status, created_at").eq("opportunity_id", id).order("numero_rodada", { ascending: false }),
    admin.from("contracts").select("status, documento_path, assinado_at").eq("opportunity_id", id).maybeSingle(),
    admin.from("sales").select("id, valor_final, data_venda, commission:commissions(valor, percentual, status)").eq("opportunity_id", id).maybeSingle(),
    admin.from("partners").select("id, razao_social, tipo").in("status", ["aprovado", "ativo"]).order("razao_social"),
    admin.from("settings").select("valor").eq("chave", "comissao_percentual_padrao").single(),
  ]);

  const lead = opp.lead as unknown as { nome: string; telefone: string | null; email: string | null; mensagem: string | null; origem: string } | null;
  const prop = opp.property as unknown as { id: string; codigo: string; titulo: string; tipo: string; status: string; valor: number | null; municipality: { nome: string } | null } | null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-texto-2">{opp.codigo}</p>
          <h1 className="text-2xl font-semibold text-texto">{lead?.nome ?? "Oportunidade"}</h1>
          <p className="text-sm text-texto-2">
            {lead?.telefone && <span className="mr-3">📞 {lead.telefone}</span>}
            {lead?.email && <span className="mr-3">✉️ {lead.email}</span>}
            <span className="text-texto-2">origem: {lead?.origem}</span>
          </p>
          {lead?.mensagem && <p className="text-sm text-texto-2 mt-1">“{lead.mensagem}”</p>}
        </div>
        <div className="text-right space-y-1">
          <span className="inline-block rounded-full bg-ouro/20 text-ouro-escuro text-sm font-medium px-4 py-1.5">
            {ETAPA_LABEL[opp.etapa] ?? opp.etapa}
          </span>
          {prop && (
            <p className="text-xs text-texto-2">
              <Link className="text-verde hover:underline" href={`/admin/imoveis/${prop.id}`}>
                {prop.codigo} — {prop.titulo}
              </Link>
              <br />
              {prop.municipality?.nome} · {formatBRL(prop.valor)} · {STATUS_LABEL[prop.status]}
            </p>
          )}
        </div>
      </div>

      <OportunidadeClient
        modo="arini"
        oportunidade={{
          id: opp.id,
          etapa: opp.etapa,
          responsavel_tipo: opp.responsavel_tipo,
          responsavel_partner_id: opp.responsavel_partner_id,
          partner_comprador_id: opp.partner_comprador_id,
          motivo_perda: opp.motivo_perda,
          valor_imovel: prop?.valor ?? null,
        }}
        parceiros={parceiros ?? []}
        eventos={(eventos ?? []).map((e) => ({
          id: e.id, tipo: e.tipo, descricao: e.descricao, created_at: e.created_at,
          autor: (e.autor as unknown as { nome: string } | null)?.nome ?? null,
        }))}
        visitas={visitas ?? []}
        propostas={propostas ?? []}
        contrato={contrato ?? null}
        venda={venda ? {
          valor_final: venda.valor_final, data_venda: venda.data_venda,
          comissao: venda.commission as unknown as { valor: number; percentual: number; status: string } | null,
        } : null}
        percentualPadrao={Number(pctPadrao?.valor ?? 1)}
      />
    </div>
  );
}
