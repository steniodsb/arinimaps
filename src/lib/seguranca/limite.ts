import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Limite de tentativas por chave (IP, e-mail, usuário), contado no banco
 * (fn_rate_limit, migration 0023) para valer entre reinícios e instâncias.
 *
 * Se o banco falhar, a tentativa PASSA: limite é proteção contra abuso, não
 * pode virar o motivo de ninguém conseguir entrar quando o banco oscila.
 */
export type Limite = { permitido: boolean; restante: number; liberaEm: Date | null };

export function ipDoPedido(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "desconhecido"
  );
}

export async function limitar(chave: string, max: number, janelaSegundos: number): Promise<Limite> {
  try {
    const { data, error } = await supabaseAdmin().rpc("fn_rate_limit", {
      p_chave: chave.slice(0, 200), p_max: max, p_janela_s: janelaSegundos,
    });
    if (error || !data) return { permitido: true, restante: max, liberaEm: null };
    const r = data as { permitido: boolean; restante: number; libera_em: string };
    return { permitido: r.permitido, restante: r.restante, liberaEm: new Date(r.libera_em) };
  } catch {
    return { permitido: true, restante: max, liberaEm: null };
  }
}

/** Resposta 429 padronizada, com o tempo de espera em linguagem de gente. */
export function respostaLimite(l: Limite, oQue: string) {
  const seg = l.liberaEm ? Math.max(1, Math.ceil((l.liberaEm.getTime() - Date.now()) / 1000)) : 60;
  const espera = seg >= 90 ? `${Math.ceil(seg / 60)} minutos` : `${seg} segundos`;
  return NextResponse.json(
    { error: `Muitas tentativas de ${oQue}. Aguarde ${espera} e tente de novo.`, codigo: "limite_excedido" },
    { status: 429, headers: { "Retry-After": String(seg) } }
  );
}
