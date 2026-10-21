// Contas de teste com plano ativo, uma por plano (21/10/2026): para testar o
// que cada plano libera e bloqueia sem mexer nas contas do seed principal.
// Cada conta nasce com o papel e o nicho do plano, assinatura "ativa" por um
// ano (plan_origem = assinatura) e, nos planos de organização, uma organização
// de teste com a conta como administradora. Senha: PLANO_TESTE_SENHA do
// .env.local (cai na SEED_USER_PASSWORD se faltar), regravada a cada rodada.
// Idempotente: rodar de novo só reafirma plano, validade e vínculos.
//
// Uso: node scripts/seed-contas-plano.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const SENHA = process.env.PLANO_TESTE_SENHA || process.env.SEED_USER_PASSWORD;
const falha = (rotulo, error) => { if (error) throw new Error(`${rotulo}: ${error.message}`); };

// plano → conta. `parceiro`/`dono` criam o cadastro que o papel pede para usar as telas.
const CONTAS = [
  { plano: "consulta_basica", nome: "Teste Consulta Básica", role: "consulta", nicho: "consulta" },
  { plano: "consulta_profissional", nome: "Teste Consulta Profissional", role: "engenheiro", nicho: "engenheiro", parceiro: "engenheiro", registro: "CREA-MG 000000" },
  { plano: "anunciante", nome: "Teste Anunciante", role: "proprietario", nicho: "proprietario", dono: true },
  { plano: "parceiro", nome: "Teste Parceiro Profissional", role: "corretor", nicho: "corretor_imobiliaria", parceiro: "corretor", registro: "CRECI-MG 000000" },
  { plano: "organizacao", nome: "Teste Organização", role: "comprador", nicho: "empresa_holding", org: { nome: "Holding Teste Arini", tipo: "holding" } },
  { plano: "franquia", nome: "Teste Franquia", role: "franqueado", nicho: "franqueado", parceiro: "franqueado", org: { nome: "Franquia Teste Arini", tipo: "franquia" } },
];

const VALIDO_ATE = new Date(Date.now() + 365 * 86400000);
const { data: planos, error: ePlanos } = await supa.from("plans").select("id, nome, preco_mensal, periodicidade");
falha("planos", ePlanos);
const { data: regiao } = await supa.from("regions").select("id").limit(1).maybeSingle();
const { data: lista, error: eLista } = await supa.auth.admin.listUsers({ perPage: 1000 });
falha("usuários", eLista);

const feitas = [];
for (const c of CONTAS) {
  const plano = planos.find((p) => p.id === c.plano);
  if (!plano) { console.log(`– plano ${c.plano} não existe no banco, pulado`); continue; }
  const email = `plano.${c.plano.replace(/_/g, "-")}@arinibrasil.com.br`;

  let user = lista.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await supa.auth.admin.createUser({
      email, password: SENHA, email_confirm: true, user_metadata: { nome: c.nome, role: c.role },
    });
    falha(email, error);
    user = data.user;
  } else {
    falha("senha", (await supa.auth.admin.updateUserById(user.id, { password: SENHA })).error);
  }

  // papel e nicho primeiro (o gatilho põe o plano padrão); depois o plano como assinatura
  falha("perfil", (await supa.from("profiles").update({ nome: c.nome, role: c.role, nicho: c.nicho }).eq("user_id", user.id)).error);
  falha("plano", (await supa.from("profiles").update({
    plan_id: c.plano, plan_origem: "assinatura", plan_valido_ate: VALIDO_ATE.toISOString(),
  }).eq("user_id", user.id)).error);

  const { data: assinatura } = await supa.from("plan_subscriptions").select("id")
    .eq("user_id", user.id).eq("plan_id", c.plano).eq("status", "ativa").maybeSingle();
  const linha = {
    user_id: user.id, plan_id: c.plano, status: "ativa", valor: plano.preco_mensal,
    periodicidade: plano.periodicidade === "anual" ? "anual" : "mensal",
    fim: VALIDO_ATE.toISOString().slice(0, 10), observacao: "Conta de teste (scripts/seed-contas-plano.mjs)",
  };
  falha("assinatura", (assinatura
    ? await supa.from("plan_subscriptions").update(linha).eq("id", assinatura.id)
    : await supa.from("plan_subscriptions").insert(linha)).error);

  if (c.dono) {
    const { data: o } = await supa.from("owners").select("id").eq("profile_id", user.id).maybeSingle();
    if (!o) falha("proprietário", (await supa.from("owners").insert({ profile_id: user.id, status: "ativo", aceite_termos_at: new Date().toISOString() })).error);
  }
  if (c.parceiro) {
    const { data: p } = await supa.from("partners").select("id").eq("profile_id", user.id).maybeSingle();
    const dados = { profile_id: user.id, tipo: c.parceiro, razao_social: c.nome, registro_profissional: c.registro ?? null, status: "ativo",
      aceite_termos_at: new Date().toISOString(), ...(c.parceiro === "franqueado" && regiao ? { region_id: regiao.id } : {}) };
    falha("parceiro", (p ? await supa.from("partners").update(dados).eq("id", p.id) : await supa.from("partners").insert(dados)).error);
  }
  if (c.org) {
    let { data: org } = await supa.from("organizations").select("id").eq("nome", c.org.nome).maybeSingle();
    const dados = { nome: c.org.nome, tipo: c.org.tipo, plan_id: c.plano, plan_valido_ate: VALIDO_ATE.toISOString(), ativo: true,
      observacoes: "Organização de teste (scripts/seed-contas-plano.mjs)", ...(c.org.tipo === "franquia" && regiao ? { region_id: regiao.id } : {}) };
    if (org) falha("organização", (await supa.from("organizations").update(dados).eq("id", org.id)).error);
    else {
      const r = await supa.from("organizations").insert({ ...dados, created_by: user.id }).select("id").single();
      falha("organização", r.error);
      org = r.data;
    }
    const { data: m } = await supa.from("organization_members").select("id").eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (!m) falha("membro", (await supa.from("organization_members").insert({
      org_id: org.id, user_id: user.id, email, papel_org: "admin", status: "ativo", aceito_em: new Date().toISOString(),
    })).error);
  }
  feitas.push({ plano: plano.nome, email, papel: c.role, validade: VALIDO_ATE.toLocaleDateString("pt-BR") });
}

console.table(feitas);
console.log(`Senha de todas: ${process.env.PLANO_TESTE_SENHA ? "PLANO_TESTE_SENHA" : "SEED_USER_PASSWORD"} do .env.local.`);
