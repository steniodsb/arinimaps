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

/**
 * IP de quem fez o pedido, na ordem em que dá para confiar:
 *  1. `cf-connecting-ip` — a Cloudflare sobrescreve, o cliente não forja;
 *  2. `x-real-ip` — o proxy da VPS (Traefik do Dokploy) grava o IP da conexão;
 *  3. o ÚLTIMO item de `x-forwarded-for` — o que o nosso proxy acrescentou.
 * O PRIMEIRO item do x-forwarded-for vem do próprio cliente quando o proxy só
 * acrescenta: usá-lo deixava qualquer um trocar de "IP" a cada pedido e
 * escapar dos limites (achado no teste de carga de 08/10/2026).
 */
export function ipDoPedido(request: Request) {
  const xff = request.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    xff?.[xff.length - 1] ||
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
