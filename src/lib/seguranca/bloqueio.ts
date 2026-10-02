/**
 * Senha de bloqueio do site inteiro (fase de testes, antes do lançamento).
 *
 * Ligada quando a variável SITE_SENHA existe; sem ela o site fica aberto.
 * Quem digita a senha certa recebe um cookie com um HMAC da senha — trocar a
 * SITE_SENHA no servidor derruba todos os acessos liberados de uma vez.
 *
 * Usa só Web Crypto para rodar no proxy sem depender de módulo do Node.
 */
export const COOKIE_BLOQUEIO = "arini_acesso";
export const BLOQUEIO_DIAS = 30;

/** Caminhos que precisam abrir sem a senha. */
const LIVRES = [
  "/acesso",
  "/api/acesso",
  "/api/asaas/webhook", // servidor do Asaas chamando; tem token próprio
];

export function bloqueioAtivo() {
  return !!process.env.SITE_SENHA;
}

export function caminhoLivre(pathname: string) {
  return LIVRES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function hmac(texto: string) {
  const segredo = process.env.SITE_BLOQUEIO_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY || "arini";
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(texto));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valor do cookie para a senha atual. */
export function fichaDeAcesso() {
  return hmac("arini-bloqueio:v1:" + (process.env.SITE_SENHA ?? ""));
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function cookieValido(valor: string | undefined) {
  if (!valor) return false;
  return iguais(valor, await fichaDeAcesso());
}

/** Compara a senha digitada sem vazar o tamanho por tempo de resposta. */
export async function senhaConfere(digitada: string) {
  const certa = process.env.SITE_SENHA;
  if (!certa) return false;
  return iguais(await hmac("cmp:" + digitada), await hmac("cmp:" + certa));
}

/** Só aceita voltar para um caminho interno do próprio site. */
export function destinoSeguro(volta: string | null | undefined) {
  if (!volta || !volta.startsWith("/") || volta.startsWith("//") || volta.startsWith("/\\")) return "/";
  return volta;
}
