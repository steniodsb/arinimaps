// Screenshot da tela de calibração de planta (abre o modal de uma camada).
// Uso: node scripts/screenshot-calibracao.mjs "Iturama" .capturas/calibracao.png
//
// Existe porque mapa/WebGL só se dá por funcionando com screenshot — o modal
// carrega o GeoJSON da planta (19 MB no caso de Iturama) e desenha por cima do
// satélite; nenhum teste de DOM prova que isso apareceu.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [, , municipio = "Iturama", saida = ".capturas/calibracao.png", esperaMs = "12000"] = process.argv;
const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@arinimaps.com.br";
const SENHA = process.env.SEED_USER_PASSWORD;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1100 });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text().slice(0, 160)); });

  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Entrar" && b.type !== "button")?.click()),
  ]);
  await new Promise((r) => setTimeout(r, 2500));

  await page.goto(`${BASE}/admin/cartografia`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const abriu = await page.evaluate((mun) => {
    // a linha certa é a que tem o nome E o botão, sem englobar as outras
    const linhas = [...document.querySelectorAll("div")].filter(
      (d) => d.textContent?.includes(mun) && [...d.querySelectorAll("button")].some((b) => b.textContent.includes("Calibrar"))
    );
    const alvo = linhas[linhas.length - 1];
    const btn = alvo && [...alvo.querySelectorAll("button")].find((b) => b.textContent.includes("Calibrar"));
    if (btn) { btn.click(); return true; }
    return false;
  }, municipio);
  if (!abriu) throw new Error(`não achei o botão Calibrar da camada de ${municipio}`);

  console.log("modal aberto, esperando a planta carregar…");
  await new Promise((r) => setTimeout(r, Number(esperaMs)));
  await page.screenshot({ path: saida, type: "png" });
  console.log("salvo:", saida);

  // segunda captura: a aba de camadas do CAD
  const trocou = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Camadas do CAD"));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (trocou) {
    await new Promise((r) => setTimeout(r, 1200));
    const saida2 = saida.replace(/\.png$/, "-camadas.png");
    await page.screenshot({ path: saida2, type: "png" });
    console.log("salvo:", saida2);
  }

  const estado = await page.evaluate(() => ({
    titulo: document.querySelector("p.font-semibold")?.textContent,
    resumo: document.body.innerText.match(/\d[\d.]* de [\d.]* linhas no mapa/)?.[0],
    canvas: !!document.querySelector("canvas"),
  }));
  console.log("estado:", JSON.stringify(estado));
  if (erros.length) console.log("ERROS:", erros.slice(0, 4).join(" | "));
} finally {
  await browser.close();
}
