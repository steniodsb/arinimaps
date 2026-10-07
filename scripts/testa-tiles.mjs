// Confere os tiles vetoriais no mapa de verdade (07/10/2026): malha do CAR
// visível de longe, lotes e metragens de perto, clique no CAR e no lote.
// Uso: BASE_URL=http://localhost:3000 node scripts/testa-tiles.mjs  (com o dev rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 200) : ""}`); };

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
const erros = [];
p.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 160)); });

try {
  await p.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 120000 });
  if (process.env.SITE_SENHA) {
    await p.evaluate(async (senha) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    }, process.env.SITE_SENHA);
  }

  const abrir = async (hash) => {
    await p.goto(`${BASE}/mapa${hash}`, { waitUntil: "networkidle2", timeout: 120000 });
    await p.waitForFunction(() => window.__mapa && window.__mapa.loaded(), { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
  };
  const q = (js) => p.evaluate(js);

  // ---------- regional: CAR aparece de longe ----------
  await abrir("#pos=9.5/-19.73/-50.21");
  const car9 = await q(() => window.__mapa.querySourceFeatures("car", { sourceLayer: "car" }).length);
  ok("malha do CAR presente no zoom 9,5 (antes sumia abaixo de 12)", car9 > 50, `${car9} feições`);

  // ---------- CAR clicável ----------
  await abrir("#pos=12.5/-19.75/-50.25");
  const alvo = await q(() => {
    const m = window.__mapa, c = m.getCanvas();
    for (let dx = -200; dx <= 200; dx += 40) for (let dy = -150; dy <= 150; dy += 40) {
      const pt = [c.clientWidth / 2 + dx, c.clientHeight / 2 + dy];
      if (m.queryRenderedFeatures(pt, { layers: ["car-fill"] }).length) { const r = c.getBoundingClientRect(); return [r.left + pt[0], r.top + pt[1]]; }
    }
    return null;
  });
  ok("há área do CAR sob o cursor no zoom 12,5", !!alvo);
  if (alvo) {
    await p.mouse.click(alvo[0], alvo[1]);
    await new Promise((r) => setTimeout(r, 800));
    ok("clique no CAR abre o cartão", await q(() => document.body.innerText.includes("Esta área é minha")));
    await p.keyboard.press("Escape");
    await q(() => document.querySelector('button[aria-label="Fechar"]')?.click());
  }

  // ---------- lotes: divisa, metragens e clique ----------
  await abrir("#pos=18/-19.7285/-50.1965");
  const lotes = await q(() => window.__mapa.querySourceFeatures("lotes", { sourceLayer: "lotes" }).length);
  const medidas = await q(() => window.__mapa.querySourceFeatures("lotes", { sourceLayer: "medidas" }).length);
  ok("lotes urbanos carregados por tile no zoom 18", lotes > 10, `${lotes} lotes`);
  ok("metragens dos lados vêm no tile", medidas > 10, `${medidas} etiquetas`);
  const alvoLote = await q(() => {
    const m = window.__mapa, c = m.getCanvas();
    for (let dx = -300; dx <= 300; dx += 30) for (let dy = -200; dy <= 200; dy += 30) {
      const pt = [c.clientWidth / 2 + dx, c.clientHeight / 2 + dy];
      if (m.queryRenderedFeatures(pt, { layers: ["lotes-fill"] }).length) { const r = c.getBoundingClientRect(); return [r.left + pt[0], r.top + pt[1]]; }
    }
    return null;
  });
  ok("há lote sob o cursor (hit-test do preenchimento)", !!alvoLote);
  if (alvoLote) {
    await p.mouse.move(alvoLote[0], alvoLote[1]);
    await new Promise((r) => setTimeout(r, 300));
    ok("cursor vira ponteiro sobre o lote", await q(() => document.querySelector(".maplibregl-canvas").style.cursor === "pointer"));
    await p.mouse.click(alvoLote[0], alvoLote[1]);
    await new Promise((r) => setTimeout(r, 1500));
    ok("clique no lote abre o cartão com perímetro", await q(() => document.body.innerText.includes("Perímetro")));
  }

  // ---------- tiles: tamanho e cache ----------
  const t1 = await q(async () => { const t = performance.now(); const r = await fetch("/api/tiles/car/9/184/284.pbf"); await r.arrayBuffer(); return [r.status, r.headers.get("content-type"), Math.round(performance.now() - t)]; });
  const t2 = await q(async () => { const t = performance.now(); const r = await fetch("/api/tiles/car/9/184/284.pbf"); await r.arrayBuffer(); return [r.status, Math.round(performance.now() - t)]; });
  ok("tile do CAR responde com o tipo certo", t1[0] === 200 && /vector-tile/.test(t1[1] ?? ""), JSON.stringify(t1));
  ok("segundo pedido do mesmo tile é rápido (cache)", t2[1] <= Math.max(60, t1[2]), JSON.stringify({ primeiro_ms: t1[2], segundo_ms: t2[1] }));
  ok("sem erros de console relevantes", !erros.some((e) => /tiles|AJAXError|lotes/.test(e)), erros.filter((e) => /tiles|AJAXError|lotes/.test(e)).join(" | "));
} catch (e) {
  falhas++;
  console.error("✗ erro inesperado:", e);
} finally {
  await b.close();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
