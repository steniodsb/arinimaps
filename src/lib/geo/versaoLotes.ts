import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Versão dos tiles de lotes urbanos: a data da última geração de lotes de
 * qualquer planta (worker/jobs/gerarLotes.mjs grava `lotes_gerados_em`).
 * Vai no endereço do tile (`?v=`), então uma recalibração aparece na hora —
 * sem isso o navegador guardava o tile antigo por 1 h e a Cloudflare por 1 dia.
 *
 * Guardada 1 minuto em memória: o /mapa não faz uma consulta a mais por visita.
 */
let guardada: { valor: string; em: number } | null = null;

export async function versaoDosLotes(): Promise<string> {
  if (guardada && Date.now() - guardada.em < 60_000) return guardada.valor;
  try {
    const { data } = await supabaseAdmin().from("cartography_layers")
      .select("lotes_gerados_em").not("lotes_gerados_em", "is", null)
      .order("lotes_gerados_em", { ascending: false }).limit(1).maybeSingle();
    const valor = data?.lotes_gerados_em ? new Date(data.lotes_gerados_em).getTime().toString(36) : "";
    guardada = { valor, em: Date.now() };
    return valor;
  } catch {
    return guardada?.valor ?? "";
  }
}
