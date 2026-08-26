// Seed: região piloto (Pontal do Triângulo Mineiro), municípios via IBGE,
// usuários de teste (admin, proprietário, corretor) e imóveis de demonstração.
// Idempotente. Uso: node scripts/seed.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
  user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

// ---------- região + municípios (ajustável — lista real vem do Carlos) ----------
const MUNICIPIOS_NOMES = [
  "Iturama", "Carneirinho", "Limeira do Oeste", "União de Minas",
  "São Francisco de Sales", "Campina Verde",
];
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const todosMG = await (await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/MG/municipios")).json();
const MUNICIPIOS_IBGE = MUNICIPIOS_NOMES.map(nome => {
  const m = todosMG.find(x => norm(x.nome) === norm(nome));
  if (!m) throw new Error(`município não encontrado no IBGE: ${nome}`);
  return String(m.id);
});

// remove municípios importados com código errado em runs anteriores
await db.query(
  `delete from municipalities where nome not in (select unnest($1::text[]))`,
  [MUNICIPIOS_NOMES]);

let { rows: [region] } = await db.query(`select id from regions where nome = 'Região Piloto — Pontal do Triângulo'`);
if (!region) {
  ({ rows: [region] } = await db.query(
    `insert into regions (nome) values ('Região Piloto — Pontal do Triângulo') returning id`));
  console.log("região criada");
}

for (const cod of MUNICIPIOS_IBGE) {
  const { rows } = await db.query(`select 1 from municipalities where codigo_ibge = $1`, [cod]);
  if (rows.length) { console.log(`município ${cod} já existe`); continue; }
  const meta = await (await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cod}`)).json();
  const malha = await (await fetch(
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${cod}?formato=application/vnd.geo+json`)).json();
  const geom = malha?.features?.[0]?.geometry ?? malha?.geometry ??
    (["Polygon", "MultiPolygon"].includes(malha?.type) ? malha : null);
  if (!geom) { console.error(`malha inválida para ${cod}, pulando`); continue; }
  const geomJson = JSON.stringify(geom);
  await db.query(
    `insert into municipalities (region_id, nome, uf, codigo_ibge, geom, sede)
     values ($1, $2, $3, $4,
       st_multi(st_setsrid(st_geomfromgeojson($5), 4326)),
       st_centroid(st_setsrid(st_geomfromgeojson($5), 4326)))`,
    [region.id, meta.nome, meta.microrregiao.mesorregiao.UF.sigla, cod, geomJson]);
  console.log(`município ${meta.nome} importado`);
}

// ---------- usuários ----------
async function ensureUser(email, nome, role) {
  const { data: list } = await supa.auth.admin.listUsers({ perPage: 200 });
  let user = list.users.find(u => u.email === email);
  if (!user) {
    const { data, error } = await supa.auth.admin.createUser({
      email, password: process.env.SEED_USER_PASSWORD, email_confirm: true,
      user_metadata: { nome, role },
    });
    if (error) throw error;
    user = data.user;
    console.log(`usuário ${email} criado`);
  }
  await db.query(`update profiles set role = $2, nome = $3 where user_id = $1`, [user.id, role, nome]);
  return user.id;
}

const adminId = await ensureUser("admin@arinimaps.com.br", "Arini Central", "admin_central");
const propId = await ensureUser("proprietario.teste@arinimaps.com.br", "Proprietário Teste", "proprietario");
const corrId = await ensureUser("corretor.teste@arinimaps.com.br", "Corretor Teste", "corretor");

let { rows: [owner] } = await db.query(`select id from owners where profile_id = $1`, [propId]);
if (!owner) ({ rows: [owner] } = await db.query(
  `insert into owners (profile_id, status, aceite_termos_at) values ($1,'ativo',now()) returning id`, [propId]));
let { rows: [partner] } = await db.query(`select id from partners where profile_id = $1`, [corrId]);
if (!partner) ({ rows: [partner] } = await db.query(
  `insert into partners (profile_id, tipo, razao_social, registro_profissional, status, aceite_termos_at)
   values ($1,'corretor','Corretor Teste','CRECI-MG 00000','ativo',now()) returning id`, [corrId]));

// ---------- imóveis demo ----------
const { rows: existing } = await db.query(`select count(*)::int as n from properties`);
if (existing[0].n === 0) {
  const { rows: [mun] } = await db.query(`select id from municipalities where nome = 'Iturama'`);

  // 1) fazenda publicada (polígono rural a sudoeste de Iturama)
  const { rows: [p1] } = await db.query(
    `insert into properties (tipo, owner_id, municipality_id, titulo, descricao, valor, area_declarada,
       caracteristicas, condicoes_venda, status, created_by)
     values ('rural', $1, $2, 'Fazenda Boa Vista', 'Fazenda de pecuária com dupla aptidão, casa sede, curral e represas. Topografia plana, acesso por estrada municipal a 12 km do centro de Iturama.',
       3800000, 84, '{"unidade_area":"ha","benfeitorias":["casa sede","curral","represa"],"solo":"misto"}',
       'Aceita 50% de entrada + saldo em 4 parcelas semestrais', 'rascunho', $3)
     returning id`, [owner.id, mun?.id, adminId]);
  const poly1 = { type: "Polygon", coordinates: [[
    [-50.245, -19.795], [-50.225, -19.795], [-50.222, -19.808],
    [-50.238, -19.815], [-50.248, -19.806], [-50.245, -19.795],
  ]] };
  await db.query(`select * from fn_upsert_geometry($1, $2::jsonb, 'desenho')`, [p1.id, JSON.stringify(poly1)]);
  for (const s of ["pendente", "em_analise", "aprovado", "publicado"])
    await db.query(`update properties set status = $2 where id = $1`, [p1.id, s]);

  // 2) sítio em análise
  const { rows: [p2] } = await db.query(
    `insert into properties (tipo, owner_id, municipality_id, titulo, descricao, valor, area_declarada,
       caracteristicas, status, created_by)
     values ('rural', $1, $2, 'Sítio Água Limpa', 'Sítio com pomar formado, nascente e casa simples. Ideal para lazer ou pequena produção.',
       650000, 9.6, '{"unidade_area":"ha","benfeitorias":["casa","pomar","nascente"]}', 'rascunho', $3)
     returning id`, [owner.id, mun?.id, adminId]);
  const poly2 = { type: "Polygon", coordinates: [[
    [-50.155, -19.712], [-50.148, -19.712], [-50.147, -19.719],
    [-50.156, -19.720], [-50.155, -19.712],
  ]] };
  await db.query(`select * from fn_upsert_geometry($1, $2::jsonb, 'desenho')`, [p2.id, JSON.stringify(poly2)]);
  for (const s of ["pendente", "em_analise"])
    await db.query(`update properties set status = $2 where id = $1`, [p2.id, s]);

  // 3) lote urbano publicado (centro de Iturama)
  const { rows: [p3] } = await db.query(
    `insert into properties (tipo, partner_id, municipality_id, titulo, descricao, valor, area_declarada,
       caracteristicas, status, created_by)
     values ('urbano', $1, $2, 'Lote Av. Prefeito Juca Padua', 'Lote comercial de esquina, 420 m², documentação em dia, pronto para construir.',
       380000, 420, '{"unidade_area":"m2","zoneamento":"comercial"}', 'rascunho', $3)
     returning id`, [partner.id, mun?.id, adminId]);
  const poly3 = { type: "Polygon", coordinates: [[
    [-50.1975, -19.7295], [-50.1971, -19.7295], [-50.1971, -19.7299],
    [-50.1975, -19.7299], [-50.1975, -19.7295],
  ]] };
  await db.query(`select * from fn_upsert_geometry($1, $2::jsonb, 'desenho')`, [p3.id, JSON.stringify(poly3)]);
  for (const s of ["pendente", "em_analise", "aprovado", "publicado"])
    await db.query(`update properties set status = $2 where id = $1`, [p3.id, s]);

  console.log("3 imóveis demo criados (2 publicados, 1 em análise)");
} else {
  console.log(`imóveis já existem (${existing[0].n}) — seed de imóveis pulado`);
}

await db.end();
console.log("seed concluído");
