import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setoresDe } from "@/lib/setores";

/**
 * Suporte ao vivo (roadmap 10.2).
 *
 * A conversa atualiza por polling curto (5 s, com `?since=`) dos dois lados.
 * Realtime do Supabase foi descartado de propósito: a publicação
 * `supabase_realtime` está vazia e a equipe lê os chamados pelo servidor (sem
 * policy de RLS para a equipe em support_messages); abrir isso para o
 * navegador seria aumentar a superfície só para ganhar alguns segundos.
 *
 * Presença = `profiles.visto_em`, atualizado a cada poll:
 *  - "atendente online": alguém do setor Suporte (ou a diretoria) visto nos
 *    últimos ONLINE_EQUIPE_MIN minutos;
 *  - "cliente online": o dono do chamado visto nos últimos ONLINE_CLIENTE_MIN
 *    minutos — se não estiver, a resposta da equipe vai também por e-mail.
 */
export const ONLINE_EQUIPE_MIN = 10;
export const ONLINE_CLIENTE_MIN = 2;
export const INTERVALO_POLL_MS = 5000;

/** Marca a última atividade da conta. Nunca lança. */
export async function marcarVisto(userId: string) {
  try {
    await supabaseAdmin().from("profiles").update({ visto_em: new Date().toISOString() }).eq("user_id", userId);
  } catch { /* presença é conveniência */ }
}

/** Há alguém do Suporte ativo nos últimos minutos? */
export async function atendenteOnline(): Promise<boolean> {
  const desde = new Date(Date.now() - ONLINE_EQUIPE_MIN * 60_000).toISOString();
  const { data } = await supabaseAdmin().from("profiles")
    .select("role, setores").in("role", ["admin_central", "analista_arini"])
    .eq("ativo", true).gte("visto_em", desde).limit(50);
  return (data ?? []).some((p) => setoresDe(p.role, p.setores as string[] | null).includes("suporte"));
}

/** A conta está com a página aberta agora? */
export async function usuarioOnline(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabaseAdmin().from("profiles").select("visto_em").eq("user_id", userId).maybeSingle();
  return !!data?.visto_em && Date.now() - new Date(data.visto_em).getTime() < ONLINE_CLIENTE_MIN * 60_000;
}

/** Chamados em aberto cuja última mensagem visível é do cliente. */
export async function chamadosEsperandoEquipe(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().rpc("fn_suporte_aguardando_equipe");
  if (error) return [];
  return ((data ?? []) as { ticket_id: string }[]).map((r) => r.ticket_id);
}

/** `since` válido da query string (ISO), ou null. */
export function lerSince(request: Request): string | null {
  const s = new URL(request.url).searchParams.get("since");
  // devolve o texto original: o created_at tem microssegundos e o Date do JS cortaria
  return s && s.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}
