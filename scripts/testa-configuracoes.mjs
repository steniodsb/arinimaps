// Teste ponta a ponta do painel de configurações: altera pela tela,
// confere no banco e verifica se o site público refletiu.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = "http://localhost:3000";
const NOVO_EYEBROW = "Pontal do Triângulo · teste " + Math.floor(Math.random() * 1000);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
  user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  // senha de bloqueio do site (fase de testes): sem ela toda rota responde "acesso restrito"
  await page.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(async (s) => {
    await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
  }, process.env.SITE_SENHA ?? "");

  // login
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "admin@arinibrasil.com.br");
  await page.type('input[type="password"]', process.env.SEED_USER_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Entrar" && b.type !== "button")?.click()),
  ]);

  const { rows: antes } = await db.query(`select valor from settings where chave = 'hero_eyebrow'`);
  const original = antes[0]?.valor ?? null;

  // configurações → aba Página inicial → altera a linha de topo
  await page.goto(`${BASE}/admin/configuracoes`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((b) => b.textContent.includes("Página inicial"))?.click());
  await new Promise((r) => setTimeout(r, 700));

  await page.evaluate(() => { document.querySelector("#hero_eyebrow").value = ""; });
  await page.click("#hero_eyebrow", { clickCount: 3 });
  await page.type("#hero_eyebrow", NOVO_EYEBROW);
  await new Promise((r) => setTimeout(r, 400));

  const rotulo = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Salvar"));
    if (!b || b.disabled) return "botão salvar indisponível";
    b.click();
    return "clicou salvar";
  });
  console.log("tela:", rotulo);
  await new Promise((r) => setTimeout(r, 3000));

  const { rows } = await db.query(`select valor from settings where chave = 'hero_eyebrow'`);
  const noBanco = String(rows[0]?.valor ?? "").replace(/^"|"$/g, "");
  console.log("banco:", noBanco === NOVO_EYEBROW ? `OK (${noBanco})` : `DIVERGENTE (${noBanco})`);
  if (noBanco !== NOVO_EYEBROW) process.exitCode = 1;

  // pelo navegador logado: o fetch do Node cairia na tela da senha do site
  await page.goto(BASE, { waitUntil: "networkidle2" });
  const html = await page.content();
  console.log("site público:", html.includes(NOVO_EYEBROW) ? "OK — refletiu na home" : "NÃO refletiu");
  if (!html.includes(NOVO_EYEBROW)) process.exitCode = 1;

  // devolve ao valor original
  if (original == null) await db.query(`delete from settings where chave = 'hero_eyebrow'`);
  else await db.query(`update settings set valor = $1 where chave = 'hero_eyebrow'`, [JSON.stringify(original)]);
  console.log("valor restaurado");
} finally {
  await browser.close();
  await db.end();
}
