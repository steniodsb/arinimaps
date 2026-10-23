import "server-only";
import { conferirRecurso } from "@/lib/planos-servidor";

/**
 * Quem pode usar as cenas do Copernicus: o mesmo recurso das imagens
 * históricas (`camadas_oficiais`, plano profissional para cima). Cada tile
 * gasta cota da conta da Arini; a resposta fica guardada por 5 minutos por
 * pessoa para o mapa não consultar o plano no banco a cada tile.
 */
const lembrado = new Map<string, { ok: boolean; mensagem: string; em: number }>();

export async function podeUsarCenas(request: Request, user: { id: string; role: string } | null): Promise<{ ok: true } | { ok: false; status: number; mensagem: string }> {
  if (!user) return { ok: false, status: 401, mensagem: "Entre na sua conta para ver as cenas de satélite." };
  const j = lembrado.get(user.id);
  if (j && Date.now() - j.em < 300_000) return j.ok ? { ok: true } : { ok: false, status: 403, mensagem: j.mensagem };
  const { negacao } = await conferirRecurso(request, { id: user.id, role: user.role }, "camadas_oficiais");
  if (lembrado.size > 2000) lembrado.clear();
  lembrado.set(user.id, { ok: !negacao, mensagem: negacao?.mensagem ?? "", em: Date.now() });
  return negacao ? { ok: false, status: 403, mensagem: negacao.mensagem } : { ok: true };
}
