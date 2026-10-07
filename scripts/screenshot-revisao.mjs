// Revisão visual (roadmap 4.1–4.3): fotografa as telas principais em modo
// escuro, claro e celular, logado como admin. Saída: OUT/<modo>/<tela>.png
// Uso: BASE_URL=http://localhost:3000 OUT=./capturas node scripts/screenshot-revisao.mjs [filtro]
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "capturas";
const filtro = process.argv[2] ?? "";

const TELAS = [
  ["home", "/"], ["mapa", "/mapa"], ["imoveis", "/imoveis"], ["planos", "/planos"], ["relatorios", "/relatorios"],
  ["suporte", "/suporte"], ["entrar", "/entrar"], ["conta", "/conta"], ["painel", "/painel"],
  ["admin", "/admin"], ["admin-planos", "/admin/planos"], ["admin-fontes", "/admin/fontes"],
  ["admin-conhecimento", "/admin/conhecimento"], ["admin-demandas", "/admin/demandas"],
  ["admin-organizacoes", "/admin/organizacoes"], ["admin-seguranca", "/admin/seguranca"],
  ["admin-solicitacoes", "/admin/cartografia/solicitacoes"], ["admin-usuarios", "/admin/usuarios"],
  ["admin-suporte", "/admin/suporte"], ["cartografia-solicitar", "/cartografia/solicitar"],
].filter(([n]) => n.includes(filtro));

const MODOS = [
  { nome: "escuro", w: 1440, h: 900, tema: "dark" },
  { nome: "claro", w: 1440, h: 900, tema: "light" },
  { nome: "celular", w: 390, h: 844, tema: "dark", mobile: true },
];

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const erros = [];
for (const modo of MODOS) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: modo.w, height: modo.h, isMobile: !!modo.mobile, deviceScaleFactor: 1 });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: modo.tema }]);
  p.on("pageerror", (e) => erros.push(`${modo.nome}: ${String(e.message).slice(0, 160)}`));
  await p.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.evaluate(async (senha, email, s2) => {
    await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: s2 }) });
    // tema segue o aparelho: limpa escolha salva no navegador e na conta
    try { localStorage.clear(); } catch { /* */ }
    await fetch("/api/conta/preferencias", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: "sistema" }) });
  }, process.env.SITE_SENHA ?? "", "admin@arinimaps.com.br", process.env.SEED_USER_PASSWORD);
  mkdirSync(join(OUT, modo.nome), { recursive: true });
  for (const [nome, rota] of TELAS) {
    try {
      const r = await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle2", timeout: 120000 });
      await new Promise((x) => setTimeout(x, rota === "/mapa" || rota === "/" ? 6000 : 1200));
      await p.screenshot({ path: join(OUT, modo.nome, `${nome}.png`), fullPage: rota !== "/mapa" });
      if ((r?.status() ?? 0) >= 400) erros.push(`${modo.nome} ${rota}: HTTP ${r.status()}`);
    } catch (e) {
      erros.push(`${modo.nome} ${rota}: ${e.message.slice(0, 120)}`);
    }
  }
  await ctx.close();
}
await b.close();
console.log(erros.length ? "Problemas:\n" + erros.join("\n") : "capturas sem erro de página");
