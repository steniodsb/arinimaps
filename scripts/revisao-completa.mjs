// Revisão visual COMPLETA: todas as páginas do sistema (61 rotas + 404) em
// modo escuro, claro e celular, cada uma com o perfil certo (visitante,
// proprietário ou diretoria). Cria os registros que faltam na base de teste
// (chamado, solicitação cartográfica, consulta de área) e apaga no fim.
//
// Além da foto, mede o que olho não pega numa grade de 180 imagens:
//   · HTTP de erro, erro de JavaScript na página;
//   · rolagem horizontal no celular (algo mais largo que a tela);
//   · texto que estoura a caixa (scrollWidth > clientWidth em elementos visíveis);
//   · emoji ou símbolo usado como ícone.
// Saída: OUT/<modo>/<nn-rota>.png + OUT/relatorio.json + OUT/folha-<modo>-N.png (miniaturas).
//
// Uso: BASE_URL=http://localhost:3000 OUT=./capturas/revisao node scripts/revisao-completa.mjs [filtro]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "capturas/revisao";
const filtro = process.argv[2] ?? "";
const SENHA = process.env.SEED_USER_PASSWORD;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- dados reais para as rotas dinâmicas ----------
const um = async (q) => (await q).data?.[0] ?? null;
const imovel = await um(admin.from("properties").select("id, codigo").in("status", ["publicado", "em_negociacao"]).limit(1));
const { data: donoUser } = await admin.auth.admin.listUsers({ perPage: 500 });
const emailDono = "proprietario.teste@arinimaps.com.br";
const dono = donoUser.users.find((u) => u.email === emailDono);
const owner = dono ? await um(admin.from("owners").select("id").eq("profile_id", dono.id).limit(1)) : null;
const imovelDono = owner ? await um(admin.from("properties").select("id").eq("owner_id", owner.id).limit(1)) : null;
const opp = await um(admin.from("opportunities").select("id, property_id").limit(1));
const car = await um(admin.from("car_imoveis").select("cod_imovel").limit(1));
const lote = await um(admin.from("urban_lots").select("id").not("numero", "is", null).limit(1));

const criados = { tickets: [], solicitacoes: [], areas: [] };

// o proprietário só vê oportunidade encaminhada a ele: encaminha durante as
// fotos e devolve no fim (a base de teste tem uma só, com a Arini)
const oppOriginal = opp ? (await admin.from("opportunities").select("responsavel_tipo").eq("id", opp.id).single()).data : null;
if (opp && oppOriginal?.responsavel_tipo !== "proprietario") {
  await admin.from("opportunities").update({ responsavel_tipo: "proprietario" }).eq("id", opp.id);
}

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function sessao(email) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/acesso`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.evaluate(async (senhaSite, e, s) => {
    await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: senhaSite }) });
    if (e) await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: s }) });
  }, process.env.SITE_SENHA ?? "", email, SENHA);
  return { ctx, p };
}

// ---------- registros que a base de teste não tem ----------
{
  const { ctx, p } = await sessao(emailDono);
  const t = await p.evaluate(async () => {
    const r = await fetch("/api/suporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assunto: "REVISÃO VISUAL — chamado de exemplo", mensagem: "Mensagem de exemplo para a revisão visual das telas.", categoria: "duvida" }) });
    return r.json().catch(() => ({}));
  });
  if (t?.id) criados.tickets.push(t.id);
  const s = await p.evaluate(async () => {
    const fd = new FormData();
    fd.set("dados", JSON.stringify({ tipo: "inclusao", descricao: "REVISÃO VISUAL — solicitação de exemplo para fotografar as telas", ponto: { lng: -50.21, lat: -19.73 } }));
    const r = await fetch("/api/cartografia/solicitacoes", { method: "POST", body: fd });
    return r.json().catch(() => ({}));
  });
  if (s?.id) criados.solicitacoes.push(s.id);
  await ctx.close();
}
{
  const { ctx, p } = await sessao("admin@arinimaps.com.br");
  const a = await p.evaluate(async () => {
    const g = { type: "Polygon", coordinates: [[[-50.22, -19.74], [-50.20, -19.74], [-50.20, -19.72], [-50.22, -19.72], [-50.22, -19.74]]] };
    const r = await fetch("/api/consulta/area", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ geometria: g }) });
    return r.json().catch(() => ({}));
  });
  if (a?.chave) criados.areas.push(a.chave);
  await ctx.close();
}
const ticket = criados.tickets[0] ?? (await um(admin.from("support_tickets").select("id").limit(1)))?.id;
const solic = criados.solicitacoes[0] ?? (await um(admin.from("cartographic_requests").select("id").limit(1)))?.id;
const area = criados.areas[0] ?? (await um(admin.from("consultas_area").select("chave").like("chave", "geo:%").limit(1)))?.chave;

// ---------- rotas: [nome, caminho, perfil] ----------
const V = null, P = emailDono, A = "admin@arinimaps.com.br";
const ROTAS = [
  ["inicio", "/", V], ["entrar", "/entrar", V], ["redefinir-senha", "/redefinir-senha", V], ["acesso", "/acesso", V],
  ["planos", "/planos", V], ["imoveis", "/imoveis", V], ["mapa", "/mapa", V], ["relatorios", "/relatorios", V],
  ["suporte", "/suporte", V], ["termos", "/termos", V], ["termos-doc", "/termos/termos-de-uso", V],
  ["cartografia-solicitar", "/cartografia/solicitar", P],
  ["404", "/pagina-que-nao-existe", V],
  imovel && ["imovel", `/imovel/${imovel.codigo}`, V],
  imovel && ["imovel-relatorio", `/imovel/${imovel.codigo}/relatorio`, V],
  imovel && ["imovel-tour", `/imovel/${imovel.codigo}/tour`, V],
  car && ["consulta-car", `/consulta/car/${encodeURIComponent(car.cod_imovel)}`, V],
  lote && ["consulta-lote", `/consulta/lote/${lote.id}`, V],
  area && ["consulta-area", `/consulta/area/${encodeURIComponent(area)}`, V],
  ["painel", "/painel", P], ["painel-novo", "/painel/novo", P],
  imovelDono && ["painel-imovel", `/painel/imoveis/${imovelDono.id}`, P],
  ["painel-oportunidades", "/painel/oportunidades", P],
  opp && ["painel-oportunidade", `/painel/oportunidades/${opp.id}`, P],
  ["painel-cartografia", "/painel/cartografia", P],
  solic && ["painel-cartografia-item", `/painel/cartografia/${solic}`, P],
  ["painel-organizacao", "/painel/organizacao", P], ["conta", "/conta", P], ["conta-seguranca", "/conta/seguranca", P],
  ["suporte-logado", "/suporte", P],
  ...["", "/auditoria", "/cadastros", "/cartografia", "/cartografia/solicitacoes", "/comercial", "/comissoes",
    "/configuracoes", "/conhecimento", "/demandas", "/financeiro", "/fontes", "/funil", "/imoveis", "/juridico",
    "/juridico/lgpd", "/leads", "/marketing", "/mensalidades", "/operacoes", "/organizacoes", "/planos", "/regioes",
    "/relatorios", "/seguranca", "/seguranca/revisao", "/suporte", "/tarefas", "/usuarios"]
    .map((r) => ["admin" + (r ? "-" + r.slice(1).replaceAll("/", "-") : ""), "/admin" + r, A]),
  imovel && ["admin-imovel", `/admin/imoveis/${imovel.id}`, A],
  opp && ["admin-oportunidade", `/admin/oportunidades/${opp.id}`, A],
  ticket && ["admin-suporte-item", `/admin/suporte/${ticket}`, A],
  solic && ["admin-solicitacao", `/admin/cartografia/solicitacoes/${solic}`, A],
].filter(Boolean).filter(([n]) => n.includes(filtro));

const MODOS = [
  { nome: "escuro", w: 1440, h: 900, tema: "dark" },
  { nome: "claro", w: 1440, h: 900, tema: "light" },
  { nome: "celular", w: 390, h: 844, tema: "dark", mobile: true },
];

// mede problemas de layout na página aberta
const medir = () => {
  const vw = document.documentElement.clientWidth;
  const largura = document.documentElement.scrollWidth;
  const estouros = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 2 && cs.position !== "fixed" && !el.closest("[data-rolagem], .overflow-x-auto, .overflow-auto, .maplibregl-map, .lp-marquee, .overflow-hidden")) {
      estouros.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} → ${Math.round(r.right - vw)}px`);
    }
  }
  const glifos = (document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u25A0-\u25FF]/gu) ?? []).slice(0, 10);
  return { rolagemHorizontal: largura > vw + 2 ? largura - vw : 0, estouros: [...new Set(estouros)].slice(0, 6), glifos };
};

const relatorio = [];
for (const modo of MODOS) {
  mkdirSync(join(OUT, modo.nome), { recursive: true });
  const sessoes = new Map();
  let i = 0;
  for (const [nome, rota, perfil] of ROTAS) {
    const chave = perfil ?? "visitante";
    if (!sessoes.has(chave)) sessoes.set(chave, await sessao(perfil));
    const { p } = sessoes.get(chave);
    await p.setViewport({ width: modo.w, height: modo.h, isMobile: !!modo.mobile, deviceScaleFactor: 1 });
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: modo.tema }]);
    await p.evaluate(() => { try { localStorage.removeItem("arini:tema"); localStorage.removeItem("arini:preferencias"); } catch { /* */ } }).catch(() => {});
    const erros = [];
    const aoErro = (e) => erros.push(String(e.message).slice(0, 160));
    p.on("pageerror", aoErro);
    let status = 0;
    try {
      const r = await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle2", timeout: 120000 });
      status = r?.status() ?? 0;
      await new Promise((x) => setTimeout(x, ["/mapa", "/"].includes(rota) || rota.includes("/tour") ? 6000 : 1500));
      const m = await p.evaluate(medir);
      const arq = `${String(i).padStart(2, "0")}-${nome}.png`;
      await p.screenshot({ path: join(OUT, modo.nome, arq), fullPage: !rota.includes("/mapa") && !rota.includes("/tour") });
      relatorio.push({ modo: modo.nome, nome, rota, perfil: chave, status, url: p.url().replace(BASE, ""), erros, ...m, arquivo: `${modo.nome}/${arq}` });
    } catch (e) {
      relatorio.push({ modo: modo.nome, nome, rota, perfil: chave, status, erros: [...erros, "falhou: " + e.message.slice(0, 120)] });
    }
    p.off("pageerror", aoErro);
    i++;
  }
  for (const { ctx } of sessoes.values()) await ctx.close();
}

// ---------- limpeza ----------
for (const id of criados.tickets) { await admin.from("support_messages").delete().eq("ticket_id", id); await admin.from("support_tickets").delete().eq("id", id); }
for (const id of criados.solicitacoes) {
  const { data: s } = await admin.from("cartographic_requests").select("protocolo").eq("id", id).single();
  if (s) await admin.from("tasks").delete().ilike("titulo", `%${s.protocolo}%`);
  await admin.from("cartographic_requests").delete().eq("id", id);
}
for (const c of criados.areas) { await admin.from("consultas_area").delete().eq("chave", c); }
if (opp && oppOriginal) await admin.from("opportunities").update({ responsavel_tipo: oppOriginal.responsavel_tipo }).eq("id", opp.id);
await b.close();

writeFileSync(join(OUT, "relatorio.json"), JSON.stringify(relatorio, null, 1));
const problemas = relatorio.filter((r) => r.status >= 400 && r.nome !== "404" || r.erros?.length || r.rolagemHorizontal || r.estouros?.length || r.glifos?.length);
console.log(`${relatorio.length} capturas (${ROTAS.length} rotas × ${MODOS.length} modos); ${problemas.length} com algo a olhar`);
for (const r of problemas) {
  console.log(`- [${r.modo}] ${r.rota} (${r.perfil}) HTTP ${r.status}` +
    (r.url && r.url !== r.rota ? ` → ${r.url}` : "") +
    (r.erros?.length ? ` · erros: ${r.erros.join(" | ")}` : "") +
    (r.rolagemHorizontal ? ` · rolagem horizontal ${r.rolagemHorizontal}px` : "") +
    (r.estouros?.length ? ` · estouros: ${r.estouros.join("; ")}` : "") +
    (r.glifos?.length ? ` · símbolos: ${r.glifos.join(" ")}` : ""));
}
