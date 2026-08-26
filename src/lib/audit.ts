import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AuditEntry = {
  user_id?: string | null;
  acao: string;
  entidade: string;
  entidade_id?: string | null;
  property_id?: string | null;
  opportunity_id?: string | null;
  dados_antes?: unknown;
  dados_depois?: unknown;
};

/** Grava no audit_log (append-only, só via service role). Nunca lança. */
export async function logAudit(entry: AuditEntry) {
  try {
    await supabaseAdmin().from("audit_log").insert(entry);
  } catch (e) {
    console.error("audit_log falhou:", e);
  }
}
