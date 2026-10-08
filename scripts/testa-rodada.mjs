// Teste de fumaça da rodada de 01/10/2026: login pelo servidor, limite de
// tentativas, mapa abrindo no satélite com marcadores, consulta de área do CAR
// e tour 3D com carregamento antes do sobrevoo.
//
// Uso: node scripts/testa-rodada.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COD = "MG-3134400-F0B5DB13248140BBAE3B90AD7E6F4A53";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));

const api = (url, body) => p.evaluate(async (u, bd) => {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bd ?? {}) });
  return `${r.status} ${(await r.text()).slice(0, 160)}`;
}, url, body);

await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 90000 });
console.log("login senha errada :", await api("/api/auth/entrar", { email: "ninguem@exemplo.com", senha: "errada12345" }));
console.log("recuperar          :", await api("/api/auth/recuperar", { email: "ninguem@exemplo.com" }));
console.log("senha fraca        :", await api("/api/cadastro", { email: "x@y.com", senha: "12345678", nome: "T", role: "comprador", cpf: "52998224725", aceite_termos: true }));
console.log("login admin        :", await api("/api/auth/entrar", { email: "admin@arinimaps.com.br", senha: process.env.SEED_USER_PASSWORD }));

await p.goto(`${BASE}/mapa`, { waitUntil: "domcontentloaded", timeout: 90000 });
await espera(18000);
await p.screenshot({ path: ".capturas/rodada-mapa-regional.png" });

await p.goto(`${BASE}/consulta/car/${COD}`, { waitUntil: "networkidle2", timeout: 90000 });
console.log("consulta POST      :", await api(`/api/consulta/car/${COD}`));
await p.reload({ waitUntil: "networkidle2" });
await espera(6000);
await p.screenshot({ path: ".capturas/rodada-consulta-car.png", fullPage: true });
console.log("fontes na página   :", await p.evaluate(() => [...document.querySelectorAll("main .cartao p.font-medium")].length));

await p.goto(`${BASE}/imovel/AIB-000002/tour`, { waitUntil: "domcontentloaded", timeout: 90000 });
await espera(3000);
console.log("tour, fase inicial :", await p.evaluate(() => document.body.innerText.match(/Carregando[^\n]*|Preparando[^\n]*/)?.[0] ?? "(já tocando)"));
await espera(30000);
await p.screenshot({ path: ".capturas/rodada-tour.png" });
console.log("etiquetas no tour  :", await p.evaluate(() => document.querySelectorAll(".tour-etiqueta").length));

console.log("erros de página    :", erros.slice(0, 4));
await b.close();
