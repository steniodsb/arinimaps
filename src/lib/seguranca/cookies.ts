/**
 * Opções do cookie de sessão do Supabase (item 6.2).
 *
 * O padrão do @supabase/ssr já é SameSite=Lax (o navegador não manda o cookie
 * em POST vindo de outro site) e path=/. Falta o `Secure`: sem ele o cookie
 * pode viajar em http puro. Ligamos o `Secure` quando o endereço público do
 * site (NEXT_PUBLIC_SITE_URL) é https — em desenvolvimento (http://localhost)
 * ele fica desligado, senão o navegador recusa o cookie e ninguém entra.
 *
 * O cookie de sessão NÃO é httpOnly: o cliente do Supabase no navegador
 * precisa lê-lo (MFA, mapa). A defesa contra roubo dele é não ter XSS — ver
 * src/lib/seguranca/html.ts e os cabeçalhos em next.config.ts.
 *
 * Pode ser usado no navegador, no proxy e no servidor.
 */
export function opcoesCookieSessao() {
  const https = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
  return { path: "/", sameSite: "lax" as const, secure: https };
}
