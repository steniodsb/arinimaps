import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ipDoPedido } from "./limite";

export type EventoAuth =
  | "login_ok" | "login_falhou" | "login_bloqueado" | "logout"
  | "recuperacao_pedida" | "senha_redefinida" | "senha_alterada"
  | "mfa_ativado" | "mfa_desativado" | "mfa_ok" | "mfa_falhou"
  | "sessoes_encerradas";

/** Registra um evento de autenticação (auth_events, append-only). Nunca lança. */
export async function registrarEvento(
  request: Request,
  evento: EventoAuth,
  dados: { userId?: string | null; email?: string | null; detalhe?: Record<string, unknown> } = {}
) {
  try {
    await supabaseAdmin().from("auth_events").insert({
      user_id: dados.userId ?? null,
      email: dados.email?.toLowerCase() ?? null,
      evento,
      ip: ipDoPedido(request),
      agente: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      detalhe: dados.detalhe ?? null,
    });
  } catch (e) {
    console.error("auth_events falhou:", e);
  }
}
