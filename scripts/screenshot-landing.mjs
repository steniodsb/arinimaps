// Captura a página inicial inteira em blocos de uma tela (desktop e celular),
// rolando devagar para disparar as animações de entrada.
// Uso: BASE_URL=http://localhost:3000 OUT=./capturas node scripts/screenshot-landing.mjs
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "capturas/landing";
mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const erros = [];
for (const [nome, w, h, tema] of [["desk", 1440, 900, "dark"], ["claro", 1440, 900, "light"], ["cel", 390, 844, "dark"]]) {
  const p = await b.newPage();
  p.on("pageerror", (e) => erros.push(nome + ": " + e.message.slice(0, 150)));
  await p.setViewport({ width: w, height: h, isMobile: w < 500 });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: tema }]);
  await p.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.evaluate(async (s) => { await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) }); try { localStorage.clear(); } catch {} }, process.env.SITE_SENHA ?? "");
  await p.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 5000));
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 0; y < total && i < 14; y += h) {
    await p.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await new Promise((r) => setTimeout(r, 1800));
    await p.screenshot({ path: `${OUT}/${nome}-${String(i++).padStart(2, "0")}.png` });
  }
  await p.close();
}
await b.close();
console.log(erros.length ? erros.join("\n") : "sem erros de página");
