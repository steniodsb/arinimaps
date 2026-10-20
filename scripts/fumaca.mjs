// Teste de fumaça: abre cada tela com o perfil certo e confere que responde
// sem erro HTTP, sem erro de JavaScript e sem cair na tela de acesso restrito.
// Rápido (uma passada, só desktop) — para rodar depois de cada lote de correções.
//
// Uso: node scripts/fumaca.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const um = async (q) => (await q).data?.[0] ?? null;
const imovel = await um(admin.from("properties").select("id, codigo").in("status", ["publicado", "em_negociacao"]).limit(1));
const opp = await um(admin.from("opportunities").select("id").limit(1));
const lote = await um(admin.from("urban_lots").select("id").not("numero", "is", null).limit(1));

const V = null, P = "proprietario.teste@arinimaps.com.br", A = "admin@arinimaps.com.br";
const ROTAS = [
  ["/", V], ["/mapa", V], ["/imoveis?q=Iturama", V], ["/relatorios", V], ["/termos/termos-de-uso", V],
  imovel && [`/imovel/${imovel.codigo}`, V], imovel && [`/imovel/${imovel.codigo}/relatorio`, V],
  lote && [`/consulta/lote/${lote.id}`, V],
  ["/painel", P], ["/painel/novo", P], ["/cartografia/solicitar", P],
  ["/admin", A], ["/admin/auditoria", A], ["/admin/financeiro", A], ["/admin/comissoes", A], ["/admin/relatorios", A],
  ["/admin/marketing", A], ["/admin/seguranca", A], ["/admin/juridico", A], ["/admin/planos", A], ["/admin/operacoes", A],
  ["/admin/demandas", A], ["/admin/organizacoes", A], ["/admin/conhecimento", A], ["/admin/mensalidades", A],
  ["/admin/cartografia", A], ["/admin/configuracoes", A],
  imovel && [`/admin/imoveis/${imovel.id}`, A], opp && [`/admin/oportunidades/${opp.id}`, A],
].filter(Boolean);

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const sessoes = new Map();
async function sessao(email) {
  const chave = email ?? "visitante";
  if (sessoes.has(chave)) return sessoes.get(chave);
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const st = await p.evaluate(async (s, e, sn) => {
    const a = await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
    const l = e ? await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: sn }) }) : null;
    return [a.status, l?.status ?? 200];
  }, process.env.SITE_SENHA ?? "", email, process.env.SEED_USER_PASSWORD);
  if (st[0] !== 200 || st[1] !== 200) throw new Error(`sessão ${chave} não entrou: ${st}`);
  sessoes.set(chave, p);
  return p;
}

let falhas = 0;
for (const [rota, perfil] of ROTAS) {
  const p = await sessao(perfil);
  const erros = [];
  const aoErro = (e) => erros.push(e.message.slice(0, 140));
  p.on("pageerror", aoErro);
  let status = 0, url = "";
  try {
    const r = await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle2", timeout: 180000 });
    status = r?.status() ?? 0;
    url = p.url().replace(BASE, "");
    await new Promise((x) => setTimeout(x, 800));
  } catch (e) { erros.push("falhou: " + e.message.slice(0, 120)); }
  p.off("pageerror", aoErro);
  const ruim = status >= 400 || erros.length || url.startsWith("/acesso") || url.startsWith("/entrar");
  if (ruim) falhas++;
  console.log(`${ruim ? "✗" : "✓"} ${rota} (${perfil ?? "visitante"}) HTTP ${status}${url !== rota ? ` → ${url}` : ""}${erros.length ? " · " + erros.join(" | ") : ""}`);
}
await b.close();
console.log(falhas ? `\n${falhas} tela(s) com problema` : `\n${ROTAS.length} telas ok.`);
process.exit(falhas ? 1 : 0);
