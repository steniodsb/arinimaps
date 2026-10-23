// Sentinel-2 pelo Copernicus Data Space (22/10/2026, migration 0052): busca de
// cenas por data e nuvem, tela do mapa, tiles em cor real e NDVI, e o NDVI no
// relatório. Sem a conta do Copernicus (COPERNICUS_CLIENT_ID/SECRET) testa o
// que tem de funcionar assim: lista aberta, tile recusado com aviso claro e a
// fonte fora do relatório. Com a conta, testa a imagem e o cálculo de verdade.
// Só lê; não grava nada.
//
// Uso: node scripts/testa-sentinel.mjs   (com `npm run dev` rodando)
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COM_CONTA = !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET);
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 220) : ""}`); };
console.log(COM_CONTA ? "conta do Copernicus configurada: testa imagem e NDVI" : "sem conta do Copernicus: testa o modo sem processamento");

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const sessao = async (email) => {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.setExtraHTTPHeaders({ "x-real-ip": `10.251.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
    await p.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.evaluate(async (s, e, sn) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
      if (e) await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: sn }) });
    }, process.env.SITE_SENHA ?? "", email, process.env.SEED_USER_PASSWORD);
    return p;
  };
  const get = (p, url) => p.evaluate(async (u) => {
    const r = await fetch(u);
    const tipo = r.headers.get("content-type") ?? "";
    return { status: r.status, tipo, json: tipo.includes("json") ? await r.json().catch(() => null) : null, bytes: tipo.includes("image") ? (await r.arrayBuffer()).byteLength : 0 };
  }, url);

  const BBOX = "-50.25,-19.75,-50.15,-19.65";
  const visitante = await sessao(null);
  const v = await get(visitante, `/api/sentinel/cenas?bbox=${BBOX}`);
  ok("visitante não busca cenas", v.status === 401 || v.status === 403, v.status);

  const p = await sessao("admin@arinibrasil.com.br");
  // 1. busca por data e nuvem
  const todas = await get(p, `/api/sentinel/cenas?bbox=${BBOX}&de=2026-07-01&ate=2026-10-20&nuvem=100`);
  const limpas = await get(p, `/api/sentinel/cenas?bbox=${BBOX}&de=2026-07-01&ate=2026-10-20&nuvem=10`);
  ok("busca de cenas responde", todas.status === 200 && todas.json?.cenas?.length > 5, `${todas.json?.cenas?.length} cenas`);
  ok("filtro de nuvem reduz a lista e respeita o limite", limpas.json?.cenas?.length < todas.json?.cenas?.length
    && limpas.json.cenas.every((c) => c.nuvem <= 10), `${limpas.json?.cenas?.length} com até 10%`);
  ok("período respeitado e uma cena por dia", todas.json.cenas.every((c) => c.data >= "2026-07-01" && c.data <= "2026-10-20")
    && new Set(todas.json.cenas.map((c) => c.data)).size === todas.json.cenas.length);
  ok("a resposta diz se a cena abre", todas.json.processamento === COM_CONTA, todas.json.processamento);
  const ruim = await get(p, `/api/sentinel/cenas?bbox=${BBOX}&de=2026-10-20&ate=2026-07-01`);
  ok("período invertido = 400", ruim.status === 400);
  const longe = await get(p, "/api/sentinel/cenas?bbox=-55,-25,-45,-15");
  ok("janela grande pede para aproximar (422)", longe.status === 422);

  // 2. tiles
  const data = limpas.json.cenas[0]?.data ?? "2026-10-20";
  // tile z13 sobre Iturama
  const [x, y] = [Math.floor(((-50.2 + 180) / 360) * 2 ** 13), Math.floor((1 - Math.log(Math.tan(-19.7 * Math.PI / 180) + 1 / Math.cos(-19.7 * Math.PI / 180)) / Math.PI) / 2 * 2 ** 13)];
  const cor = await get(p, `/api/sentinel/tile/${data}/cor/13/${x}/${y}.png`);
  const ndvi = await get(p, `/api/sentinel/tile/${data}/ndvi/13/${x}/${y}.png`);
  if (COM_CONTA) {
    ok("tile em cor real (PNG)", cor.status === 200 && cor.tipo.includes("png") && cor.bytes > 1000, `${cor.status} ${cor.bytes} bytes`);
    ok("tile em NDVI (PNG)", ndvi.status === 200 && ndvi.tipo.includes("png") && ndvi.bytes > 1000, `${ndvi.status} ${ndvi.bytes} bytes`);
  } else {
    ok("sem conta, o tile responde 503 com aviso", cor.status === 503 && cor.json?.codigo === "sem_conta_copernicus", cor.status);
  }
  const tvis = await get(visitante, `/api/sentinel/tile/${data}/cor/13/${x}/${y}.png`);
  ok("visitante não puxa tile (cota da Arini)", tvis.status === 401 || tvis.status === 403, tvis.status);
  const fora = await get(p, `/api/sentinel/tile/${data}/cor/6/20/30.png`);
  ok("fora do zoom 10–16 não gasta cota (204)", fora.status === 204);

  // 3. tela: painel "Imagem do ano" → buscar cenas
  await p.goto(`${BASE}/mapa#pos=12/-19.70/-50.20`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await new Promise((r) => setTimeout(r, 12000));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Imagem do ano/.test(x.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1000));
  const temSecao = await p.evaluate(() => /Cena do dia — Sentinel-2/.test(document.body.innerText));
  ok("painel mostra a seção do Copernicus", temSecao);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Buscar cenas desta área/.test(x.textContent))?.click());
  await p.waitForFunction(() => /% nuvem/.test(document.body.innerText) || /Nenhuma passagem/.test(document.body.innerText), { timeout: 60000 }).catch(() => null);
  const tela = await p.evaluate(() => document.body.innerText);
  ok("lista de cenas na tela com data e nuvem", /\d{2}\/\d{2}\/\d{4}\s*\n?\s*[\d,]+% nuvem/.test(tela));
  ok(COM_CONTA ? "sem aviso de conta" : "aviso de que falta a conta do Copernicus",
    COM_CONTA ? !/ainda não foi configurada/.test(tela) : /ainda não foi configurada/.test(tela));
  if (COM_CONTA) {
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /% nuvem/.test(x.textContent))?.click());
    await new Promise((r) => setTimeout(r, 8000));
    const chip = await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Imagem de \d{4}/.test(x.textContent))?.textContent ?? "");
    ok("cena escolhida vira a imagem do mapa", /Imagem de \d{4}/.test(chip), chip);
  }
  if (process.env.PRINT) writeFileSync(process.env.PRINT, await p.screenshot());

  // 4. relatório: a fonte só aparece com a conta
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: car } = await admin.from("car_imoveis").select("cod_imovel").eq("cod_ibge", 3134400).limit(1).single();
  await p.goto(`${BASE}/consulta/car/${encodeURIComponent(car.cod_imovel)}`, { waitUntil: "networkidle2", timeout: 180000 });
  const relatorio = await p.evaluate(() => document.body.innerText);
  ok(COM_CONTA ? "relatório lista a fonte de NDVI" : "sem conta, o relatório não lista a fonte de NDVI",
    COM_CONTA ? /Vegetação \(NDVI do Sentinel-2\)/.test(relatorio) : !/Vegetação \(NDVI do Sentinel-2\)/.test(relatorio));
} finally {
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nSentinel ok");
process.exit(falhas ? 1 : 0);
