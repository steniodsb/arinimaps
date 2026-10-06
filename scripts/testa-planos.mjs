// Teste da rodada de 05/10/2026: planos por nicho (trava + cota + tentativa
// registrada), solicitação cartográfica (protocolo → fila da Matriz → status),
// alteração de anúncio publicado (nova versão, anúncio continua no ar) e
// rastreabilidade (versões da divisa, eventos). Tudo o que cria é apagado.
//
// Uso: node scripts/testa-planos.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "consulta.teste@arinimaps.com.br";
const SENHA = "ConsultaTeste2026x";
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 220) : ""}`); };

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
});
const nova = async () => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 120000 });
  // trava do site (fase de testes)
  if (process.env.SITE_SENHA && p.url().includes("/acesso")) {
    await p.evaluate(async (senha) => {
      await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    }, process.env.SITE_SENHA);
    await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 120000 });
  }
  return p;
};
const api = (p, url, body, method = "POST") => p.evaluate(async (u, bd, m) => {
  const r = await fetch(u, { method: m, headers: bd === undefined ? {} : { "Content-Type": "application/json" }, body: bd === undefined ? undefined : JSON.stringify(bd) });
  const t = await r.text();
  let json = null; try { json = JSON.parse(t); } catch {}
  return { status: r.status, corpo: t.slice(0, 300), json };
}, url, body, method);
const html = async (p, url) => { const r = await p.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 120000 }); return { status: r?.status() ?? 0, texto: await p.evaluate(() => document.body.innerText) }; };

let userId = null;
let solicitacaoId = null;
let revisaoId = null;
let valorOriginal = null;
let imovelId = null;
try {
  const { data: l0 } = await admin.auth.admin.listUsers({ perPage: 500 });
  const velho = l0.users.find((u) => u.email === EMAIL);
  if (velho) await admin.auth.admin.deleteUser(velho.id);

  // ---------- 1. conta de consulta nasce no plano básico ----------
  const p = await nova();
  const cad = await api(p, "/api/cadastro", { email: EMAIL, senha: SENHA, nome: "Consulta Teste", role: "consulta", nicho: "consulta", cpf: "52998224725", aceite_termos: true });
  ok("cadastro de conta de consulta", cad.status === 200, cad.corpo);
  const { data: l1 } = await admin.auth.admin.listUsers({ perPage: 500 });
  userId = l1.users.find((u) => u.email === EMAIL)?.id ?? null;
  const { data: perfil } = await admin.from("profiles").select("role, nicho, plan_id, plan_origem").eq("user_id", userId).single();
  ok("nicho e plano padrão atribuídos pelo gatilho", perfil?.nicho === "consulta" && perfil?.plan_id === "consulta_basica" && perfil?.plan_origem === "padrao", JSON.stringify(perfil));
  ok("login", (await api(p, "/api/auth/entrar", { email: EMAIL, senha: SENHA })).status === 200);

  // ---------- 2. cota do plano básico e tentativa registrada ----------
  const { data: car } = await admin.from("car_imoveis").select("cod_imovel").limit(1).maybeSingle();
  const cod = car?.cod_imovel;
  ok("há área do CAR importada para testar", !!cod, cod);
  if (cod) {
    // esgota a cota do mês sem bater nos órgãos
    await admin.from("consultas_area_log").insert([
      { user_id: userId, chave: `car:${cod}`, acao: "consulta" },
      { user_id: userId, chave: `car:${cod}`, acao: "consulta" },
    ]);
    const negada = await api(p, `/api/consulta/car/${encodeURIComponent(cod)}`);
    ok("consulta além da cota do básico é bloqueada (403 cota_esgotada)", negada.status === 403 && negada.json?.codigo === "cota_esgotada", negada.corpo);
    const { data: tent } = await admin.from("access_attempts").select("recurso, motivo").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ok("tentativa bloqueada ficou registrada (fluxograma §20)", tent?.recurso === "consulta_area" && /cota/.test(tent?.motivo ?? ""), JSON.stringify(tent));
    const pagina = await html(p, `/consulta/car/${encodeURIComponent(cod)}`);
    ok("página da consulta mostra o plano/cota", pagina.status === 200 && /consulta|plano/i.test(pagina.texto));
  }
  const semPlano = await api(p, "/api/admin/planos", { id: "consulta_basica", preco_mensal: 1 }, "PATCH");
  ok("conta comum não edita planos (403)", semPlano.status === 403, semPlano.corpo);

  // ---------- 3. Diretoria troca o plano da conta ----------
  const a = await nova();
  ok("login da diretoria", (await api(a, "/api/auth/entrar", { email: "admin@arinimaps.com.br", senha: process.env.SEED_USER_PASSWORD })).status === 200);
  const troca = await api(a, "/api/admin/usuarios", { user_id: userId, plan_id: "consulta_profissional", plan_origem: "manual" }, "PATCH");
  ok("diretoria define plano profissional", troca.status === 200, troca.corpo);
  const { data: perfil2 } = await admin.from("profiles").select("plan_id, plan_origem").eq("user_id", userId).single();
  ok("plano gravado como manual", perfil2?.plan_id === "consulta_profissional" && perfil2?.plan_origem === "manual", JSON.stringify(perfil2));
  const planos = await html(a, "/admin/planos");
  ok("tela de planos da diretoria abre", planos.status === 200 && /Consulta profissional/.test(planos.texto));
  const publica = await html(p, "/planos");
  ok("página pública de planos mostra o plano da conta", publica.status === 200 && /Seu plano/.test(publica.texto));
  const mapa = await html(p, "/mapa");
  ok("mapa abre para a conta", mapa.status === 200);

  // ---------- 4. solicitação cartográfica ----------
  const sol = await p.evaluate(async () => {
    const fd = new FormData();
    fd.set("dados", JSON.stringify({ tipo: "inclusao", descricao: "TESTE AUTOMATIZADO — meu sítio não aparece no mapa", ponto: { lng: -50.21, lat: -19.73 } }));
    fd.append("arquivos", new File([new Uint8Array(1024)], "croqui.png", { type: "image/png" }));
    const r = await fetch("/api/cartografia/solicitacoes", { method: "POST", body: fd });
    const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch {}
    return { status: r.status, corpo: t.slice(0, 300), json };
  });
  ok("solicitação criada com protocolo", sol.status === 200 && /^CART-\d{6}$/.test(sol.json?.protocolo ?? ""), sol.corpo);
  solicitacaoId = sol.json?.id ?? null;
  if (solicitacaoId) {
    const { data: s } = await admin.from("cartographic_requests").select("status, arquivos, ponto").eq("id", solicitacaoId).single();
    ok("ponto, arquivo e status inicial gravados", s?.status === "recebida" && Array.isArray(s?.arquivos) && s.arquivos.length === 1 && !!s?.ponto, JSON.stringify({ status: s?.status, n: s?.arquivos?.length, ponto: !!s?.ponto }));
    const { data: tarefa } = await admin.from("tasks").select("id, setor").ilike("titulo", `%${sol.json.protocolo}%`).maybeSingle();
    ok("tarefa aberta para o setor de cartografia", tarefa?.setor === "cartografia", JSON.stringify(tarefa));
    const minhas = await html(p, "/painel/cartografia");
    ok("solicitante vê a solicitação no painel", minhas.status === 200 && minhas.texto.includes(sol.json.protocolo));
    const tri = await api(a, `/api/admin/cartografia/solicitacoes/${solicitacaoId}`, { acao: "status", status: "em_triagem", mensagem: "Recebemos, vamos conferir." }, "PATCH");
    ok("Matriz move para triagem", tri.status === 200, tri.corpo);
    const pulo = await api(a, `/api/admin/cartografia/solicitacoes/${solicitacaoId}`, { acao: "status", status: "publicada" }, "PATCH");
    ok("transição inválida é recusada pelo banco", pulo.status >= 400, pulo.corpo);
    const { data: ev } = await admin.from("cartographic_request_events").select("para_status").eq("request_id", solicitacaoId).order("created_at");
    ok("eventos registrados na ordem", (ev ?? []).map((e) => e.para_status).filter(Boolean).join(">") === "recebida>em_triagem", JSON.stringify(ev));
    const fila = await html(a, "/admin/cartografia/solicitacoes");
    ok("fila da Matriz lista o protocolo", fila.status === 200 && fila.texto.includes(sol.json.protocolo));
    const det = await html(a, `/admin/cartografia/solicitacoes/${solicitacaoId}`);
    ok("detalhe da solicitação abre", det.status === 200 && det.texto.includes(sol.json.protocolo));
  }

  // ---------- 5. alteração de anúncio publicado (§9) ----------
  const { data: prop } = await admin.from("owners").select("id, profile_id").limit(20);
  const donos = prop ?? [];
  let imovel = null;
  for (const d of donos) {
    const { data: im } = await admin.from("properties").select("id, codigo, valor, status").eq("owner_id", d.id).in("status", ["publicado", "em_negociacao"]).limit(1).maybeSingle();
    if (im) { imovel = { ...im, profile_id: d.profile_id }; break; }
  }
  ok("há imóvel publicado de proprietário para testar revisão", !!imovel, imovel?.codigo);
  if (imovel) {
    imovelId = imovel.id; valorOriginal = imovel.valor;
    const { data: { user: dono } } = await admin.auth.admin.getUserById(imovel.profile_id);
    const d = await nova();
    const log = await api(d, "/api/auth/entrar", { email: dono.email, senha: process.env.SEED_USER_PASSWORD });
    ok("login do proprietário", log.status === 200, log.corpo);
    const rev = await api(d, `/api/imoveis/${imovelId}/revisao`, { valor: Number(imovel.valor ?? 0) + 1000, titulo: "TESTE alteração proposta" });
    ok("proprietário propõe alteração", rev.status === 200, rev.corpo);
    revisaoId = rev.json?.id ?? null;
    const { data: ainda } = await admin.from("properties").select("status, valor, titulo").eq("id", imovelId).single();
    ok("anúncio continua publicado e sem alterar durante a análise", ainda?.status === imovel.status && Number(ainda?.valor) === Number(imovel.valor), JSON.stringify(ainda));
    const dup = await api(d, `/api/imoveis/${imovelId}/revisao`, { valor: 1 });
    ok("segunda proposta pendente é recusada (409)", dup.status === 409, dup.corpo);
    const adm = await html(a, `/admin/imoveis/${imovelId}`);
    ok("ficha admin mostra rastreabilidade e a alteração proposta", adm.status === 200 && /Rastreabilidade|Versões da divisa/.test(adm.texto) && /proposta/i.test(adm.texto));
    const apr = await api(a, "/api/admin/decisao", { alvo: "revisao", id: revisaoId, acao: "aprovar" });
    ok("Matriz aprova a alteração", apr.status === 200, apr.corpo);
    const { data: depois } = await admin.from("properties").select("status, valor, titulo").eq("id", imovelId).single();
    ok("campos aplicados e anúncio segue publicado", depois?.status === imovel.status && Number(depois?.valor) === Number(imovel.valor) + 1000 && depois?.titulo === "TESTE alteração proposta", JSON.stringify(depois));
    const { data: versoes } = await admin.from("property_geometry_versions").select("versao, situacao").eq("property_id", imovelId);
    ok("imóvel tem versão da divisa registrada", (versoes ?? []).length >= 1, JSON.stringify(versoes));
    await html(p, `/imovel/${imovel.codigo}`);
    const { data: evs } = await admin.from("property_events").select("tipo").eq("property_id", imovelId).eq("tipo", "ficha").limit(1);
    ok("abertura da ficha gerou evento de histórico (§1.1)", (evs ?? []).length >= 1);
  }
} catch (e) {
  falhas++;
  console.error("✗ erro inesperado:", e);
} finally {
  // ---------- limpeza ----------
  try {
    if (imovelId && valorOriginal != null) {
      // lê o "antes" da revisão ANTES de apagá-la, senão o título fica com o valor de teste
      const { data: antes } = await admin.from("property_revisions").select("dados_anteriores").eq("property_id", imovelId).order("versao", { ascending: false }).limit(1).maybeSingle();
      await admin.from("properties").update({ valor: valorOriginal, titulo: antes?.dados_anteriores?.titulo ?? undefined }).eq("id", imovelId);
      await admin.from("tasks").delete().ilike("titulo", "Alteração proposta%");
    }
    if (revisaoId) await admin.from("property_revisions").delete().eq("id", revisaoId);
    if (solicitacaoId) {
      const { data: s } = await admin.from("cartographic_requests").select("protocolo, arquivos").eq("id", solicitacaoId).single();
      for (const f of s?.arquivos ?? []) await admin.storage.from("docs").remove([f.path]);
      await admin.from("tasks").delete().ilike("titulo", `%${s?.protocolo}%`);
      await admin.from("cartographic_requests").delete().eq("id", solicitacaoId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.error("limpeza falhou:", e.message);
  }
  await b.close();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
