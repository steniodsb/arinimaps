import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { setoresDe, type SetorId } from "@/lib/setores";
import { registrarTentativa } from "@/lib/planos-servidor";

/**
 * Trava de página por setor. Chamada no topo de cada tela da Central: quem não
 * é da equipe vai para o login; quem é da equipe mas não atua no setor volta
 * para a Matriz com o aviso. É aqui (e nas rotas de API, com temSetor) que a
 * permissão vale — o menu só deixa de mostrar o que a pessoa não usa.
 */
export async function exigirSetor(...setores: SetorId[]) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) {
    // fluxograma §20: bloqueia E registra a tentativa
    await registrarTentativa({ userId: user.id, role: user.role, recurso: `setor:${setores[0]}`, motivo: "sem_equipe" });
    redirect("/");
  }
  const meus = setoresDe(user.role, user.setores);
  if (!setores.some((s) => meus.includes(s))) {
    await registrarTentativa({ userId: user.id, role: user.role, recurso: `setor:${setores[0]}`, motivo: "sem_setor" });
    redirect(`/admin?sem_acesso=${setores[0]}`);
  }
  return { ...user, setores: meus };
}

/** Membro da equipe, em qualquer setor (Matriz, tarefas). */
export async function exigirEquipe() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) redirect("/");
  return { ...user, setores: setoresDe(user.role, user.setores) };
}
