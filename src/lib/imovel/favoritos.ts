import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Imóveis favoritos (migration 0043). Com conta: tabela `favoritos` (vale em
 * qualquer aparelho). Sem conta: cookie com os códigos, para o visitante não
 * precisar se cadastrar só para guardar um imóvel. Ao entrar, o cookie é
 * juntado na conta (juntarCookieNaConta).
 */
export const COOKIE_FAVORITOS = "arini_fav";
export const MAX_FAVORITOS = 60;
const CODIGO = /^[A-Z][A-Z0-9-]{2,30}$/;

export function lerCodigosDoCookie(valor: string | undefined): string[] {
  if (!valor) return [];
  return [...new Set(decodeURIComponent(valor).split(",").map((c) => c.trim().toUpperCase()).filter((c) => CODIGO.test(c)))]
    .slice(0, MAX_FAVORITOS);
}

export const codigoValido = (c: unknown): c is string => typeof c === "string" && CODIGO.test(c);

export async function codigosFavoritosDaConta(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin().from("favoritos")
    .select("created_at, imovel:properties(codigo)").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(MAX_FAVORITOS * 4);
  return (data ?? []).map((f) => (f.imovel as unknown as { codigo: string } | null)?.codigo).filter(Boolean) as string[];
}

/** Códigos favoritos de quem fez o pedido (conta ou cookie). */
export async function codigosFavoritos(userId: string | null | undefined): Promise<string[]> {
  const doCookie = lerCodigosDoCookie((await cookies()).get(COOKIE_FAVORITOS)?.value);
  if (!userId) return doCookie;
  // acabou de entrar com favoritos de visitante: já vão para a conta (o cookie
  // em si só sai na próxima chamada à rota, porque a página não grava cookie)
  if (doCookie.length) await juntarCookieNaConta(userId, doCookie);
  return codigosFavoritosDaConta(userId);
}

/** Passa os favoritos do cookie para a conta. Devolve quantos entraram. */
export async function juntarCookieNaConta(userId: string, codigos: string[]): Promise<number> {
  if (!codigos.length) return 0;
  const admin = supabaseAdmin();
  const { data: imoveis } = await admin.from("properties").select("id").in("codigo", codigos);
  if (!imoveis?.length) return 0;
  await admin.from("favoritos").upsert(
    imoveis.map((p) => ({ user_id: userId, property_id: p.id })),
    { onConflict: "user_id,property_id", ignoreDuplicates: true },
  );
  return imoveis.length;
}
