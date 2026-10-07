import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerConfiguracoes } from "@/lib/settings";
import { acessoDe } from "@/lib/planos-servidor";
import { iaConfigurada } from "@/lib/ia/config";
import type { Acesso } from "@/lib/planos";

/** Mensagens enviadas pela conta ao assistente no mês corrente (cota `mensagens_ia_mes`). */
export async function mensagensIaNoMes(userId: string) {
  const inicio = new Date();
  inicio.setDate(1); inicio.setHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin().from("ia_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("papel", "user").gte("created_at", inicio.toISOString());
  return count ?? 0;
}

/** Limite mensal do plano (null = sem limite: plano sem a cota ou equipe da Matriz). */
export function limiteMensalIa(acesso: Acesso) {
  if (acesso.equipe) return null;
  const v = acesso.cotas?.mensagens_ia_mes;
  return v == null ? null : Number(v);
}

export type EstadoIa = {
  /** chave instalada e função ligada pela Diretoria */
  ligado: boolean;
  motivo?: "sem_chave" | "desligado";
  sessao: boolean;
  permitido: boolean;
  negacao?: { mensagem: string; solucao: string };
  cota?: { limite: number; usado: number } | null;
};

/** O que o botão do assistente deve mostrar para esta conta (não registra tentativa). */
export async function estadoIa(userId: string | null): Promise<EstadoIa> {
  if (!iaConfigurada()) return { ligado: false, motivo: "sem_chave", sessao: !!userId, permitido: false };
  const cfg = await lerConfiguracoes();
  if (cfg.ia_chat_ativo === false) return { ligado: false, motivo: "desligado", sessao: !!userId, permitido: false };
  if (!userId) {
    return { ligado: true, sessao: false, permitido: false,
      negacao: { mensagem: "Entre na sua conta para conversar com o assistente.", solucao: "A conta gratuita já inclui algumas perguntas por mês." } };
  }
  const acesso = await acessoDe(userId);
  if (!acesso.recursos.has("chat_ia")) {
    return { ligado: true, sessao: true, permitido: false,
      negacao: { mensagem: `O assistente não está no seu plano${acesso.planNome ? ` (${acesso.planNome})` : ""}.`, solucao: "Veja os planos em /planos ou fale com a Arini." } };
  }
  const limite = limiteMensalIa(acesso);
  return { ligado: true, sessao: true, permitido: true, cota: limite == null ? null : { limite, usado: await mensagensIaNoMes(userId) } };
}
