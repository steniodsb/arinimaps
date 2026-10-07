import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setoresDe, type SetorId } from "@/lib/setores";
import { montarAcesso, type Acesso, type Plano, type RecursoId } from "@/lib/planos";
import { planoDaOrganizacao } from "@/lib/organizacoes-servidor";

export type Ator = {
  userId: string;
  role: string;
  ehArini: boolean;
  partnerId: string | null;
  ownerId: string | null;
  /** setores da Matriz em que o membro da equipe atua (diretoria: todos) */
  setores: SetorId[];
  /** nicho comercial da conta (planos por nicho, 05/10/2026) */
  nicho: string | null;
  /** plano + recursos já resolvidos; a equipe tem tudo pelo papel */
  acesso: Acesso;
};

/** O ator tem este recurso no plano (ou é da equipe)? */
export function temRecurso(a: Ator | null | undefined, recurso: RecursoId) {
  return !!a?.acesso.recursos.has(recurso);
}

/** O ator é da equipe e atua neste setor? Diretoria atua em todos. */
export function temSetor(a: Ator | null | undefined, ...setores: SetorId[]) {
  return !!a?.ehArini && setores.some((s) => a.setores.includes(s));
}

/** Usuário logado + vínculos (partner/owner). null = sem sessão. */
export async function ator(): Promise<Ator | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles")
    .select("role, setores, ativo, nicho, plan_id, plan_valido_ate, plan_origem").eq("user_id", user.id).single();
  if (!profile || profile.ativo === false) return null;
  const equipe = ["admin_central", "analista_arini"].includes(profile.role);
  const [{ data: partner }, { data: owner }, { data: planoPessoal }, daOrg] = await Promise.all([
    admin.from("partners").select("id").eq("profile_id", user.id).maybeSingle(),
    admin.from("owners").select("id").eq("profile_id", user.id).maybeSingle(),
    profile.plan_id ? admin.from("plans").select("*").eq("id", profile.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    // 5.9: plano da organização vale quando o pessoal é o padrão do nicho (docs/PLANOS.md §10)
    !equipe && (profile.plan_origem ?? "padrao") === "padrao" ? planoDaOrganizacao(user.id) : Promise.resolve(null),
  ]);
  const plano = daOrg?.plano ?? planoPessoal;
  const validoAte = daOrg ? daOrg.validoAte : (profile.plan_valido_ate as string | null);
  return {
    userId: user.id,
    role: profile.role,
    ehArini: ["admin_central", "analista_arini"].includes(profile.role),
    setores: ["admin_central", "analista_arini"].includes(profile.role)
      ? setoresDe(profile.role, profile.setores as string[] | null)
      : [],
    partnerId: partner?.id ?? null,
    ownerId: owner?.id ?? null,
    nicho: (profile.nicho as string | null) ?? null,
    acesso: montarAcesso(profile.role, (plano as Plano | null) ?? null, profile.nicho as string | null, validoAte),
  };
}

/** Pode operar esta oportunidade? Arini sempre; parceiro A/B; proprietário quando encaminhada a ele. */
export async function podeOperarOportunidade(a: Ator, opportunityId: string) {
  if (a.ehArini) return true;
  const admin = supabaseAdmin();
  const { data: opp } = await admin
    .from("opportunities")
    .select("responsavel_tipo, responsavel_partner_id, partner_comprador_id, property:properties(owner_id)")
    .eq("id", opportunityId)
    .single();
  if (!opp) return false;
  if (a.partnerId && [opp.responsavel_partner_id, opp.partner_comprador_id].includes(a.partnerId)) return true;
  const prop = opp.property as unknown as { owner_id: string | null } | null;
  if (a.ownerId && opp.responsavel_tipo === "proprietario" && prop?.owner_id === a.ownerId) return true;
  return false;
}
