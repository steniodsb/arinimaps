import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { Indicadores, contar, equipeAtiva } from "@/components/admin/Painel";
import { lerConfiguracoes, numero } from "@/lib/settings";
import Demandas, { type DemandaLinha, type Prefill } from "./Demandas";
import { CircleCheck, Link2, MapPin, SearchX } from "lucide-react";
import { CabecalhoPagina } from "@/components/ui/Pagina";
import { aba } from "@/components/admin/estilos";

export const dynamic = "force-dynamic";

/**
 * Demandas sem imóvel (5.16 · Fluxograma §12). Quando o cliente não gostou de
 * nenhum imóvel, o Comercial registra o que ele procura. Ao publicar um
 * imóvel, `casarDemandas()` confere as demandas abertas e cria a tarefa
 * "Imóvel novo casa com demanda X" para o responsável.
 */
export default async function AdminDemandas({ searchParams }: PageProps<"/admin/demandas">) {
  const user = await exigirSetor("comercial");
  const sp = await searchParams;
  const filtro = typeof sp.situacao === "string" ? sp.situacao : "aberta";
  const destaque = typeof sp.d === "string" ? sp.d : null;
  const oppId = typeof sp.opp === "string" ? sp.opp : null;
  const admin = supabaseAdmin();

  let q = admin.from("demandas")
    .select("id, codigo, cliente_nome, cliente_contato, opportunity_id, tipo, municipios, area_min, area_max, valor_min, valor_max, observacoes, status, responsavel, fechada_em, motivo_fechamento, created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (filtro !== "todas") q = q.eq("status", filtro);

  const [{ data: demandas }, { data: municipios }, equipe, abertas, atendidas, { data: matches }, cfg] = await Promise.all([
    q,
    admin.from("municipalities").select("id, nome, uf").eq("ativo", true).order("nome"),
    equipeAtiva(),
    contar("demandas", (x) => x.eq("status", "aberta")),
    contar("demandas", (x) => x.eq("status", "atendida")),
    admin.from("demanda_matches").select("demanda_id, property_id, created_at, property:properties(codigo, titulo, status)")
      .order("created_at", { ascending: false }).limit(500),
    lerConfiguracoes(),
  ]);

  // "Registrar demanda" na oportunidade: já vem com cliente, tipo e município do imóvel
  let prefill: Prefill | null = null;
  if (oppId) {
    const { data: opp } = await admin.from("opportunities")
      .select("id, codigo, lead:leads(nome, telefone, email), property:properties(tipo, municipality_id, valor)").eq("id", oppId).maybeSingle();
    if (opp) {
      const lead = opp.lead as unknown as { nome: string; telefone: string | null; email: string | null } | null;
      const prop = opp.property as unknown as { tipo: string; municipality_id: string | null; valor: number | null } | null;
      prefill = {
        opportunity_id: opp.id, opportunity_codigo: opp.codigo,
        cliente_nome: lead?.nome ?? "", cliente_contato: [lead?.telefone, lead?.email].filter(Boolean).join(" · "),
        tipo: prop?.tipo ?? "", municipios: prop?.municipality_id ? [prop.municipality_id] : [],
      };
    }
  }

  const casamentos = new Map<string, { codigo: string; titulo: string; status: string; em: string }[]>();
  for (const m of matches ?? []) {
    const p = m.property as unknown as { codigo: string; titulo: string; status: string } | null;
    if (!p) continue;
    casamentos.set(m.demanda_id, [...(casamentos.get(m.demanda_id) ?? []), { ...p, em: m.created_at }]);
  }
  const linhas: DemandaLinha[] = (demandas ?? []).map((d) => ({ ...d, casamentos: casamentos.get(d.id) ?? [] }));

  return (
    <div className="space-y-8 max-w-5xl">
      <CabecalhoPagina eyebrow="Comercial" titulo="Demandas sem imóvel"
        subtitulo={<>
          O que o cliente procura quando nenhum imóvel serviu. Cada imóvel publicado é conferido contra as demandas
          abertas (tipo, município e faixas de valor e área, com folga de {numero(cfg, "demandas_tolerancia_pct", 10)}% —
          ajuste em Configurações › Regras comerciais); quando casa, vira tarefa do Comercial e e-mail ao responsável.
        </>} />
      <Indicadores itens={[
        { rotulo: "Abertas", icone: SearchX, valor: abertas, destaque: abertas > 0 },
        { rotulo: "Atendidas", icone: CircleCheck, valor: atendidas },
        { rotulo: "Casamentos encontrados", icone: Link2, valor: (matches ?? []).length },
        { rotulo: "Municípios atendidos", icone: MapPin, valor: (municipios ?? []).length },
      ]} />
      <div className="flex flex-wrap gap-2">
        {[["aberta", "Abertas"], ["atendida", "Atendidas"], ["cancelada", "Canceladas"], ["todas", "Todas"]].map(([v, l]) => (
          <Link key={v} href={`/admin/demandas?situacao=${v}`} className={aba(filtro === v)}>{l}</Link>
        ))}
      </div>
      <Demandas
        demandas={linhas} municipios={municipios ?? []} equipe={equipe} souEu={user.id}
        prefill={prefill} destaque={destaque}
      />
    </div>
  );
}
