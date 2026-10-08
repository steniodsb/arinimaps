// Passe do worker pela senha de bloqueio do site (fase de testes).
//
// Enquanto SITE_SENHA estiver ligada, toda página redireciona para /acesso —
// e o worker abre páginas de verdade (tour 3D para o vídeo, ficha para a
// imagem de compartilhamento). Sem o cookie ele gravaria a tela da senha.
// O valor do cookie é o mesmo HMAC de src/lib/seguranca/bloqueio.ts
// (`arini-bloqueio:v1:` + senha, chave SITE_BLOQUEIO_SEGREDO): o worker
// precisa das duas variáveis iguais às do app.
import { createHmac } from "node:crypto";

export const COOKIE_BLOQUEIO = "arini_acesso";

export function fichaDeAcesso() {
  const senha = process.env.SITE_SENHA;
  if (!senha) return null; // site aberto: nada a fazer
  const segredo = process.env.SITE_BLOQUEIO_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY || "arini";
  return createHmac("sha256", segredo).update("arini-bloqueio:v1:" + senha).digest("hex");
}

/** Põe o cookie de acesso na página antes de navegar para o site. */
export async function liberarAcesso(page) {
  const valor = fichaDeAcesso();
  if (!valor) return;
  const url = new URL(process.env.SITE_URL);
  await page.setCookie({
    name: COOKIE_BLOQUEIO, value: valor, domain: url.hostname, path: "/",
    httpOnly: true, secure: url.protocol === "https:",
  });
}

/** Chromium: o do container ou o do sistema (Windows/macOS) para rodar fora do Docker. */
export function caminhoChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.platform === "win32") return "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "/usr/bin/chromium";
}
