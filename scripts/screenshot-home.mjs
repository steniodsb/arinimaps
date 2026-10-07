// Captura a seção "Entre na área de consultas" da home (desktop e celular).
// Uso: BASE_URL=http://localhost:3000 OUT=./capturas node scripts/screenshot-home.mjs
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const BASE = process.env.BASE_URL; const OUT = process.env.OUT;
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 120000 });
await p.evaluate(async (senha) => { await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) }); }, process.env.SITE_SENHA);
await p.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 120000 });
const y = await p.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((e) => /consultas/i.test(e.textContent)); return h ? h.getBoundingClientRect().top + window.scrollY - 80 : 600; });
await p.evaluate((y) => window.scrollTo(0, y), y);
await new Promise((r) => setTimeout(r, 12000));
await p.screenshot({ path: OUT + "/home-consultas.png" });
await p.setViewport({ width: 390, height: 844 });
const y2 = await p.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((e) => /consultas/i.test(e.textContent)); return h ? h.getBoundingClientRect().top + window.scrollY - 340 : 600; });
await p.evaluate((y) => window.scrollTo(0, y), y2);
await new Promise((r) => setTimeout(r, 6000));
await p.screenshot({ path: OUT + "/home-consultas-mobile.png" });
await b.close();
console.log("ok", y);
