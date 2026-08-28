// Executa a consulta territorial de ponta a ponta e mostra o que cada fonte devolveu.
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
const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";

const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
  user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();
const { rows: [imovel] } = await db.query(
  `select p.id, p.codigo, p.titulo from properties p
   join property_geometries g on g.property_id = p.id
   where p.tipo = 'rural' order by p.created_at limit 1`);
console.log("imóvel:", imovel.codigo, "—", imovel.titulo);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "admin@arinimaps.com.br");
  await page.type('input[type="password"]', process.env.SEED_USER_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Entrar" && b.type !== "button")?.click()),
  ]);

  const resposta = await page.evaluate(async (id) => {
    const r = await fetch(`/api/imoveis/${id}/consulta-rural`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raio_m: 10000 }),
    });
    return { status: r.status, corpo: await r.json() };
  }, imovel.id);

  console.log("\nPOST consulta-rural:", resposta.status);
  console.log(JSON.stringify(resposta.corpo, null, 2).slice(0, 900));

  const { rows } = await db.query(
    `select fonte_id, quantidade, incide, erro, jsonb_array_length(coalesce(resultado->'itens','[]')) itens
     from consultas_rurais where property_id = $1 order by fonte_id`, [imovel.id]);
  console.log("\n=== gravado no banco ===");
  for (const r of rows) {
    console.log(`${r.fonte_id.padEnd(16)} qtd=${String(r.quantidade).padEnd(4)} incide=${r.incide} itens=${r.itens} ${r.erro ? "erro: " + r.erro : ""}`);
  }

  const { rows: [amostra] } = await db.query(
    `select resultado->'itens'->0 item from consultas_rurais
     where property_id = $1 and fonte_id = 'anm'`, [imovel.id]);
  console.log("\nexemplo ANM:", JSON.stringify(amostra?.item));
} finally {
  await browser.close();
  await db.end();
}
