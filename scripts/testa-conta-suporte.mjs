// Teste do pacote de 07/10/2026 (migration 0035): Minha conta (foto e
// preferências), organização (convite → vínculo no login → plano da
// organização), suporte ao vivo (polling com ?since, selo de não lidos,
// presença), versões de documento e demandas sem imóvel. Tudo o que cria é
// apagado no fim.
//
// Uso: node scripts/testa-conta-suporte.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SENHA_SEED = process.env.SEED_USER_PASSWORD;
const PROP = "proprietario.teste@arinimaps.com.br";
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 220) : ""}`); };

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox", "--window-size=1440,900"],
});
const sessao = async (email, senha) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 120000 });
  if (process.env.SITE_SENHA && p.url().includes("/acesso")) {
    await p.evaluate(async (s) => { await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) }); }, process.env.SITE_SENHA);
    await p.goto(`${BASE}/entrar`, { waitUntil: "networkidle2", timeout: 120000 });
  }
  const r = await api(p, "/api/auth/entrar", { email, senha });
  ok(`login ${email}`, r.status === 200, r.corpo);
  return p;
};
const api = (p, url, body, method = "POST") => p.evaluate(async (u, bd, m) => {
  const r = await fetch(u, { method: m, headers: bd === undefined ? {} : { "Content-Type": "application/json" }, body: bd === undefined ? undefined : JSON.stringify(bd) });
  const t = await r.text();
  let json = null; try { json = JSON.parse(t); } catch {}
  return { status: r.status, corpo: t.slice(0, 300), json };
}, url, body, method);

const limpar = { orgs: [], tickets: [], demandas: [], docs: [] };
let prefsOriginais = null;
try {
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 500 });
  const propId = lista.users.find((u) => u.email === PROP)?.id;
  const { data: perfil0 } = await admin.from("profiles").select("preferencias, avatar_url").eq("user_id", propId).single();
  prefsOriginais = perfil0;

  // ---------- organização: convite antes do login vira vínculo no login ----------
  const { data: org } = await admin.from("organizations").insert({ nome: "TESTE Imobiliária", tipo: "imobiliaria", plan_id: "organizacao" }).select("id").single();
  limpar.orgs.push(org.id);
  await admin.from("organization_members").insert({ org_id: org.id, email: PROP, papel_org: "admin" });

  const prop = await sessao(PROP, SENHA_SEED);
  await new Promise((r) => setTimeout(r, 1500)); // o vínculo é fire-and-forget
  const { data: m } = await admin.from("organization_members").select("status").eq("org_id", org.id).eq("email", PROP).single();
  ok("convite pendente aceito no login", m?.status === "ativo", JSON.stringify(m));
  const convite = await api(prop, "/api/conta/organizacao", { acao: "convidar", email: "colega.teste@exemplo.com" });
  ok("admin da organização convida (plano com multiusuario)", convite.status === 200, convite.corpo);
  const pagOrg = await prop.goto(`${BASE}/painel/organizacao`, { waitUntil: "networkidle2" });
  ok("/painel/organizacao abre", pagOrg?.status() === 200 && (await prop.content()).includes("TESTE Imobiliária"));

  // ---------- preferências ----------
  const g = await api(prop, "/api/conta/preferencias", undefined, "GET");
  ok("GET /api/conta/preferencias", g.status === 200 && g.json?.preferencias?.tema, g.corpo);
  const pa = await api(prop, "/api/conta/preferencias", { tema: "claro", mapa_base: "mapa", lixo: 1 }, "PATCH");
  ok("PATCH grava só chaves válidas", pa.status === 200 && pa.json?.preferencias?.tema === "claro" && pa.json?.preferencias?.mapa_base === "mapa", pa.corpo);
  const ruim = await api(prop, "/api/conta/preferencias", { tema: "roxo" }, "PATCH");
  ok("PATCH inválido = 400", ruim.status === 400, ruim.corpo);

  // ---------- foto ----------
  const foto = await prop.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"); x.fillStyle = "#2FA866"; x.fillRect(0, 0, 64, 64);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/webp", 0.8));
    const fd = new FormData(); fd.set("foto", blob, "f.webp");
    const r = await fetch("/api/conta/avatar", { method: "POST", body: fd });
    return { status: r.status, json: await r.json() };
  });
  ok("upload da foto (avatars/<user>/<ts>.webp)", foto.status === 200 && /\/avatars\/.+\.webp$/.test(foto.json?.avatar_url ?? ""), JSON.stringify(foto));
  const pagConta = await prop.goto(`${BASE}/conta`, { waitUntil: "networkidle2" });
  ok("/conta abre com a foto", pagConta?.status() === 200 && (await prop.content()).includes("avatars/"));

  // ---------- suporte ao vivo ----------
  const t = await api(prop, "/api/suporte", { assunto: "TESTE chat ao vivo", mensagem: "Mensagem de teste do chat", categoria: "duvida" });
  ok("abre chamado", t.status === 200, t.corpo);
  limpar.tickets.push(t.json?.id);
  const p1 = await api(prop, `/api/suporte/${t.json?.id}`, undefined, "GET");
  ok("GET da conversa (dono)", p1.status === 200 && p1.json?.mensagens?.length === 1, p1.corpo);
  const ultima = p1.json?.mensagens?.at(-1)?.created_at;

  const equipe = await sessao("admin@arinimaps.com.br", SENHA_SEED);
  const nl = await api(equipe, "/api/admin/suporte/nao-lidos", undefined, "GET");
  ok("selo de não lidos conta o chamado", nl.status === 200 && nl.json?.ids?.includes(t.json?.id), nl.corpo);
  const resp = await api(equipe, "/api/admin/suporte", { id: t.json?.id, mensagem: "Resposta da equipe" }, "PATCH");
  ok("equipe responde", resp.status === 200, resp.corpo);
  const p2 = await api(prop, `/api/suporte/${t.json?.id}?since=${encodeURIComponent(ultima)}`, undefined, "GET");
  ok("cliente recebe só a mensagem nova (?since)", p2.json?.mensagens?.length === 1 && p2.json.mensagens[0].da_equipe, p2.corpo);
  ok("atendente online (equipe ativa há pouco)", p2.json?.atendente_online === true, p2.corpo);
  const alheio = await api(equipe, `/api/suporte/${t.json?.id}`, undefined, "GET");
  ok("outra conta não lê a conversa pelo lado do cliente", alheio.status === 404, alheio.corpo);

  // ---------- demandas ----------
  const dm = await api(equipe, "/api/demandas", { cliente_nome: "TESTE Cliente", tipo: "rural", valor_min: 100, valor_max: 50 });
  ok("demanda com faixa invertida = 400", dm.status === 400, dm.corpo);
  const d2 = await api(equipe, "/api/demandas", { cliente_nome: "TESTE Cliente", tipo: "rural", valor_max: 5000000 });
  ok("registra demanda", d2.status === 200 && /^DEM-/.test(d2.json?.codigo ?? ""), d2.corpo);
  limpar.demandas.push(d2.json?.id);
  const fecha = await api(equipe, `/api/demandas/${d2.json?.id}`, { status: "cancelada", motivo: "teste" }, "PATCH");
  ok("cancela demanda", fecha.status === 200, fecha.corpo);
  const semSetor = await api(prop, "/api/demandas", { cliente_nome: "X" });
  ok("conta externa não registra demanda (403)", semSetor.status === 403, semSetor.corpo);

  // ---------- versões de documento ----------
  const { data: imovel } = await admin.from("properties").select("id").eq("status", "publicado").limit(1).single();
  for (const n of [1, 2]) {
    const r = await equipe.evaluate(async (id, n) => {
      const fd = new FormData(); fd.set("tipo", "itr"); fd.set("arquivo", new Blob([`%PDF-1.4
% versao ${n}
%%EOF`], { type: "application/pdf" }), `itr-v${n}.pdf`);
      const res = await fetch(`/api/imoveis/${id}/documentos`, { method: "POST", body: fd });
      return { status: res.status, json: await res.json() };
    }, imovel.id, n);
    ok(`upload ITR v${n}`, r.status === 200 && r.json?.versao >= n, JSON.stringify(r));
  }
  const lista2 = await api(equipe, `/api/imoveis/${imovel.id}/documentos?versoes=1`, undefined, "GET");
  const itrAtual = lista2.json?.documentos?.filter((d) => d.tipo === "itr") ?? [];
  const itrVelhos = lista2.json?.anteriores?.filter((d) => d.tipo === "itr") ?? [];
  ok("só uma versão vigente de ITR", itrAtual.length === 1, JSON.stringify(itrAtual.map((d) => d.versao)));
  ok("versão anterior listada com quem enviou", itrVelhos.length >= 1 && "enviado_por_nome" in itrVelhos[0], JSON.stringify(itrVelhos.map((d) => d.versao)));
  const { data: docs } = await admin.from("property_documents").select("id, storage_path").eq("property_id", imovel.id).eq("tipo", "itr").like("nome_arquivo", "itr-v%");
  limpar.docs.push(...(docs ?? []));
} finally {
  for (const id of limpar.orgs) await admin.from("organizations").delete().eq("id", id);
  for (const id of limpar.tickets.filter(Boolean)) await admin.from("support_tickets").delete().eq("id", id);
  for (const id of limpar.demandas.filter(Boolean)) await admin.from("demandas").delete().eq("id", id);
  if (limpar.docs.length) {
    await admin.from("property_documents").update({ substituido_por: null }).in("id", limpar.docs.map((d) => d.id));
    await admin.from("property_documents").delete().in("id", limpar.docs.map((d) => d.id));
    await admin.storage.from("docs").remove(limpar.docs.map((d) => d.storage_path));
  }
  if (prefsOriginais) {
    const { data: lista } = await admin.auth.admin.listUsers({ perPage: 500 });
    const propId = lista.users.find((u) => u.email === PROP)?.id;
    const { data: atual } = await admin.from("profiles").select("avatar_url").eq("user_id", propId).single();
    const m = /\/public\/media\/(avatars\/.+)$/.exec(atual?.avatar_url ?? "");
    if (m && atual.avatar_url !== prefsOriginais.avatar_url) await admin.storage.from("media").remove([m[1]]);
    await admin.from("profiles").update({ preferencias: prefsOriginais.preferencias, avatar_url: prefsOriginais.avatar_url }).eq("user_id", propId);
  }
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
