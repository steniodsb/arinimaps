// Screenshot de página autenticada do admin (faz login antes).
// Uso: node scripts/screenshot-admin.mjs <caminho> <saida.png> [esperaMs] [largura] [altura]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [, , caminho, saida, esperaMs = "6000", largura = "1400", altura = "1000"] = process.argv;
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
  await page.setViewport({ width: Number(largura), height: Number(altura) });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Entrar" && b.type !== "button")?.click()),
  ]);
  await new Promise((r) => setTimeout(r, 3000));

  const destino = new URL(caminho, BASE).toString();
  console.log("navegando para", destino);
  await page.goto(destino, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(esperaMs)));
  await page.screenshot({ path: saida, type: "png" });
  console.log("salvo:", saida, "| url final:", page.url());
  if (erros.length) console.log("ERROS:", erros.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
