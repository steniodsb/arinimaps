// Seis imóveis de teste com a divisa copiada da base do mapa: os rurais usam o
// polígono exato do CAR (car_imoveis) e os urbanos o lote exato da planta
// (urban_lots), então a área desenhada casa com as linhas laranja do mapa.
// Marcados com caracteristicas.demo = true (limpa-demo.mjs --tudo apaga).
// Idempotente pelo título. Uso: node scripts/seed-imoveis-teste.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = new pg.Client({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432,
  user: "postgres", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();

const IMOVEIS = [
  {
    tipo: "rural", car: "MG-3134400-9B3DF96F812E4B559F85EFD7117E9A48",
    titulo: "Chácara Recanto do Ipê", valor: 890000,
    descricao: "Chácara com CAR analisado e em conformidade, pasto formado, cerca nova e energia na porteira. Boa para lazer ou pequena criação.",
    carac: { benfeitorias: ["casa", "galpão", "poço artesiano"], solo: "misto" },
  },
  {
    tipo: "rural", car: "MG-3134400-42771F66E8AE448EA33A6B234019A7CE",
    titulo: "Sítio Santa Luzia", valor: 1650000,
    descricao: "Sítio a poucos minutos de Iturama, com represa, curral e pastagem dividida em piquetes. Acesso por estrada cascalhada.",
    carac: { benfeitorias: ["casa sede", "curral", "represa"], solo: "argiloso" },
    condicoes: "Aceita 40% de entrada e saldo em 12 meses",
  },
  {
    tipo: "rural", car: "MG-3134400-D32C527D0B454011897E90693E2B5FC2",
    titulo: "Fazenda Córrego Fundo", valor: 4900000,
    descricao: "Fazenda de pecuária com córrego perene, duas represas, casa sede, casa de funcionário e curral coberto. Topografia levemente ondulada.",
    carac: { benfeitorias: ["casa sede", "casa de funcionário", "curral coberto", "represas"], solo: "misto" },
    condicoes: "Aceita permuta parcial por imóvel urbano",
  },
  {
    tipo: "rural", car: "MG-3134400-D6BD1A0A6C2C411CA85A21A93B4DD1FD",
    titulo: "Fazenda Três Barras", valor: 11500000,
    descricao: "Área de 300 ha apta para agricultura e pecuária, com reserva legal averbada, rede elétrica trifásica e sede completa.",
    carac: { benfeitorias: ["sede", "barracão de máquinas", "curral", "rede trifásica"], solo: "argiloso" },
  },
  {
    tipo: "urbano", lote: "026507f7-244c-4342-88b4-eebe6bcc2ff4",
    titulo: "Lote central — Quadra 35", valor: 420000,
    descricao: "Lote no centro de Iturama, a uma quadra da avenida principal. Plano, murado nas laterais, pronto para construir.",
    carac: { zoneamento: "misto" },
  },
  {
    tipo: "urbano", lote: "008d86fb-2791-4848-800e-2825d5f5c3f8",
    titulo: "Lote residencial — Quadra 15", valor: 165000,
    descricao: "Lote residencial em bairro consolidado, rua asfaltada, água, esgoto e iluminação. Documentação em dia.",
    carac: { zoneamento: "residencial" },
  },
];

const { rows: [mun] } = await db.query(`select id from municipalities where nome = 'Iturama'`);
const { rows: [owner] } = await db.query(`select id from owners order by created_at limit 1`);
const { rows: [partner] } = await db.query(`select id from partners limit 1`);
const { rows: [admin] } = await db.query(`select user_id from profiles where role = 'admin_central' order by created_at limit 1`);

for (const im of IMOVEIS) {
  const { rows: ja } = await db.query(`select codigo from properties where titulo = $1`, [im.titulo]);
  if (ja.length) { console.log(`já existe: ${ja[0].codigo} ${im.titulo}`); continue; }

  // divisa exata da base do mapa
  const { rows: [g] } = im.tipo === "rural"
    ? await db.query(`select st_asgeojson(geom) gj, area_ha * 10000 m2 from car_imoveis where cod_imovel = $1`, [im.car])
    : await db.query(`select st_asgeojson(geom) gj, area_m2 m2, numero, quadra from urban_lots where id = $1`, [im.lote]);
  if (!g) { console.error(`base não encontrada para ${im.titulo}`); continue; }

  const rural = im.tipo === "rural";
  const area = rural ? Math.round(g.m2 / 100) / 100 : Math.round(g.m2);
  const carac = {
    ...im.carac, demo: true, unidade_area: rural ? "ha" : "m2",
    ...(rural ? {} : { lote: g.numero, quadra: g.quadra }),
  };
  const { rows: [p] } = await db.query(
    `insert into properties (tipo, owner_id, partner_id, municipality_id, titulo, descricao, valor, area_declarada,
       caracteristicas, condicoes_venda, car_codigo, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'rascunho', $12) returning id, codigo`,
    [im.tipo, rural ? owner.id : null, rural ? null : partner.id, mun.id, im.titulo, im.descricao, im.valor, area,
     carac, im.condicoes ?? null, rural ? im.car : null, admin.user_id]);
  await db.query(`select * from fn_upsert_geometry($1, $2::jsonb, $3, null, 'fonte_oficial', 'divisa copiada da base do mapa (CAR ou planta do município)', $4)`,
    [p.id, g.gj, rural ? "car" : "lote", admin.user_id]);
  await db.query(`select fn_validar_geometria($1, $2, 'Divisa idêntica à base oficial (CAR ou planta do município)')`,
    [p.id, admin.user_id]);
  for (const s of ["pendente", "em_analise", "aprovado", "publicado"])
    await db.query(`update properties set status = $2 where id = $1`, [p.id, s]);
  console.log(`criado: ${p.codigo} ${im.titulo} (${area} ${rural ? "ha" : "m²"})`);
}

await db.end();
