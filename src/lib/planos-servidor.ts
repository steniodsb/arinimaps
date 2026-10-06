import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { ipDoPedido } from "@/lib/seguranca/limite";
import { ACESSO_VISITANTE, montarAcesso, recursoPorId, type Acesso, type Plano, type RecursoId } from "@/lib/planos";

/**
 * A trava dos planos, no servidor.
 *
 * Fluxograma §20: LOGIN → CARREGA PERMISSÕES → TENTA ACESSAR RECURSO → TEM
 * PERMISSÃO? SIM → ACESSA · NÃO → BLOQUEIA → REGISTRA TENTATIVA. Toda negação
 * cai em `access_attempts`; a tela de Segurança da Central lê de lá.
 */

export async function carregarPlano(planId: string | null | undefined): Promise<Plano | null> {
  if (!planId) return null;
  const { data } = await supabaseAdmin().from("plans").select("*").eq("id", planId).maybeSingle();
  return (data as Plano | null) ?? null;
}

/** Acesso resolvido de um usuário (plano + papel). Sem usuário = visitante. */
export async function acessoDe(userId: string | null | undefined): Promise<Acesso> {
  if (!userId) return ACESSO_VISITANTE;
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles")
    .select("role, nicho, plan_id, plan_valido_ate, ativo").eq("user_id", userId).maybeSingle();
  if (!p || p.ativo === false) return ACESSO_VISITANTE;
  const plano = await carregarPlano(p.plan_id);
  return montarAcesso(p.role, plano, p.nicho, p.plan_valido_ate);
}

/** Acesso de quem está na sessão atual (páginas). */
export async function acessoAtual(): Promise<{ userId: string | null; acesso: Acesso }> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, acesso: await acessoDe(user?.id) };
}

export type Negacao = { codigo: "sem_sessao" | "sem_plano" | "cota_esgotada"; mensagem: string; solucao: string };

/** Registra a tentativa negada (append-only). Nunca lança. */
export async function registrarTentativa(dados: {
  request?: Request | null; userId?: string | null; role?: string | null; planId?: string | null;
  recurso: string; motivo: string;
}) {
  try {
    await supabaseAdmin().from("access_attempts").insert({
      user_id: dados.userId ?? null, role: dados.role ?? null, plan_id: dados.planId ?? null,
      recurso: dados.recurso, motivo: dados.motivo,
      rota: dados.request ? new URL(dados.request.url).pathname : null,
      ip: dados.request ? ipDoPedido(dados.request) : null,
    });
  } catch (e) {
    console.error("access_attempts falhou:", e);
  }
}

/** Quantas consultas de área a conta já fez no mês corrente. */
export async function consultasAreaNoMes(userId: string): Promise<number> {
  const inicio = new Date();
  inicio.setDate(1); inicio.setHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin().from("consultas_area_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("acao", "consulta").gte("created_at", inicio.toISOString());
  return count ?? 0;
}

/** Imóveis da conta em análise ou publicados (cota `imoveis_ativos`). */
export async function imoveisAtivosDe(userId: string): Promise<number> {
  const admin = supabaseAdmin();
  const [{ data: owner }, { data: partner }] = await Promise.all([
    admin.from("owners").select("id").eq("profile_id", userId).maybeSingle(),
    admin.from("partners").select("id").eq("profile_id", userId).maybeSingle(),
  ]);
  if (!owner && !partner) return 0;
  let q = admin.from("properties").select("id", { count: "exact", head: true })
    .in("status", ["pendente", "em_analise", "correcao", "aprovado", "publicado", "em_negociacao"]);
  q = owner ? q.eq("owner_id", owner.id) : q.eq("partner_id", partner!.id);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Confere um recurso e, se houver cota, o consumo do mês. Devolve a negação
 * (já registrada) ou null quando pode seguir. Para rotas de API.
 */
export async function conferirRecurso(
  request: Request | null,
  user: { id: string; role: string } | null,
  recurso: RecursoId,
  opcoes: { cota?: "consultas_area_mes" | "imoveis_ativos" } = {}
): Promise<{ acesso: Acesso; negacao: Negacao | null }> {
  const acesso = await acessoDe(user?.id);
  const nome = recursoPorId(recurso)?.nome ?? recurso;

  if (!acesso.recursos.has(recurso)) {
    const negacao: Negacao = !user
      ? { codigo: "sem_sessao", mensagem: `Entre na sua conta para usar “${nome}”.`, solucao: "Crie uma conta gratuita ou entre com a sua." }
      : { codigo: "sem_plano", mensagem: `“${nome}” não está no seu plano${acesso.planNome ? ` (${acesso.planNome})` : ""}.`,
          solucao: "Veja os planos em /planos ou fale com a Arini para liberar." };
    await registrarTentativa({ request, userId: user?.id, role: user?.role, planId: acesso.planId, recurso, motivo: negacao.codigo });
    return { acesso, negacao };
  }

  if (opcoes.cota && user && !acesso.equipe && acesso.cotas[opcoes.cota] != null) {
    const limite = Number(acesso.cotas[opcoes.cota]);
    const usado = opcoes.cota === "consultas_area_mes" ? await consultasAreaNoMes(user.id) : await imoveisAtivosDe(user.id);
    if (usado >= limite) {
      const negacao: Negacao = {
        codigo: "cota_esgotada",
        mensagem: opcoes.cota === "consultas_area_mes"
          ? `Você já usou as ${limite} consultas de área do mês no plano ${acesso.planNome}.`
          : `Seu plano ${acesso.planNome} permite ${limite} imóveis ativos ao mesmo tempo.`,
        solucao: "Fale com a Arini para ampliar o plano ou aguarde o próximo mês.",
      };
      await registrarTentativa({ request, userId: user.id, role: user.role, planId: acesso.planId, recurso, motivo: `cota:${opcoes.cota}` });
      return { acesso, negacao };
    }
  }
  return { acesso, negacao: null };
}

/** Resposta HTTP padronizada para uma negação. */
export function respostaNegacao(n: Negacao) {
  return NextResponse.json(
    { error: n.mensagem, solucao: n.solucao, codigo: n.codigo },
    { status: n.codigo === "sem_sessao" ? 401 : 403 }
  );
}
