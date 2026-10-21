// Teste de ponta a ponta do ajuste por parte da planta (Central › Cartografia).
// Uso: node scripts/testa-calibracao-parte.mjs ["União de Minas"]   (com o `npm run dev` no ar)
//
// Desenha uma área no meio da planta, arrasta só aquela parte, salva e confere
// no banco que (1) a parte foi gravada, (2) só os lotes de dentro andaram, sem
// refazer a cidade, e (3) remover a parte e salvar devolve os lotes ao lugar.
// Deixa a planta como encontrou. Recusa rodar se a planta já tiver partes.
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const SO_REMOVER = process.argv.includes("--so-remover"); // desfaz uma parte que um teste interrompido deixou
const MUNICIPIO = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "União de Minas";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAIDA = join(root, ".capturas");
mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const ok = (c, nome, extra = "") => { console.log(`${c ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`); if (!c) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Pool({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, max: 2,
});
const { rows: [cam] } = await db.query(`
  select c.id, c.ajustes_locais, c.offset_leste_m, c.offset_norte_m, c.lotes_assinatura from cartography_layers c
  join municipalities m on m.id = c.municipality_id
  where m.nome = $1 and c.tipo = 'vector' and c.status = 'pronto' order by c.created_at desc limit 1`, [MUNICIPIO]);
if (!cam) { console.error(`sem planta vetorial de ${MUNICIPIO}`); process.exit(1); }
if (!SO_REMOVER && (cam.ajustes_locais ?? []).length) { console.error(`${MUNICIPIO} já tem partes ajustadas; o teste não mexe nelas`); process.exit(1); }

// posição de cada lote antes (para saber quem andou e se voltou)
const posicoes = async () => new Map((await db.query(
  `select id, st_x(st_pointonsurface(geom)) x, st_y(st_pointonsurface(geom)) y, numero, quadra from urban_lots where layer_id = $1`, [cam.id]
)).rows.map((r) => [r.id, r]));
const jobs = async () => Number((await db.query(
  `select count(*) n from jobs where tipo = 'gerar_lotes' and payload->>'layer_id' = $1`, [cam.id])).rows[0].n);
const antes = await posicoes();
const jobsAntes = await jobs();
console.log(`${MUNICIPIO}: ${antes.size} lotes`);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const erros = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1100 });
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
  // erro de rede (401 antes do login, tile que falhou) não é erro do código da tela
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) erros.push("console: " + m.text().slice(0, 300)); });
  page.on("dialog", (d) => d.accept());

  // senha do site (bloqueio de lançamento), quando ligada
  if (process.env.SITE_SENHA) {
    await page.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.evaluate(async (senha) => {
      await fetch("/api/acesso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ senha }) });
    }, process.env.SITE_SENHA);
  }
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[type="email"]', "admin@arinibrasil.com.br");
  await page.type('input[type="password"]', process.env.SEED_USER_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Entrar" && b.type !== "button")?.click()),
  ]);
  await espera(2000);
  await page.goto(`${BASE}/admin/cartografia`, { waitUntil: "networkidle2", timeout: 60000 });
  await espera(2000);

  const clicarTexto = (txt) => page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, txt);
  const abrir = () => page.evaluate((mun) => {
    const linhas = [...document.querySelectorAll("div")].filter(
      (d) => d.textContent?.includes(mun) && [...d.querySelectorAll("button")].some((b) => b.textContent.includes("Calibrar")));
    const btn = linhas.at(-1) && [...linhas.at(-1).querySelectorAll("button")].find((b) => b.textContent.includes("Calibrar"));
    if (btn) { btn.click(); return true; }
    return false;
  }, MUNICIPIO);
  const texto = () => page.evaluate(() => document.body.innerText);

  if (SO_REMOVER) {
    ok(await abrir(), "abre a calibração");
    await espera(9000);
    ok(await clicarTexto("Parte 1"), "seleciona a Parte 1");
    await espera(400);
    ok(await clicarTexto("Remover esta parte"), "remove a parte");
    await espera(400);
    ok(await clicarTexto("Salvar calibração"), "salva sem a parte");
    await espera(5000);
    const { rows: [c] } = await db.query("select ajustes_locais from cartography_layers where id = $1", [cam.id]);
    ok((c.ajustes_locais ?? []).length === 0, "sem partes no banco");
    throw new Error("__fim__");
  }
  ok(await abrir(), "abre a calibração");
  await espera(9000);
  const caixa = await page.evaluate(() => {
    const c = document.querySelector(".fixed canvas");
    const r = c?.getBoundingClientRect();
    return r && { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  ok(!!caixa, "mapa na tela");
  const cx = caixa.x + caixa.w / 2, cy = caixa.y + caixa.h / 2;

  // 1. desenha a área: quadrado de 160 px no meio, fecha clicando no 1º ponto
  ok(await clicarTexto("Nova parte"), "botão Nova parte");
  await espera(400);
  const cantos = [[-80, -80], [80, -80], [80, 80], [-80, 80], [-80, -80]];
  for (const [dx, dy] of cantos) { await page.mouse.click(cx + dx, cy + dy); await espera(350); }
  await espera(800);
  const t1 = await texto();
  // a mensagem de criação fica atrás do "Alterações não salvas"; o sinal é o texto de ajuda da parte ativa
  ok(/Movendo só “Parte 1”/.test(t1), "parte criada e ativa");

  // 2. arrasta só a parte 60 px para a direita
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + i * 6, cy); await espera(30); }
  await page.mouse.up();
  await espera(1200);
  const t2 = await texto();
  // o título da seção sai em maiúsculas (CSS), e o innerText devolve assim
  const aj = t2.match(/Ajuste de Parte 1\s+leste (-?[\d.]+) m · norte (-?[\d.]+) m/i);
  ok(!!aj && Number(aj[1]) > 3, "a parte andou para leste", aj ? `leste ${aj[1]} m, norte ${aj[2]} m` : JSON.stringify(t2.slice(t2.indexOf("PASSO"), t2.indexOf("PASSO") + 700)));
  ok(t2.includes("Alterações não salvas"), "acusa alteração não salva");
  const fontes = await page.evaluate(async () => {
    const m = window.__mapaCalibracao;
    const n = async (id) => (await m.getSource(id)?.getData?.())?.features?.length ?? -1;
    return { planta: await n("planta"), parte: await n("planta-parte"), partes: await n("partes") };
  });
  ok(fontes.parte > 0 && fontes.partes === 1, "a parte ativa tem fonte própria no mapa", JSON.stringify(fontes));
  await page.screenshot({ path: join(SAIDA, "calibracao-parte.png") });

  // 3. salva e confere no banco
  ok(await clicarTexto("Salvar calibração"), "salvar");
  await espera(5000);
  const t3 = await texto();
  ok(/lotes clicáveis acompanharam as partes/.test(t3), "lotes acompanharam", t3.match(/[\d.]+ lotes clicáveis acompanharam as partes/)?.[0] ??
    JSON.stringify(t3.slice(t3.indexOf("AJUSTAR"), t3.indexOf("AJUSTAR") + 300)) + " … " + JSON.stringify(t3.slice(-500)));
  const { rows: [depoisCam] } = await db.query("select ajustes_locais, lotes_assinatura, offset_leste_m from cartography_layers where id = $1", [cam.id]);
  ok(depoisCam.ajustes_locais?.length === 1, "parte gravada no banco");
  ok(Number(depoisCam.offset_leste_m) === Number(cam.offset_leste_m), "planta inteira não mudou");
  ok(String(depoisCam.lotes_assinatura).includes(";aj:"), "assinatura dos lotes inclui a parte (não ficam 'defasados')");
  const meio = await posicoes();
  let andaram = 0, numerosIguais = true;
  for (const [id, a] of antes) {
    const b = meio.get(id);
    if (!b) { numerosIguais = false; continue; }
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-7) andaram++;
    if (a.numero !== b.numero || a.quadra !== b.quadra) numerosIguais = false;
  }
  ok(meio.size === antes.size, "nenhum lote criado nem apagado", `${antes.size} → ${meio.size}`);
  ok(andaram > 0 && andaram < antes.size / 2, "só os lotes da parte andaram", `${andaram} de ${antes.size}`);
  ok(numerosIguais, "numeração de quadra e lote preservada");
  ok((await jobs()) === jobsAntes, "não enfileirou refazer os lotes da cidade");

  // 4. remove a parte e salva: tudo volta (a lista recarrega ao fechar)
  await page.keyboard.press("Escape").catch(() => {});
  await espera(4000);
  ok(await abrir(), "reabre a calibração");
  await espera(9000);
  ok(await clicarTexto("Parte 1"), "seleciona a Parte 1");
  await espera(400);
  ok(await clicarTexto("Remover esta parte"), "remove a parte");
  await espera(400);
  ok(await clicarTexto("Salvar calibração"), "salva sem a parte");
  await espera(5000);
  const fim = await posicoes();
  let fora = 0;
  for (const [id, a] of antes) { const b = fim.get(id); if (!b || Math.hypot(a.x - b.x, a.y - b.y) > 1e-7) fora++; }
  ok(fora === 0, "lotes voltaram ao lugar original", `${fora} fora do lugar`);
  const { rows: [finalCam] } = await db.query("select ajustes_locais, lotes_assinatura from cartography_layers where id = $1", [cam.id]);
  ok((finalCam.ajustes_locais ?? []).length === 0, "sem partes no banco");
  ok(finalCam.lotes_assinatura === cam.lotes_assinatura, "assinatura dos lotes como antes");
  ok(erros.length === 0, "sem erro de JavaScript na página", erros.join(" | "));
} catch (e) {
  if (e.message !== "__fim__") throw e;
} finally {
  await browser.close();
  await db.end();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
