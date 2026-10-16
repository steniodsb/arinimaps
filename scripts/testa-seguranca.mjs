// Testes de segurança antes do lançamento (PENDÊNCIAS 9.5):
//  · força bruta: senha do site, login por e-mail e por IP;
//  · matriz de permissões: cada perfil × cada rota sensível de /api;
//  · IDOR: usuário A não lê, edita nem apaga imóvel, documento, lead,
//    proposta, favorito, chamado, solicitação ou arquivo do usuário B;
//  · território: franqueado de uma região não alcança a outra;
//  · setor: membro da equipe só opera o próprio setor (API e REST);
//  · upload: tipo errado, tamanho acima do limite, caminho com ../;
//  · API pública do banco (chave anon e sessão comum): RLS, funções, storage;
//  · segundo fator: sessão sem o código não usa as APIs da equipe.
//
// Cria os próprios usuários e registros (prefixo "TESTE SEG", e-mails
// seg-teste.*) e apaga tudo no fim; nunca toca em dado real. Poucos logins de
// propósito (o Supabase limita entradas por IP): um membro da equipe só, com
// os setores trocados entre as fases.
//
// Cada sessão usa um `x-real-ip` próprio (faixa 10.250.x.x): em localhost não
// há proxy, e assim os limites por IP do teste não travam o login de ninguém.
//
// Uso: node scripts/testa-seguranca.mjs   (com `npm run dev` rodando)
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- resultado
const placar = { ok: 0, falha: 0, pendente: 0 };
const falhas = [];
let MIG_0046 = false;
/** `migration`: o teste depende da 0046; sem ela aplicada, falha vira "pendente". */
function ok(rotulo, cond, extra = "", migration = false) {
  if (cond) { placar.ok++; console.log(`✓ ${rotulo}`); return; }
  if (migration && !MIG_0046) { placar.pendente++; console.log(`… ${rotulo} — pendente de migration 0046${extra ? " (" + extra + ")" : ""}`); return; }
  placar.falha++; falhas.push(rotulo); console.log(`✗ ${rotulo}${extra ? " — " + extra : ""}`);
}
const negado = (s) => s === 401 || s === 403;

// ---------------------------------------------------------------- HTTP com cookies
const RODADA = Math.floor(Math.random() * 200) + 20;
let ipSeq = 1;
const novoIp = () => `10.250.${RODADA}.${ipSeq++}`;

class Sessao {
  constructor(nome) { this.nome = nome; this.ip = novoIp(); this.cookies = new Map(); }
  guardar(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [par, ...attrs] = c.split(";");
      const i = par.indexOf("=");
      const nome = par.slice(0, i).trim(), valor = par.slice(i + 1).trim();
      if (!valor || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }
  }
  async req(method, path, { json, form, headers = {}, origem = BASE } = {}) {
    const h = { "x-real-ip": this.ip, ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method !== "GET" && method !== "HEAD" && origem) h.origin = origem;
    let body;
    if (form) body = form;
    else if (json !== undefined) { body = JSON.stringify(json); h["content-type"] = "application/json"; }
    const res = await fetch(BASE + path, { method, headers: h, body, redirect: "manual" });
    this.guardar(res);
    const texto = await res.text();
    let dados = null; try { dados = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: res.status, texto: texto.slice(0, 300), html: texto, json: dados, local: res.headers.get("location") };
  }
  /** Passa pela senha de bloqueio do site (fase de testes). */
  async liberar() {
    if (!process.env.SITE_SENHA) return;
    const r = await this.req("POST", "/api/acesso", { json: { senha: process.env.SITE_SENHA } });
    if (r.status !== 200) throw new Error(`senha do site recusada para ${this.nome}: ${r.status}`);
  }
  async entrar(email, senha) {
    const r = await this.req("POST", "/api/auth/entrar", { json: { email, senha } });
    if (r.status !== 200) throw new Error(`login de ${this.nome} falhou: ${r.status} ${r.texto}`);
    return r;
  }
  /** Sessão do Supabase guardada no cookie (para testar a API REST com o token do usuário). */
  sessaoSupabase() {
    const partes = [...this.cookies].filter(([k]) => /^sb-.*-auth-token(\.\d+)?$/.test(k))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([, v]) => decodeURIComponent(v));
    if (!partes.length) return null;
    let s = partes.join("");
    if (s.startsWith("base64-")) s = Buffer.from(s.slice(7), "base64url").toString("utf8");
    try { return JSON.parse(s); } catch { return null; }
  }
}

/** PostgREST direto, com a chave pública e (opcional) o token de uma sessão. */
async function rest(method, caminho, { token, corpo, prefer } = {}) {
  const h = { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, "content-type": "application/json" };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${caminho}`, { method, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch { /* vazio */ }
  return { status: r.status, dados: d, texto: t.slice(0, 200) };
}
const linhas = (r) => (Array.isArray(r.dados) ? r.dados.length : 0);

/** TOTP (RFC 6238), o mesmo cálculo do aplicativo autenticador. */
function totp(segredo) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredo.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", chave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ---------------------------------------------------------------- arquivos de teste
const pdf = (n = 2048) => { const b = Buffer.alloc(n, 0x20); b.write("%PDF-1.4\n", 0); return b; };
const arquivo = (bytes, nome, tipo) => new File([bytes], nome, { type: tipo });
const formDoc = (f, tipo = "matricula") => { const fd = new FormData(); fd.set("arquivo", f); fd.set("tipo", tipo); return fd; };

// ---------------------------------------------------------------- dados de teste
const SENHA = `Seg${randomUUID().slice(0, 8)}Teste9x`;
const EMAIL = (p) => `seg-teste.${p}@arinimaps.com.br`;
const criados = { usuarios: [], props: [], caminhos: [], regiao: null, tickets: [], reqs: [], opps: [], leads: [] };

async function criarUsuario(chave, role, extra = {}) {
  const email = EMAIL(chave);
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const velho = lista.users.find((u) => u.email === email);
  if (velho) await admin.auth.admin.deleteUser(velho.id);
  const equipe = ["admin_central", "analista_arini"].includes(role);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: SENHA, email_confirm: true,
    user_metadata: { nome: `TESTE SEG ${chave}`, role }, app_metadata: equipe ? { role } : {},
  });
  if (error) throw new Error(`criar ${chave}: ${error.message}`);
  criados.usuarios.push(data.user.id);
  const { error: e2 } = await admin.from("profiles").update({ role, nome: `TESTE SEG ${chave}`, ...extra }).eq("user_id", data.user.id);
  if (e2) throw new Error(`perfil ${chave}: ${e2.message}`);
  return { id: data.user.id, email };
}

async function criarImovel(campos, titulo) {
  const { data, error } = await admin.from("properties")
    .insert({ tipo: "urbano", titulo, status: "em_analise", ...campos }).select("id, codigo").single();
  if (error) throw new Error(`imóvel ${titulo}: ${error.message}`);
  criados.props.push(data.id);
  return data;
}

async function criarDocumento(propertyId) {
  const path = `imoveis/${propertyId}/matricula-${randomUUID()}.pdf`;
  const { error } = await admin.storage.from("docs").upload(path, pdf(), { contentType: "application/pdf" });
  if (error) throw new Error(`upload de teste: ${error.message}`);
  criados.caminhos.push(path);
  const { data, error: e2 } = await admin.from("property_documents")
    .insert({ property_id: propertyId, tipo: "matricula", storage_path: path, nome_arquivo: "matricula.pdf" }).select("id").single();
  if (e2) throw new Error(`documento de teste: ${e2.message}`);
  return { id: data.id, path };
}

// =================================================================== execução
const t0 = Date.now();
try {
  // a 0046 está no banco? (fn_tem_setor nasce nela)
  const { error: semMig } = await admin.rpc("fn_tem_setor", { p_setor: "comercial" });
  MIG_0046 = !semMig;
  console.log(`migration 0046 ${MIG_0046 ? "aplicada" : "NÃO aplicada — testes que dependem dela ficam como pendentes"}\n`);

  // ---------- usuários (7 logins no total, + 9 tentativas de força bruta e 1 do MFA)
  const comprador = await criarUsuario("comprador", "comprador");
  const propA = await criarUsuario("prop-a", "proprietario");
  const propB = await criarUsuario("prop-b", "proprietario");
  const franqA = await criarUsuario("franq-a", "franqueado");
  const franqB = await criarUsuario("franq-b", "franqueado");
  const equipe = await criarUsuario("equipe", "analista_arini", { setores: [] });
  const diretoria = await criarUsuario("diretoria", "admin_central");

  const { data: regiao1 } = await admin.from("regions").select("id").order("created_at").limit(1).single();
  const { data: regiao2, error: eReg } = await admin.from("regions").insert({ nome: "TESTE SEG região B" }).select("id").single();
  if (eReg) throw new Error(`região de teste: ${eReg.message}`);
  criados.regiao = regiao2.id;

  const owner = async (u) => (await admin.from("owners").insert({ profile_id: u.id, status: "ativo" }).select("id").single()).data;
  const parceiro = async (u, region_id) =>
    (await admin.from("partners").insert({ profile_id: u.id, tipo: "franqueado", status: "ativo", region_id }).select("id").single()).data;
  const oA = await owner(propA), oB = await owner(propB);
  const pFA = await parceiro(franqA, regiao1.id), pFB = await parceiro(franqB, regiao2.id);
  if (!oA || !oB || !pFA || !pFB) throw new Error("vínculos de proprietário/parceiro de teste não foram criados");

  const imA = await criarImovel({ owner_id: oA.id }, "TESTE SEG imóvel A");
  const imB = await criarImovel({ owner_id: oB.id }, "TESTE SEG imóvel B (rascunho secreto)");
  const imFA = await criarImovel({ partner_id: pFA.id }, "TESTE SEG imóvel franquia A");
  const imFB = await criarImovel({ partner_id: pFB.id }, "TESTE SEG imóvel franquia B");
  const docB = await criarDocumento(imB.id);
  const docFB = await criarDocumento(imFB.id);

  const { data: lead } = await admin.from("leads").insert({ property_id: imB.id, nome: "TESTE SEG lead", email: "lead.seg@exemplo.com" }).select("id").single();
  criados.leads.push(lead.id);
  const { data: oppB } = await admin.from("opportunities")
    .insert({ property_id: imB.id, lead_id: lead.id, responsavel_tipo: "proprietario" }).select("id").single();
  const { data: oppFB } = await admin.from("opportunities")
    .insert({ property_id: imFB.id, responsavel_tipo: "parceiro", responsavel_partner_id: pFB.id }).select("id").single();
  criados.opps.push(oppB.id, oppFB.id);
  const { data: proposta } = await admin.from("proposals").insert({ opportunity_id: oppB.id, autor_lado: "comprador", valor: 1000 }).select("id").single();
  await admin.from("favoritos").insert({ user_id: propB.id, property_id: imB.id });
  const { data: ticket } = await admin.from("support_tickets")
    .insert({ nome: "TESTE SEG", assunto: "TESTE SEG chamado de B", user_id: propB.id, email: propB.email }).select("id").single();
  criados.tickets.push(ticket.id);
  const { data: reqB } = await admin.from("cartographic_requests").insert({ user_id: propB.id, tipo: "outro" }).select("id").single();
  criados.reqs.push(reqB.id);
  await admin.from("consultas_rurais").insert({ property_id: imB.id, fonte_id: "ana", resultado: {} });

  // ---------- sessões
  const visitante = new Sessao("visitante"); await visitante.liberar();
  const sessoes = {};
  for (const [k, u] of Object.entries({ comprador, propA, propB, franqA, franqB, equipe, diretoria })) {
    const s = new Sessao(k); await s.liberar(); await s.entrar(u.email, SENHA); sessoes[k] = s;
  }
  const tok = (k) => sessoes[k].sessaoSupabase()?.access_token;
  const setores = async (lista) => { await admin.from("profiles").update({ setores: lista }).eq("user_id", equipe.id); };

  // =========================================================== 1. força bruta
  console.log("\n━━ Força bruta");
  {
    const s = new Sessao("forca-acesso");
    const respostas = [];
    for (let i = 0; i < 11; i++) respostas.push((await s.req("POST", "/api/acesso", { json: { senha: `errada-${i}` } })).status);
    ok("senha do site: 10 erros por IP, a 11ª tentativa é bloqueada (429)", respostas.slice(0, 10).every((x) => x === 401) && respostas[10] === 429, respostas.join(","));
    const certa = await s.req("POST", "/api/acesso", { json: { senha: process.env.SITE_SENHA ?? "" } });
    ok("senha do site: bloqueado, nem a senha certa passa", certa.status === 429, String(certa.status));
  }
  {
    const alvo = EMAIL("forca-bruta");
    const st = [];
    for (let i = 0; i < 9; i++) { const s = new Sessao("forca-email"); await s.liberar(); st.push((await s.req("POST", "/api/auth/entrar", { json: { email: alvo, senha: `Errada${i}x2026` } })).status); }
    ok("login: 8 erros no mesmo e-mail (de IPs diferentes), a 9ª é bloqueada (429)", st.slice(0, 8).every((x) => x === 401) && st[8] === 429, st.join(","));
  }
  {
    // 30 tentativas do mesmo IP: o contador é o do banco (fn_rate_limit), igual ao da rota;
    // assim o teste não dispara 30 logins no Supabase
    const s = new Sessao("forca-ip"); await s.liberar();
    for (let i = 0; i < 30; i++) await admin.rpc("fn_rate_limit", { p_chave: `login:ip:${s.ip}`, p_max: 30, p_janela_s: 600 });
    const r = await s.req("POST", "/api/auth/entrar", { json: { email: comprador.email, senha: SENHA } });
    ok("login: 31ª tentativa do mesmo IP é bloqueada, mesmo com a senha certa (429)", r.status === 429, String(r.status));
  }
  {
    const r = await sessoes.comprador.req("PATCH", "/api/conta", { json: { nome: "x" }, origem: "https://site-malicioso.exemplo" });
    ok("CSRF: pedido que muda dado vindo de outro site é recusado (403)", r.status === 403, String(r.status));
  }

  // =========================================================== 2. matriz de permissões
  console.log("\n━━ Matriz de permissões (perfil × rota)");
  const R = randomUUID();
  // [método, caminho, corpo, setores que podem, seguro chamar com quem pode?]
  // "seguro" = corpo inerte (id inexistente, leitura): quem pode recebe 4xx/200, nunca efeito real.
  const ROTAS = [
    ["GET", "/api/admin/car", undefined, ["cartografia"], true],
    ["POST", "/api/admin/car", {}, ["cartografia"], false],
    ["PATCH", `/api/admin/cartografia/${R}`, {}, ["cartografia"], true],
    ["DELETE", `/api/admin/cartografia/${R}`, undefined, ["diretoria"], true],
    ["POST", "/api/admin/cartografia", {}, ["cartografia"], true],
    ["PATCH", `/api/admin/cartografia/solicitacoes/${R}`, {}, ["cartografia"], true],
    ["POST", "/api/admin/comissoes", { id: R }, ["financeiro"], false],
    ["POST", "/api/admin/configuracoes", {}, ["diretoria"], false],
    ["POST", "/api/admin/decisao", { alvo: "imovel", id: R, acao: "nenhuma" }, ["operacoes"], true],
    ["GET", "/api/admin/financeiro/exportar", undefined, ["financeiro"], true],
    ["POST", "/api/admin/fontes/verificar", {}, ["cartografia", "seguranca"], false],
    ["POST", "/api/admin/geometria/validar", { property_id: R }, ["operacoes", "cartografia"], true],
    ["POST", "/api/admin/lgpd", {}, ["juridico"], false],
    ["PATCH", "/api/admin/lgpd", { id: R }, ["juridico"], true],
    ["POST", "/api/admin/mensalidades", {}, ["financeiro"], false],
    ["POST", "/api/admin/municipios", {}, ["diretoria"], true],
    ["POST", "/api/admin/organizacoes", {}, ["diretoria", "comercial"], false],
    ["PATCH", "/api/admin/organizacoes", { id: R }, ["diretoria", "comercial"], true],
    ["PATCH", "/api/admin/parceiros", { id: R }, ["diretoria"], true],
    ["POST", "/api/admin/planos", {}, ["diretoria"], false],
    ["PATCH", "/api/admin/planos", { id: "nao-existe-seg" }, ["diretoria"], true],
    ["POST", "/api/admin/pois/atualizar", {}, ["cartografia"], false],
    ["PATCH", "/api/admin/seguranca/alertas", { id: R }, ["seguranca"], true],
    ["POST", "/api/admin/seguranca/retencao", {}, ["diretoria"], false],
    ["POST", "/api/admin/seguranca/revisao", {}, ["seguranca", "diretoria"], false],
    ["GET", `/api/admin/suporte/${R}`, undefined, ["suporte"], true],
    ["GET", "/api/admin/suporte/nao-lidos", undefined, ["suporte"], true],
    ["PATCH", "/api/admin/suporte", { id: R, mensagem: "x" }, ["suporte"], true],
    ["POST", "/api/admin/tarefas", { setor: "juridico", titulo: "" }, ["juridico"], false],
    ["POST", "/api/admin/usuarios", {}, ["diretoria"], false],
    ["PATCH", "/api/admin/usuarios", { user_id: R }, ["diretoria"], true],
    ["POST", "/api/demandas", {}, ["comercial"], false],
    ["PATCH", `/api/demandas/${R}`, {}, ["comercial"], true],
    ["GET", "/api/ia/conhecimento", undefined, ["marketing", "diretoria"], true],
    ["POST", "/api/ia/conhecimento", {}, ["marketing", "diretoria"], false],
    ["GET", `/api/ia/conhecimento/${R}`, undefined, ["marketing", "diretoria"], true],
    ["PATCH", `/api/ia/lacunas/${R}`, {}, ["marketing", "diretoria"], true],
    ["POST", `/api/imoveis/${R}/consulta-rural`, {}, ["operacoes", "cartografia"], false],
    ["PATCH", `/api/imoveis/${R}/documentos`, { documento_id: R, verificado: true }, ["operacoes", "juridico"], true],
    ["PATCH", `/api/oportunidades/${R}`, { acao: "etapa", etapa: "nenhuma" }, ["comercial", "juridico", "financeiro"], true],
  ];
  const SETORES = ["operacoes", "comercial", "financeiro", "juridico", "marketing", "cartografia", "suporte", "seguranca"];
  const chamar = (s, [m, p, b]) => s.req(m, p, { json: m === "GET" || m === "DELETE" ? undefined : b });

  // fora da equipe: tudo negado
  for (const [nome, s] of [["visitante", visitante], ["comprador", sessoes.comprador], ["proprietário", sessoes.propA], ["franqueado", sessoes.franqA]]) {
    const vazou = [];
    for (const rota of ROTAS) { const r = await chamar(s, rota); if (!negado(r.status)) vazou.push(`${rota[0]} ${rota[1]}=${r.status}`); }
    ok(`${nome}: as ${ROTAS.length} rotas da equipe respondem 401/403`, !vazou.length, vazou.join(" | "));
  }
  // equipe, um setor por vez (mesmo usuário; setores trocados no banco)
  for (const setor of SETORES) {
    await setores([setor]);
    const errados = [];
    for (const rota of ROTAS) {
      const pode = rota[3].includes(setor);
      if (pode && !rota[4]) continue; // não executa ação real com quem pode
      const r = await chamar(sessoes.equipe, rota);
      if (pode && negado(r.status)) errados.push(`${rota[0]} ${rota[1]} negado (${r.status}) mas o setor pode`);
      if (!pode && !negado(r.status)) errados.push(`${rota[0]} ${rota[1]}=${r.status}`);
    }
    ok(`equipe só de ${setor}: entra no próprio setor e é barrada nos outros`, !errados.length, errados.join(" | "));
  }
  {
    const errados = [];
    for (const rota of ROTAS.filter((x) => x[4])) {
      const r = await chamar(sessoes.diretoria, rota);
      if (negado(r.status)) errados.push(`${rota[0]} ${rota[1]}=${r.status}`);
    }
    ok("diretoria entra em todas as rotas da equipe", !errados.length, errados.join(" | "));
  }
  {
    const PRECISAM_SESSAO = [
      ["GET", "/api/conta/preferencias"], ["PATCH", "/api/conta", { nome: "x" }], // /api/ia/estado é público: só diz ao botão se há sessão
      ["GET", "/api/cartografia/solicitacoes"], ["POST", "/api/imoveis", {}], ["POST", "/api/auth/evento", { evento: "logout" }],
      ["POST", "/api/conta/organizacao", {}], ["POST", `/api/imoveis/${imA.id}/midia`, { tipo: "video/mp4", tamanho: 10 }],
    ];
    const vazou = [];
    for (const [m, p, b] of PRECISAM_SESSAO) { const r = await visitante.req(m, p, { json: b }); if (!negado(r.status)) vazou.push(`${m} ${p}=${r.status}`); }
    ok("visitante: rotas de conta e de anunciante pedem login (401/403)", !vazou.length, vazou.join(" | "));
  }

  // =========================================================== 3. IDOR
  console.log("\n━━ Acesso a registros de outro usuário (IDOR)");
  const A = sessoes.propA, B = sessoes.propB;
  ok("A não lista os documentos do imóvel de B", (await A.req("GET", `/api/imoveis/${imB.id}/documentos`)).status === 403);
  ok("A não envia documento para o imóvel de B", (await A.req("POST", `/api/imoveis/${imB.id}/documentos`, { form: formDoc(arquivo(pdf(), "m.pdf", "application/pdf")) })).status === 403);
  {
    const r = await A.req("GET", `/api/arquivos/${docB.path}`);
    ok("A não abre o arquivo do documento de B pelo endereço direto", r.status === 403, `${r.status} ${r.local ?? ""}`);
  }
  ok("A não pede envio de vídeo no imóvel de B", (await A.req("POST", `/api/imoveis/${imB.id}/midia`, { json: { tipo: "video/mp4", tamanho: 1000 } })).status === 403);
  ok("A não apaga vídeo do imóvel de B", (await A.req("DELETE", `/api/imoveis/${imB.id}/midia`, { json: { media_id: R } })).status === 403);
  ok("A não propõe alteração no anúncio de B", (await A.req("POST", `/api/imoveis/${imB.id}/revisao`, { json: { titulo: "invadido" } })).status === 403);
  ok("A não lê o relatório territorial do imóvel de B (em análise)", (await A.req("GET", `/api/imoveis/${imB.id}/consulta-rural`)).status === 404);
  {
    const r = await A.req("POST", `/api/avaliacao/${imB.id}`, { json: {} });
    ok("A não pede avaliação do imóvel de B", [403, 404].includes(r.status), String(r.status));
  }
  ok("A não muda a etapa da oportunidade de B", (await A.req("PATCH", `/api/oportunidades/${oppB.id}`, { json: { acao: "etapa", etapa: "visita" } })).status === 403);
  ok("A não registra proposta na oportunidade de B", (await A.req("POST", `/api/oportunidades/${oppB.id}`, { json: { tipo: "proposta", valor: 1, autor_lado: "comprador" } })).status === 403);
  {
    const r = await B.req("PATCH", `/api/oportunidades/${oppB.id}`, { json: { acao: "nenhuma" } });
    ok("controle: B (responsável) passa pela trava da própria oportunidade", !negado(r.status), String(r.status));
  }
  ok("A não lê o chamado de suporte de B", (await A.req("GET", `/api/suporte/${ticket.id}`)).status === 404);
  ok("A não responde o chamado de B", (await A.req("POST", `/api/suporte/${ticket.id}`, { json: { mensagem: "invadido" } })).status === 404);
  {
    const fd = new FormData(); fd.set("mensagem", "invadido");
    const r = await A.req("POST", `/api/cartografia/solicitacoes/${reqB.id}/mensagem`, { form: fd });
    ok("A não escreve na solicitação cartográfica de B", [403, 404].includes(r.status), String(r.status));
  }
  {
    const r = await A.req("GET", "/api/favoritos");
    ok("A não vê os favoritos de B", r.status === 200 && !(r.json?.codigos ?? []).includes(imB.codigo), r.texto);
  }
  {
    const chutes = [
      await A.req("GET", `/api/imoveis/${randomUUID()}/documentos`),
      await A.req("GET", `/api/arquivos/imoveis/${randomUUID()}/matricula-${randomUUID()}.pdf`),
      await A.req("GET", `/api/suporte/${randomUUID()}`),
      await A.req("PATCH", `/api/oportunidades/${randomUUID()}`, { json: { acao: "etapa", etapa: "visita" } }),
    ].map((r) => r.status);
    ok("ids chutados: só 403/404, sem dado e sem erro 500", chutes.every((x) => [403, 404].includes(x)), chutes.join(","));
  }
  {
    const pag = await visitante.req("GET", `/imovel/${imB.codigo}`);
    const logado = await A.req("GET", `/imovel/${imB.codigo}`);
    ok("página pública do imóvel em análise não mostra o anúncio (código chutado)",
      !pag.html.includes("rascunho secreto") && !logado.html.includes("rascunho secreto"), `${pag.status}/${logado.status}`);
  }

  // ---------- REST com a sessão de A
  {
    const t = tok("propA");
    const leituras = {
      "imóvel de B": await rest("GET", `properties?select=id&id=eq.${imB.id}`, { token: t }),
      "documento de B": await rest("GET", `property_documents?select=id&property_id=eq.${imB.id}`, { token: t }),
      "lead": await rest("GET", `leads?select=id&id=eq.${lead.id}`, { token: t }),
      "oportunidade de B": await rest("GET", `opportunities?select=id&id=eq.${oppB.id}`, { token: t }),
      "proposta de B": await rest("GET", `proposals?select=id&id=eq.${proposta.id}`, { token: t }),
      "chamado de B": await rest("GET", `support_tickets?select=id&id=eq.${ticket.id}`, { token: t }),
      "solicitação de B": await rest("GET", `cartographic_requests?select=id&id=eq.${reqB.id}`, { token: t }),
      "favorito de B": await rest("GET", `favoritos?select=user_id&user_id=eq.${propB.id}`, { token: t }),
      "perfil de B": await rest("GET", `profiles?select=user_id&user_id=eq.${propB.id}`, { token: t }),
    };
    const vazou = Object.entries(leituras).filter(([, r]) => linhas(r) > 0).map(([k]) => k);
    ok("API do banco com a sessão de A: nada de B aparece", !vazou.length, vazou.join(", "));
    ok("API do banco com a sessão de A: relatório territorial de B não aparece",
      linhas(await rest("GET", `consultas_rurais?select=id&property_id=eq.${imB.id}`, { token: t })) === 0, "", true);

    await rest("PATCH", `properties?id=eq.${imA.id}`, { token: t, corpo: { status: "publicado" } });
    await rest("PATCH", `properties?id=eq.${imB.id}`, { token: t, corpo: { titulo: "invadido" } });
    await rest("DELETE", `favoritos?user_id=eq.${propB.id}`, { token: t });
    await rest("PATCH", `profiles?user_id=eq.${propA.id}`, { token: t, corpo: { role: "admin_central" } });
    const [{ data: pa }, { data: pb }, { data: fav }, { data: perf }] = await Promise.all([
      admin.from("properties").select("status").eq("id", imA.id).single(),
      admin.from("properties").select("titulo").eq("id", imB.id).single(),
      admin.from("favoritos").select("user_id").eq("user_id", propB.id),
      admin.from("profiles").select("role").eq("user_id", propA.id).single(),
    ]);
    ok("API do banco: A não publica o próprio imóvel sem a Matriz", pa.status === "em_analise", pa.status);
    ok("API do banco: A não edita o imóvel de B", pb.titulo.startsWith("TESTE SEG"), pb.titulo);
    ok("API do banco: A não apaga o favorito de B", (fav ?? []).length === 1);
    ok("API do banco: A não se promove a diretoria", perf.role === "proprietario", perf.role);
  }

  // =========================================================== 4. território
  console.log("\n━━ Segregação por território (franquias)");
  {
    const FA = sessoes.franqA, FB = sessoes.franqB;
    ok("franquia A não lista documentos do imóvel da franquia B", (await FA.req("GET", `/api/imoveis/${imFB.id}/documentos`)).status === 403);
    ok("franquia A não abre o arquivo da franquia B", (await FA.req("GET", `/api/arquivos/${docFB.path}`)).status === 403);
    ok("franquia A não opera a oportunidade da franquia B", (await FA.req("PATCH", `/api/oportunidades/${oppFB.id}`, { json: { acao: "etapa", etapa: "visita" } })).status === 403);
    const r = await FB.req("GET", `/api/imoveis/${imFB.id}/documentos`);
    ok("controle: franquia B vê os próprios documentos", r.status === 200 && (r.json?.documentos ?? []).length === 1, String(r.status));
    const rest1 = await rest("GET", `properties?select=id&partner_id=eq.${pFB.id}`, { token: tok("franqA") });
    const rest2 = await rest("GET", `opportunities?select=id&id=eq.${oppFB.id}`, { token: tok("franqA") });
    ok("API do banco: franquia A não vê imóvel nem oportunidade da franquia B", linhas(rest1) === 0 && linhas(rest2) === 0);
    const rest3 = await rest("GET", `opportunities?select=id&id=eq.${oppFB.id}`, { token: tok("franqB") });
    ok("controle: franquia B vê a própria oportunidade pela API do banco", linhas(rest3) === 1, rest3.texto);
  }

  // =========================================================== 5. setor (equipe)
  console.log("\n━━ Equipe: setor na API e na API do banco");
  {
    const E = sessoes.equipe, t = tok("equipe");
    await setores(["suporte"]);
    ok("equipe do Suporte não lista documentos de imóvel", (await E.req("GET", `/api/imoveis/${imB.id}/documentos`)).status === 403);
    ok("equipe do Suporte não opera oportunidade", (await E.req("PATCH", `/api/oportunidades/${oppB.id}`, { json: { acao: "nenhuma" } })).status === 403);
    ok("equipe do Suporte não pede envio de vídeo", (await E.req("POST", `/api/imoveis/${imB.id}/midia`, { json: { tipo: "video/mp4", tamanho: 10 } })).status === 403);
    ok("API do banco: equipe do Suporte não lê leads", linhas(await rest("GET", `leads?select=id&id=eq.${lead.id}`, { token: t })) === 0, "", true);
    ok("API do banco: equipe do Suporte não lê a auditoria", linhas(await rest("GET", "audit_log?select=id&limit=1", { token: t })) === 0, "", true);
    await rest("PATCH", `partners?id=eq.${pFB.id}`, { token: t, corpo: { status: "suspenso" } });
    await rest("PATCH", `owners?id=eq.${oB.id}`, { token: t, corpo: { status: "suspenso" } });
    await rest("PATCH", `regions?id=eq.${regiao2.id}`, { token: t, corpo: { nome: "TESTE SEG invadida" } });
    await rest("PATCH", `leads?id=eq.${lead.id}`, { token: t, corpo: { nome: "TESTE SEG invadido" } });
    const [{ data: pa }, { data: ow }, { data: rg }, { data: ld }] = await Promise.all([
      admin.from("partners").select("status").eq("id", pFB.id).single(),
      admin.from("owners").select("status").eq("id", oB.id).single(),
      admin.from("regions").select("nome").eq("id", regiao2.id).single(),
      admin.from("leads").select("nome").eq("id", lead.id).single(),
    ]);
    ok("API do banco: equipe do Suporte não aprova/suspende parceiro", pa.status === "ativo", pa.status, true);
    ok("API do banco: equipe do Suporte não altera cadastro de proprietário", ow.status === "ativo", ow.status, true);
    ok("API do banco: equipe não altera região", rg.nome === "TESTE SEG região B", rg.nome, true);
    ok("API do banco: equipe do Suporte não altera lead", ld.nome === "TESTE SEG lead", ld.nome, true);
    await rest("PATCH", `profiles?user_id=eq.${equipe.id}`, { token: t, corpo: { setores: ["financeiro"] } });
    const { data: pe } = await admin.from("profiles").select("setores").eq("user_id", equipe.id).single();
    ok("API do banco: membro da equipe não se dá outro setor", JSON.stringify(pe.setores) === '["suporte"]', JSON.stringify(pe.setores));
    await setores(["operacoes"]);
    ok("controle: equipe de Operações lista os documentos", (await E.req("GET", `/api/imoveis/${imB.id}/documentos`)).status === 200);
    await setores(["comercial"]);
    ok("controle: equipe Comercial opera a oportunidade", !negado((await E.req("PATCH", `/api/oportunidades/${oppB.id}`, { json: { acao: "nenhuma" } })).status));
    ok("API do banco: equipe Comercial lê o lead", linhas(await rest("GET", `leads?select=id&id=eq.${lead.id}`, { token: t })) === 1, "", true);
  }

  // =========================================================== 6. upload
  console.log("\n━━ Envio de arquivos");
  {
    const docs = async () => (await admin.from("property_documents").select("id, storage_path").eq("property_id", imA.id)).data ?? [];
    const r0 = await A.req("POST", `/api/imoveis/${imA.id}/documentos`, { form: formDoc(arquivo(pdf(), "matricula.pdf", "application/pdf")) });
    ok("controle: PDF verdadeiro é aceito", r0.status === 200, r0.texto);
    const casos = [
      ["HTML com script renomeado para .pdf", arquivo(Buffer.from("<html><script>alert(1)</script></html>"), "matricula.pdf", "application/pdf")],
      ["SVG com script", arquivo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "planta.svg", "image/svg+xml")],
      ["executável (.exe) renomeado para .pdf", arquivo(Buffer.concat([Buffer.from("MZ\x90\x00"), Buffer.alloc(2048)]), "matricula.pdf", "application/pdf")],
      ["HTML declarado como imagem", arquivo(Buffer.from("<!doctype html><script>x</script>"), "foto.jpg", "image/jpeg")],
    ];
    for (const [rot, f] of casos) {
      const r = await A.req("POST", `/api/imoveis/${imA.id}/documentos`, { form: formDoc(f) });
      ok(`documento: ${rot} é recusado`, r.status === 400, `${r.status} ${r.texto}`);
    }
    const grande = await A.req("POST", `/api/imoveis/${imA.id}/documentos`, { form: formDoc(arquivo(pdf(26 * 1024 * 1024), "grande.pdf", "application/pdf")) });
    ok("documento: PDF acima de 25 MB é recusado", grande.status >= 400 && grande.status < 500, String(grande.status));
    const antes = (await docs()).length;
    const trav = await A.req("POST", `/api/imoveis/${imA.id}/documentos`, { form: formDoc(arquivo(pdf(), "m.pdf", "application/pdf"), `../${imB.id}/matricula`) });
    const { data: noB } = await admin.storage.from("docs").list(`imoveis/${imB.id}`);
    const depois = await docs();
    ok("documento: tipo com ../ (caminho para o imóvel de B) é recusado",
      trav.status === 400 && depois.length === antes && (noB ?? []).length === 1 && depois.every((d) => !d.storage_path.includes("..")),
      `${trav.status} ${trav.texto}`);
    for (const d of depois) criados.caminhos.push(d.storage_path);

    const avatarSvg = new FormData(); avatarSvg.set("foto", arquivo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'), "a.svg", "image/svg+xml"));
    ok("foto do perfil: SVG é recusado", (await A.req("POST", "/api/conta/avatar", { form: avatarSvg })).status === 400);
    const avatarHtml = new FormData(); avatarHtml.set("foto", arquivo(Buffer.from("<html><script>x</script></html>"), "a.png", "image/png"));
    ok("foto do perfil: HTML com nome .png é recusado", (await A.req("POST", "/api/conta/avatar", { form: avatarHtml })).status === 400);
    ok("vídeo: formato que não é vídeo é recusado", (await A.req("POST", `/api/imoveis/${imA.id}/midia`, { json: { tipo: "text/html", tamanho: 100 } })).status === 400);
    ok("vídeo: acima de 50 MB é recusado", (await A.req("POST", `/api/imoveis/${imA.id}/midia`, { json: { tipo: "video/mp4", tamanho: 60 * 1024 * 1024 } })).status === 400);
    ok("vídeo: registrar arquivo de outro imóvel é recusado",
      (await A.req("PUT", `/api/imoveis/${imA.id}/midia`, { json: { path: `properties/${imB.id}/video-x.mp4` } })).status === 400);
    const pts = [
      await A.req("GET", `/api/arquivos/imoveis/${imA.id}/%2E%2E/%2E%2E/contratos/x.pdf`),
      await A.req("GET", `/api/arquivos/imoveis/${imA.id}/..%2F${imB.id}%2F${docB.path.split("/").pop()}`),
    ].map((r) => r.status);
    ok("abertura de arquivo com ../ no caminho é recusada", pts.every((s) => [400, 404].includes(s)), pts.join(","));
  }

  // =========================================================== 7. API pública do banco (chave anon)
  console.log("\n━━ API pública do banco com a chave anon");
  {
    const TABELAS = ["profiles", "owners", "partners", "leads", "opportunities", "proposals", "visits", "contracts",
      "property_documents", "property_authorizations", "support_tickets", "support_messages", "audit_log", "auth_events",
      "document_access_log", "invoices", "sales", "commissions", "settings", "subscriptions", "lgpd_requests", "favoritos",
      "organizations", "organization_members", "cartographic_requests", "demandas", "tasks", "rate_limits", "jobs",
      "alertas_seguranca", "access_attempts", "plan_subscriptions", "property_revisions", "property_events"];
    const vazou = [];
    for (const t of TABELAS) { const r = await rest("GET", `${t}?select=*&limit=1`); if (linhas(r) > 0) vazou.push(t); }
    ok(`chave anon: ${TABELAS.length} tabelas sensíveis não devolvem linha`, !vazou.length, vazou.join(", "));
    const rp = await rest("GET", `properties?select=id&id=eq.${imB.id}`);
    ok("chave anon: imóvel em análise não aparece", linhas(rp) === 0);
    const cr = await rest("GET", `consultas_rurais?select=id&property_id=eq.${imB.id}`);
    ok("chave anon: relatório territorial de imóvel em análise não aparece", linhas(cr) === 0, "", true);

    const geo = { type: "Polygon", coordinates: [[[-50.21, -19.73], [-50.2, -19.73], [-50.2, -19.72], [-50.21, -19.73]]] };
    const RPCS = [
      ["fn_upsert_geometry", { p_property_id: imB.id, p_geojson: geo, p_fonte: "desenho", p_arquivo: null, p_origem: null, p_motivo: null, p_user_id: null }],
      ["fn_validar_geometria", { p_property_id: imB.id, p_user_id: propA.id, p_motivo: "teste" }],
      ["fn_cart_request_transicao", { p_id: reqB.id, p_status: "cancelada", p_user_id: propA.id, p_mensagem: "x", p_interno: false }],
      ["fn_tile_car", { z: 10, x: 370, y: 571 }],
      ["fn_financeiro_mensal", { p_meses: 1 }],
      ["fn_rate_limit", { p_chave: "seg-teste", p_max: 1, p_janela_s: 1 }],
    ];
    for (const [anonOuUser, token] of [["chave anon", undefined], ["sessão comum", tok("propA")]]) {
      const abertas = [];
      for (const [fn, args] of RPCS) {
        const r = await rest("POST", `rpc/${fn}`, { token, corpo: args });
        if (r.status < 300) abertas.push(fn);
      }
      ok(`${anonOuUser}: funções do servidor não executam pela API pública`, !abertas.length, abertas.join(", "), true);
    }
    const { data: g } = await admin.from("property_geometries").select("property_id").eq("property_id", imB.id);
    const { data: rq } = await admin.from("cartographic_requests").select("status").eq("id", reqB.id).single();
    ok("a divisa e a solicitação de B continuam intactas", (g ?? []).length === 0 && rq.status === "recebida", `${(g ?? []).length} ${rq.status}`, true);

    const lista = await fetch(`${SB_URL}/storage/v1/object/list/media`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "content-type": "application/json" },
      body: JSON.stringify({ prefix: "properties", limit: 5 }),
    });
    const itens = lista.ok ? await lista.json() : [];
    ok("chave anon: o bucket público media não pode ser listado", !itens.length, `${lista.status} ${itens.length} itens`, true);
    for (const [quem, token] of [["chave anon", ANON], ["sessão de A", tok("propA")]]) {
      const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/docs/${docB.path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
      ok(`${quem}: documento do cofre privado não baixa direto do armazenamento`, !r.ok, String(r.status));
    }
  }

  // =========================================================== 8. segundo fator
  console.log("\n━━ Segundo fator nas APIs");
  {
    await setores(["financeiro"]);
    const E = sessoes.equipe;
    ok("controle: equipe do Financeiro exporta a planilha", (await E.req("GET", "/api/admin/financeiro/exportar")).status === 200);
    const s = E.sessaoSupabase();
    const cli = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    await cli.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    const { data: fator, error: eF } = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: "seg-teste" });
    if (eF) throw new Error(`ativar MFA de teste: ${eF.message}`);
    const { error: eV } = await cli.auth.mfa.challengeAndVerify({ factorId: fator.id, code: totp(fator.totp.secret) });
    if (eV) throw new Error(`confirmar MFA de teste: ${eV.message}`);
    const nova = new Sessao("equipe-mfa"); await nova.liberar();
    const login = await nova.req("POST", "/api/auth/entrar", { json: { email: equipe.email, senha: SENHA } });
    ok("login com MFA ativo avisa que falta o código", login.json?.mfa === true, login.texto);
    const sem = [
      await nova.req("GET", "/api/admin/financeiro/exportar"),
      await nova.req("PATCH", "/api/admin/tarefas", { json: { id: R } }),
      await nova.req("POST", "/api/admin/decisao", { json: { alvo: "imovel", id: R, acao: "nenhuma" } }),
    ].map((r) => r.status);
    ok("sem o código do segundo fator, as APIs da equipe recusam (401/403)", sem.every(negado), sem.join(","));
  }
} catch (e) {
  placar.falha++; falhas.push(`erro no teste: ${e.message}`);
  console.log(`✗ erro no teste: ${e.stack ?? e}`);
} finally {
  // ---------------------------------------------------------------- limpeza
  try {
    for (const id of criados.props) {
      const { data: docs } = await admin.from("property_documents").select("storage_path").eq("property_id", id);
      criados.caminhos.push(...(docs ?? []).map((d) => d.storage_path));
    }
    const caminhos = [...new Set(criados.caminhos)];
    if (caminhos.length) await admin.storage.from("docs").remove(caminhos);
    if (criados.opps.length) {
      await admin.from("proposals").delete().in("opportunity_id", criados.opps);
      await admin.from("opportunity_events").delete().in("opportunity_id", criados.opps);
      await admin.from("opportunities").delete().in("id", criados.opps);
    }
    if (criados.leads.length) await admin.from("leads").delete().in("id", criados.leads);
    if (criados.tickets.length) {
      await admin.from("support_messages").delete().in("ticket_id", criados.tickets);
      await admin.from("support_tickets").delete().in("id", criados.tickets);
    }
    if (criados.reqs.length) await admin.from("cartographic_requests").delete().in("id", criados.reqs);
    for (const id of criados.props) {
      await admin.from("favoritos").delete().eq("property_id", id);
      await admin.from("jobs").delete().contains("payload", { property_id: id });
      await admin.from("properties").delete().eq("id", id);
    }
    for (const id of criados.usuarios) {
      await admin.from("partners").delete().eq("profile_id", id);
      await admin.from("owners").delete().eq("profile_id", id);
      await admin.auth.admin.deleteUser(id);
    }
    if (criados.regiao) await admin.from("regions").delete().eq("id", criados.regiao);
    await admin.from("rate_limits").delete().like("chave", "%10.250.%");
    await admin.from("rate_limits").delete().like("chave", "%seg-teste%");
    for (const id of criados.usuarios) await admin.from("rate_limits").delete().like("chave", `%${id}%`);
    const { count } = await admin.from("properties").select("id", { count: "exact", head: true }).like("titulo", "TESTE SEG%");
    console.log(`\nlimpeza feita; imóveis de teste restantes: ${count ?? "?"}`);
  } catch (e) {
    console.log(`limpeza incompleta: ${e.message}`);
  }
  console.log(`\n${placar.ok + placar.falha + placar.pendente} testes: ${placar.ok} ok, ${placar.falha} falhas, ${placar.pendente} pendentes de migration (${Math.round((Date.now() - t0) / 1000)} s)`);
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exitCode = placar.falha ? 1 : 0;
}

