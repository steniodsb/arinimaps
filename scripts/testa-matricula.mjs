// Matrícula do anúncio (20/10/2026): a Matriz grava e confere o número; o site
// público mostra só o selo, nunca o número; o banco não deixa anônimo ler a
// tabela; a consulta do lote tem o atalho do mapa do ONR. Desfaz tudo no fim.
//
// Uso: node scripts/testa-matricula.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 200) : ""}`); };

const NUMERO = "TESTE-998877";
const { data: imovel } = await admin.from("properties").select("id, codigo").eq("status", "publicado").limit(1).single();
const { data: original } = await admin.from("property_matriculas").select("*").eq("property_id", imovel.id).maybeSingle();
const { data: lote } = await admin.from("urban_lots").select("id").limit(1).single();

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const sessao = async (email) => {
    const p = await (await b.createBrowserContext()).newPage();
    await p.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.evaluate(async (s, e, sn) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
      if (e) await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: sn }) });
    }, process.env.SITE_SENHA ?? "", email, process.env.SEED_USER_PASSWORD);
    return p;
  };
  const api = (p, corpo) => p.evaluate(async (c) => {
    const r = await fetch("/api/admin/matricula", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, corpo);

  // 1. anunciante não confere matrícula
  const dono = await sessao("proprietario.teste@arinibrasil.com.br");
  const negado = await api(dono, { property_id: imovel.id, numero: NUMERO, conferir: true });
  ok("anunciante não marca matrícula como conferida (403)", negado.status === 403, negado.status);

  // 2. Matriz grava e confere
  const matriz = await sessao("admin@arinibrasil.com.br");
  const gravou = await api(matriz, { property_id: imovel.id, numero: NUMERO, cartorio: "CRI de Teste", conferir: true });
  ok("Matriz grava e confere a matrícula", gravou.status === 200 && !!gravou.json?.matricula?.conferida_em, JSON.stringify(gravou.json));
  const mudou = await api(matriz, { property_id: imovel.id, numero: NUMERO + "1", cartorio: "CRI de Teste", conferir: false });
  ok("mudar o número tira a conferência", mudou.status === 200 && mudou.json?.matricula?.conferida_em === null, JSON.stringify(mudou.json));
  await api(matriz, { property_id: imovel.id, numero: NUMERO, cartorio: "CRI de Teste", conferir: true });

  // 3. ficha da Matriz mostra o número
  await matriz.goto(`${BASE}/admin/imoveis/${imovel.id}`, { waitUntil: "networkidle2", timeout: 180000 });
  const valorCampo = await matriz.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value));
  ok("ficha da Matriz mostra o número", valorCampo.includes(NUMERO));

  // 4. site público: selo sim, número não
  const visitante = await sessao(null);
  await visitante.goto(`${BASE}/imovel/${imovel.codigo}`, { waitUntil: "networkidle2", timeout: 180000 });
  const html = await visitante.content();
  ok("anúncio público mostra 'Matrícula conferida pela Arini'", html.includes("Matrícula conferida pela Arini"));
  ok("anúncio público NÃO mostra o número", !html.includes(NUMERO));

  // 5. banco: anônimo não lê a tabela
  const { data: vazou } = await anon.from("property_matriculas").select("numero").limit(5);
  ok("anônimo não lê property_matriculas (RLS)", !vazou || vazou.length === 0, JSON.stringify(vazou));

  // 6. lote urbano tem o atalho do mapa do ONR
  await visitante.goto(`${BASE}/consulta/lote/${lote.id}`, { waitUntil: "networkidle2", timeout: 180000 });
  const temBotao = await visitante.evaluate(() => document.body.innerText.includes("Ver matrícula no mapa dos cartórios (ONR)"));
  ok("consulta do lote tem o botão do mapa do ONR", temBotao);
} finally {
  // desfaz: volta ao que havia antes do teste
  if (original) await admin.from("property_matriculas").upsert(original, { onConflict: "property_id" });
  else await admin.from("property_matriculas").delete().eq("property_id", imovel.id);
  await admin.from("audit_log").delete().eq("entidade", "property_matriculas").eq("entidade_id", imovel.id).like("dados_depois->>numero", "TESTE-%");
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
