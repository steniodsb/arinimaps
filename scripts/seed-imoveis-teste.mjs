// Imóveis de teste até 20 rurais e 20 urbanos no mapa (contando os 3 do seed.mjs) com a divisa copiada da base do mapa: os rurais usam o
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
  {
    tipo: "rural", car: "MG-3134400-821BFE6A50E14D9881C2F204D7FD1EAA",
    titulo: "Chácara Bela Vista", valor: 520000,
    descricao: "Chácara de 8 ha com casa avarandada, pomar, horta e tanque de peixes. A 15 minutos do centro de Iturama.",
    carac: { benfeitorias: ["casa avarandada", "pomar", "tanque de peixes"], solo: "arenoso" },
  },
  {
    tipo: "rural", car: "MG-3134400-6122D83727C84F1FA28535EA4EA8D699",
    titulo: "Sítio Boa Esperança", valor: 1480000,
    descricao: "Sítio de 41 ha com pastagem reformada, curral, mangueiro e duas aguadas. Energia monofásica e casa de caseiro.",
    carac: { benfeitorias: ["casa de caseiro", "curral", "aguadas"], solo: "misto" },
    condicoes: "Aceita financiamento rural",
  },
  {
    tipo: "rural", car: "MG-3134400-9891DE9B01DA41C59DACB7821A7E9B7B",
    titulo: "Fazenda São Sebastião", valor: 5200000,
    descricao: "Fazenda de 120 ha com lavoura de cana arrendada, sede reformada e reserva legal preservada. Renda imediata.",
    carac: { benfeitorias: ["sede reformada", "barracão", "lavoura arrendada"], solo: "argiloso" },
  },
  {
    tipo: "urbano", lote: "c971b9a2-6d64-4dd8-8c6c-88506609c398",
    titulo: "Lote de esquina — Quadra 41", valor: 460000,
    descricao: "Lote de esquina no centro, ótimo para comércio. Duas frentes, rua asfaltada e alto fluxo de pedestres.",
    carac: { zoneamento: "comercial" },
  },
  {
    tipo: "urbano", lote: "9c93c976-adfa-42c6-982b-1d4de251a3f5",
    titulo: "Terreno amplo — Quadra 33", valor: 690000,
    descricao: "Terreno de 1.000 m² perto do centro, ideal para galpão, condomínio pequeno ou casa com área de lazer.",
    carac: { zoneamento: "misto" },
  },
  {
    tipo: "urbano", lote: "01106557-249c-4ad6-ba56-a5e7ec77b683",
    titulo: "Lote residencial — Quadra 16", valor: 158000,
    descricao: "Lote plano em bairro residencial, com água, esgoto e energia. Vizinhança tranquila e escola a duas quadras.",
    carac: { zoneamento: "residencial" },
  },

];

const { rows: [mun] } = await db.query(`select id from municipalities where nome = 'Iturama'`);
const { rows: [owner] } = await db.query(`select id from owners order by created_at limit 1`);
const { rows: [partner] } = await db.query(`select id from partners limit 1`);
const { rows: [admin] } = await db.query(`select user_id from profiles where role = 'admin_central' order by created_at limit 1`);


// ---------- completa até ALVO por tipo, escolhendo da própria base ----------
// rurais: CAR ativo, quase sem sobreposição com outro CAR, até 25 km de Iturama;
// urbanos: lote numerado da planta, até 2,5 km do centro. Longe dos já criados.
const ALVO = 20;
const NOMES_RURAIS = [
  "Fazenda Santa Rita", "Sítio Recanto Verde", "Fazenda Bom Jardim", "Chácara Pôr do Sol", "Fazenda Ouro Verde",
  "Sítio Três Irmãos", "Fazenda Água Branca", "Chácara Sabiá", "Fazenda Estrela do Pontal", "Sítio Paineiras",
  "Fazenda Barreiro", "Sítio Cachoeirinha", "Fazenda Primavera", "Chácara Vale do Sol", "Fazenda Santo Antônio",
];
const NOMES_URBANOS = ["Lote residencial", "Lote comercial", "Terreno", "Lote de meio de quadra", "Lote plano"];
const DESC_RURAL = [
  "Pastagem formada, curral, energia na porteira e água abundante.",
  "Boa topografia para lavoura, acesso por estrada cascalhada o ano todo.",
  "Casa sede, represa e reserva legal preservada. Documentação em dia.",
  "Área arrendada para cana com renda mensal, pronta para transferir.",
];
const DESC_URBANO = [
  "Rua asfaltada, água, esgoto e energia. Documentação em dia.",
  "Terreno plano, pronto para construir, em bairro consolidado.",
  "Próximo a escola, mercado e posto de saúde.",
];
const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const longeDosOutros = (lista, x, y, minKm) =>
  lista.every((o) => Math.hypot((o.x - x) * 104.6, (o.y - y) * 111.1) >= minKm);

const { rows: contagem } = await db.query(`select tipo::text, count(*)::int n from properties group by tipo`);
const pendentes = new Set((await db.query(`select titulo from properties`)).rows.map((r) => r.titulo));
const falta = { rural: ALVO, urbano: ALVO };
for (const c of contagem) falta[c.tipo] -= c.n;
for (const im of IMOVEIS) if (!pendentes.has(im.titulo)) falta[im.tipo]--;
const { rows: ocupados } = await db.query(
  `select st_x(centroid) x, st_y(centroid) y from property_geometries`);

if (falta.rural > 0) {
  const { rows } = await db.query(`
    select cod_imovel, area_ha::float, st_x(st_centroid(geom)) x, st_y(st_centroid(geom)) y from car_imoveis c
    where municipio = 'Iturama' and status = 'AT' and area_ha between 6 and 700
      and st_dwithin(geom::geography, st_setsrid(st_point(-50.197, -19.730), 4326)::geography, 25000)
      and not exists (select 1 from property_geometries g where st_intersects(g.geom, c.geom))
      and coalesce((select sum(st_area(st_intersection(o.geom, c.geom))) from car_imoveis o
                    where o.cod_imovel <> c.cod_imovel and o.geom && c.geom and st_intersects(o.geom, c.geom)), 0)
          < 0.005 * st_area(c.geom)`);
  rows.sort((a, b) => hash(a.cod_imovel) - hash(b.cod_imovel));
  const usados = [...ocupados];
  let n = 0;
  for (const r of rows) {
    if (n >= falta.rural) break;
    if (!longeDosOutros(usados, r.x, r.y, 2)) continue;
    usados.push(r);
    const ha = r.area_ha, h = hash(r.cod_imovel);
    const porHa = 32000 + (h % 14) * 1000;
    const nome = NOMES_RURAIS[n % NOMES_RURAIS.length];
    const tipoRural = ha < 15 ? "Chácara" : ha < 60 ? "Sítio" : "Fazenda";
    const titulo = nome.replace(/^\S+/, tipoRural);
    IMOVEIS.push({
      tipo: "rural", car: r.cod_imovel, titulo, valor: Math.round((ha * porHa) / 10000) * 10000,
      descricao: `Área de ${ha.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha em Iturama. ${DESC_RURAL[h % DESC_RURAL.length]}`,
      carac: { solo: ["misto", "argiloso", "arenoso"][h % 3] },
    });
    n++;
  }
}

if (falta.urbano > 0) {
  const { rows } = await db.query(`
    select u.id::text, u.numero, u.quadra, u.area_m2::float, st_x(st_centroid(u.geom)) x, st_y(st_centroid(u.geom)) y
    from urban_lots u join municipalities m on m.id = u.municipality_id and m.nome = 'Iturama'
    where u.numero is not null and u.quadra is not null and u.area_m2 between 250 and 1200
      and st_dwithin(u.geom::geography, st_setsrid(st_point(-50.1973, -19.7297), 4326)::geography, 2500)
      and not exists (select 1 from property_geometries g where st_dwithin(g.geom, u.geom, 0.001))`);
  rows.sort((a, b) => hash(a.id) - hash(b.id));
  const usados = [...ocupados];
  let n = 0;
  for (const r of rows) {
    if (n >= falta.urbano) break;
    if (!longeDosOutros(usados, r.x, r.y, 0.25)) continue;
    // um lote por quadra
    if (IMOVEIS.some((i) => i.quadra === r.quadra)) continue;
    usados.push(r);
    const h = hash(r.id), m2 = Math.round(r.area_m2);
    const nome = m2 >= 700 ? "Terreno" : NOMES_URBANOS[h % NOMES_URBANOS.length];
    IMOVEIS.push({
      tipo: "urbano", lote: r.id, quadra: r.quadra,
      titulo: `${nome} — Quadra ${r.quadra}, lote ${r.numero}`,
      valor: Math.round((m2 * (420 + (h % 9) * 60)) / 1000) * 1000,
      descricao: `${m2} m² em Iturama. ${DESC_URBANO[h % DESC_URBANO.length]}`,
      carac: { zoneamento: nome === "Lote comercial" ? "comercial" : "residencial" },
    });
    n++;
  }
}

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
