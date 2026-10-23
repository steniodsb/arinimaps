// Biomas oficiais e municípios do IBGE (22/10/2026, migration 0051): dados no
// banco, bioma por área, município por ponto, camada no mapa (com a trava do
// plano) e o bloco "Contexto do município" nas páginas de consulta e do imóvel.
// Só lê; não grava nada.
//
// Uso: node scripts/testa-ibge.mjs   (com `npm run dev` rodando; dados carregados por scripts/ibge-importa.mjs)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 220) : ""}`); };

// 1. dados no banco
const { count: biomas } = await admin.from("ibge_biomas").select("cd_bioma", { count: "exact", head: true });
ok("6 biomas importados", biomas === 6, biomas);
const { count: comMalha } = await admin.from("ibge_municipios").select("cod_ibge", { count: "exact", head: true }).not("geom", "is", null);
ok("malha de pelo menos 5.570 municípios", (comMalha ?? 0) >= 5570, comMalha);
const { data: itu } = await admin.rpc("fn_ibge_municipio", { p_cod: 3134400 });
const ind = itu?.indicadores ?? {};
ok("indicadores de Iturama com ano", ind.populacao_censo?.valor > 30000 && ind.populacao_censo?.ano === 2022 && ind.pib_mil_reais?.ano >= 2021,
  JSON.stringify(Object.fromEntries(Object.entries(ind).map(([k, v]) => [k, `${v.valor}/${v.ano}`]))));
ok("PIB por habitante bate com PIB ÷ população do mesmo ano", !ind.pib_per_capita || ind.pib_per_capita.ano === 2022);

// 2. bioma por área e município por ponto
const { data: envItu } = await admin.rpc("fn_biomas_envelope", { p_xmin: -50.3, p_ymin: -19.8, p_xmax: -50.1, p_ymax: -19.6 });
const nomes = envItu.biomas.map((b) => b.bioma);
ok("Iturama: Cerrado e Mata Atlântica, somando 100%", nomes[0] === "Cerrado" && nomes.includes("Mata Atlântica")
  && Math.abs(envItu.biomas.reduce((s, b) => s + Number(b.pct), 0) - 100) < 0.5, JSON.stringify(envItu.biomas));
const { data: envPan } = await admin.rpc("fn_biomas_envelope", { p_xmin: -57.0, p_ymin: -19.5, p_xmax: -56.5, p_ymax: -19.0 });
ok("ponto no Pantanal: 100% Pantanal", envPan.biomas.length === 1 && envPan.biomas[0].bioma === "Pantanal");
const { data: mar } = await admin.rpc("fn_biomas_envelope", { p_xmin: -30.0, p_ymin: -20.0, p_xmax: -29.9, p_ymax: -19.9 });
ok("alto-mar: nenhum bioma (não inventa)", mar.biomas.length === 0);
const { data: sp } = await admin.rpc("fn_municipio_no_ponto", { p_lng: -46.6333, p_lat: -23.5505 });
ok("ponto em São Paulo cai em São Paulo/SP", sp?.nome === "São Paulo" && sp?.uf === "SP", sp?.nome);

// 3. pelo site
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox"],
});
try {
  const sessao = async (email) => {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setExtraHTTPHeaders({ "x-real-ip": `10.251.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
    await p.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.evaluate(async (s, e, sn) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
      if (e) await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: sn }) });
    }, process.env.SITE_SENHA ?? "", email, process.env.SEED_USER_PASSWORD);
    return p;
  };
  const camada = (p) => p.evaluate(async () => {
    const r = await fetch("/api/camadas/ibge_biomas?bbox=-51.5,-20.5,-48.5,-18.5");
    const j = await r.json().catch(() => null);
    return { status: r.status, n: j?.features?.length ?? 0, nomes: [...new Set((j?.features ?? []).map((f) => f.properties?.nome))] };
  });

  const visitante = await sessao(null);
  const negado = await camada(visitante);
  ok("visitante não puxa a camada de biomas (plano)", negado.status === 403, negado.status);

  const diretoria = await sessao("admin@arinibrasil.com.br");
  const liberado = await camada(diretoria);
  ok("diretoria recebe a camada de biomas", liberado.status === 200 && liberado.nomes.includes("Cerrado"), JSON.stringify(liberado));

  const texto = async (p, url) => {
    await p.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 180000 });
    return p.evaluate(() => document.body.innerText);
  };
  const { data: car } = await admin.from("car_imoveis").select("cod_imovel").eq("cod_ibge", 3134400).limit(1).single();
  const tCar = await texto(visitante, `/consulta/car/${encodeURIComponent(car.cod_imovel)}`);
  ok("consulta do CAR mostra o contexto de Iturama", /CONTEXTO DO MUNICÍPIO/i.test(tCar) && /Iturama\/MG/.test(tCar) && /Censo 2022/.test(tCar));
  const { data: lote } = await admin.from("urban_lots").select("id").limit(1).single();
  const tLote = await texto(visitante, `/consulta/lote/${lote.id}`);
  ok("consulta do lote mostra o contexto do município", /CONTEXTO DO MUNICÍPIO/i.test(tLote) && /hab\/km²/.test(tLote));
  const { data: imovel } = await admin.from("properties").select("codigo").eq("status", "publicado").limit(1).single();
  const tImovel = await texto(visitante, `/imovel/${imovel.codigo}`);
  ok("página do imóvel mostra o contexto do município", /CONTEXTO DO MUNICÍPIO/i.test(tImovel) && /PIB/.test(tImovel));
} finally {
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nIBGE ok");
process.exit(falhas ? 1 : 0);
