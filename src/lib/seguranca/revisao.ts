import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setoresDe } from "@/lib/setores";

/**
 * Dados da revisão trimestral de acessos (item 6.13; requisito 8: "revisar
 * periodicamente permissões de usuários e administradores").
 *
 * Três listas, as que mais mudam o que alguém enxerga:
 *  · equipe da Matriz — papel, setores, último acesso, segundo fator;
 *  · contas externas com plano fora do padrão do nicho (dado pela Matriz ou
 *    por assinatura) — liberam recursos pagos;
 *  · parceiros com território (região) — base da segregação por franquia.
 */
export type MembroRevisao = {
  user_id: string; nome: string | null; email: string; role: string; setores: string[];
  ativo: boolean; mfa: boolean; ultimo: string | null;
};
export type PlanoEspecial = {
  user_id: string; nome: string | null; email: string; role: string; plan_id: string | null;
  plan_origem: string; plan_valido_ate: string | null; ultimo: string | null;
};
export type ParceiroTerritorio = {
  id: string; razao_social: string | null; tipo: string; status: string; regiao: string | null;
  nome: string | null; email: string; ultimo: string | null;
};

export async function carregarRevisao() {
  const admin = supabaseAdmin();
  const [{ data: equipe }, { data: especiais }, { data: parceiros }, usuarios] = await Promise.all([
    admin.from("profiles").select("user_id, nome, role, ativo, setores")
      .in("role", ["admin_central", "analista_arini"]).order("nome"),
    admin.from("profiles").select("user_id, nome, role, plan_id, plan_origem, plan_valido_ate")
      .not("role", "in", "(admin_central,analista_arini)").neq("plan_origem", "padrao").order("nome").limit(500),
    admin.from("partners").select("id, razao_social, tipo, status, profile_id, region:regions(nome), profile:profiles(nome)")
      .not("region_id", "is", null).order("razao_social").limit(500),
    listarUsuariosAuth(),
  ]);
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  const membros: MembroRevisao[] = (equipe ?? []).map((p) => {
    const u = porId.get(p.user_id);
    return {
      user_id: p.user_id, nome: p.nome, email: u?.email ?? "", role: p.role,
      setores: setoresDe(p.role, p.setores as string[] | null), ativo: p.ativo !== false,
      mfa: !!u?.mfa, ultimo: u?.ultimo ?? null,
    };
  });
  const planosEspeciais: PlanoEspecial[] = (especiais ?? []).map((p) => {
    const u = porId.get(p.user_id);
    return {
      user_id: p.user_id, nome: p.nome, email: u?.email ?? "", role: p.role, plan_id: p.plan_id,
      plan_origem: p.plan_origem, plan_valido_ate: p.plan_valido_ate, ultimo: u?.ultimo ?? null,
    };
  });
  const comTerritorio: ParceiroTerritorio[] = (parceiros ?? []).map((p) => {
    const u = porId.get(p.profile_id);
    const regiao = p.region as unknown as { nome: string } | null;
    const perfil = p.profile as unknown as { nome: string | null } | null;
    return {
      id: p.id, razao_social: p.razao_social, tipo: String(p.tipo), status: String(p.status),
      regiao: regiao?.nome ?? null, nome: perfil?.nome ?? null, email: u?.email ?? "", ultimo: u?.ultimo ?? null,
    };
  });
  return { equipe: membros, planosEspeciais, parceiros: comTerritorio };
}

/** E-mail, último acesso e segundo fator de todos (paginado, até 5.000 contas). */
async function listarUsuariosAuth() {
  const admin = supabaseAdmin();
  const saida: { id: string; email: string; ultimo: string | null; mfa: boolean }[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      saida.push({
        id: u.id, email: u.email ?? "", ultimo: u.last_sign_in_at ?? null,
        mfa: (u.factors ?? []).some((f) => f.status === "verified"),
      });
    }
    if (data.users.length < 500) break;
  }
  return saida;
}

/** Última revisão concluída (com o nome de quem revisou). */
export async function ultimaRevisao() {
  const admin = supabaseAdmin();
  const { data } = await admin.from("revisoes_acesso").select("id, revisado_por, observacoes, created_at")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const { data: p } = await admin.from("profiles").select("nome").eq("user_id", data.revisado_por).maybeSingle();
  return { ...data, nome: p?.nome ?? null };
}
