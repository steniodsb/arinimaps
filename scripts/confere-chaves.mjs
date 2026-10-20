// Confere, de ponta a ponta, as integrações que dependem de chave:
// satélite Esri licenciado no /mapa, assistente de IA e o painel
// Admin › Configurações. Não grava nada além de uma pergunta ao assistente.
//
// Uso: node scripts/confere-chaves.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 300) : ""}`); };

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
});
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 180000 });
  if (process.env.SITE_SENHA && p.url().includes("/acesso")) {
    await p.evaluate(async (senha) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    }, process.env.SITE_SENHA);
  }
  const login = await p.evaluate(async (email, senha) => {
    const r = await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
    return r.status;
  }, "admin@arinimaps.com.br", process.env.SEED_USER_PASSWORD);
  ok("login da diretoria", login === 200, login);

  // 1. Painel de configurações
  await p.goto(`${BASE}/admin/configuracoes`, { waitUntil: "networkidle2", timeout: 180000 });
  const cards = await p.evaluate(() => [...document.querySelectorAll(".cartao")].map((c) => ({
    texto: c.innerText.split("\n")[0], ligado: c.className.includes("border-l-verde"),
  })));
  for (const nome of ["Esri ArcGIS", "Anthropic", "Resend", "Asaas"]) {
    const c = cards.find((x) => x.texto.includes(nome));
    ok(`Configurações: ${nome} ligado`, !!c?.ligado, c ? "" : "card não encontrado");
  }

  // 2. Satélite no mapa: tiles vindos do endpoint licenciado e respondendo 200
  const tiles = [];
  p.on("response", (r) => { if (r.url().includes("ibasemaps-api.arcgis.com")) tiles.push(r.status()); });
  await p.goto(`${BASE}/mapa`, { waitUntil: "networkidle2", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 8000));
  ok("mapa pede tiles da Esri licenciada", tiles.length > 0, `${tiles.length} tiles`);
  ok("todos os tiles da Esri com 200", tiles.length > 0 && tiles.every((s) => s === 200), [...new Set(tiles)].join(","));
  if (process.env.PRINT) await p.screenshot({ path: process.env.PRINT });

  // 3. Assistente de IA
  const ia = await p.evaluate(async () => {
    const r = await fetch("/api/ia/chat?stream=0", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagem: "Quantos imóveis publicados existem em Iturama?" }) });
    return { status: r.status, corpo: (await r.text()).slice(0, 400) };
  });
  ok("assistente responde", ia.status === 200 && !/ia_desligada/.test(ia.corpo), `${ia.status} ${ia.corpo}`);
} finally {
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
