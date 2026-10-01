import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { setoresDe, type SetorId } from "@/lib/setores";

/**
 * Trava de página por setor. Chamada no topo de cada tela da Central: quem não
 * é da equipe vai para o login; quem é da equipe mas não atua no setor volta
 * para a Matriz com o aviso. É aqui (e nas rotas de API, com temSetor) que a
 * permissão vale — o menu só deixa de mostrar o que a pessoa não usa.
 */
export async function exigirSetor(...setores: SetorId[]) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) redirect("/");
  const meus = setoresDe(user.role, user.setores);
  if (!setores.some((s) => meus.includes(s))) redirect(`/admin?sem_acesso=${setores[0]}`);
  return { ...user, setores: meus };
}

/** Membro da equipe, em qualquer setor (Matriz, tarefas). */
export async function exigirEquipe() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) redirect("/");
  return { ...user, setores: setoresDe(user.role, user.setores) };
}
