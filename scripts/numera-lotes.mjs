// Número do lote e da quadra (roadmap 2.11), lidos dos TEXTOS da planta CAD.
//
// O conversor (converte-dxf.mjs) descarta textos: o mapa precisa de linhas.
// Aqui fazemos o contrário — lemos só os textos (TEXT/MTEXT do model space e de
// dentro dos blocos inseridos), levamos cada ponto de inserção para o MESMO
// espaço dos lotes (`urban_lots`) e casamos no banco, por ponto-no-polígono.
//
// Uso:
//   node --max-old-space-size=8192 scripts/numera-lotes.mjs "<arquivo.dxf>" "<Município>" [sirgas|sad69|corrego] [zona]
//   DRY=1 → só lê e classifica os textos e mostra a contagem; não grava nada.
//
// MESMO ESPAÇO DOS LOTES. Os lotes foram gerados (worker/jobs/gerarLotes.mjs) a
// partir do GeoJSON da planta, com a calibração (deslocamento, giro, escala em
// torno do centro do GeoJSON) aplicada por ST_Affine. Aqui o texto passa pela
// mesma cadeia: UTM do datum da planta → WGS84 (proj4, mesmas definições do
// conversor) → a MESMA afim (`afim` e `centroDe` importados do gerador). Se a
// calibração mudar, rode gera-lotes e depois este script de novo.
//
// HEURÍSTICA (medida na planta de Iturama em 07/10/2026; ver o relatório no fim):
//  1. Texto útil é um "token curto": número de 1–4 dígitos com letra opcional
//     ("07", "12A"), letra(s) com número opcional ("A", "F-1") ou número-letra
//     ("2-A"). Cota ("8,00"), área ("160,00 m²"), nomes de rua e tudo com
//     vírgula, ponto ou espaço ficam de fora. "QUADRA 12" / "QD 12" / "Q-12"
//     explícitos valem como quadra direto.
//  2. Letra solta que tem outra letra solta da mesma altura a menos de 1,6×
//     altura é nome escrito letra a letra (rua na vertical) — descartada.
//  3. Quadra física = conjunto de lotes que se tocam (ST_ClusterDBSCAN, 1 m);
//     o contorno é o fecho convexo desses lotes.
//  4. Altura típica do número de lote em cada quadra = moda da altura dos
//     números que caem DENTRO de lotes daquela quadra.
//  5. Rótulo de quadra = token dentro do contorno da quadra com altura ≥ 1,3×
//     a altura típica dos números de lote (sem altura típica: ≥ 3 m) e ≤ 15 m
//     (acima disso é nome de bairro); "QUADRA X" explícito tem prioridade. Cada
//     lote recebe o rótulo mais próximo entre os mais altos da quadra (≥ 85% da
//     maior altura) — a mesma quadra pode ter o rótulo repetido.
//  6. Número do lote = número dentro do polígono, com a altura típica (±15%)
//     quando ela existe. Mais de um número distinto dentro do mesmo polígono =
//     faces fundidas na poligonização: fica SEM número (não inventamos).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import DxfParser from "dxf-parser";
import proj4 from "proj4";
import pg from "pg";
import { afim, centroDe } from "../worker/jobs/gerarLotes.mjs";

const [, , arquivoDxf, nomeMunicipio, datumArg = "sirgas", zonaArg = "22"] = process.argv;
if (!arquivoDxf || !nomeMunicipio) {
  console.error('Uso: node --max-old-space-size=8192 scripts/numera-lotes.mjs "<arquivo.dxf>" "<Município>" [sirgas|sad69|corrego] [zona]');
  process.exit(1);
}
const DRY = process.env.DRY === "1";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

// mesmas definições de scripts/converte-dxf.mjs — o texto tem de cair onde a linha caiu
const z = Number(zonaArg);
const DATUMS = {
  sirgas: `+proj=utm +zone=${z} +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
  sad69: `+proj=utm +zone=${z} +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs`,
  corrego: `+proj=utm +zone=${z} +south +ellps=intl +towgs84=-206,172,-6,0,0,0,0 +units=m +no_defs`,
};
const projDef = DATUMS[datumArg] ?? DATUMS.sirgas;
const dentro = ([x, y]) => x > 100000 && x < 900000 && y > 6000000 && y < 10000000;

// ---------- 1. textos do DXF (model space + blocos inseridos) ----------
console.log(`lendo ${arquivoDxf}…`);
const t0 = Date.now();
const dxf = new DxfParser().parseSync(readFileSync(arquivoDxf, "utf8"));
const blocos = dxf.blocks ?? {};
console.log(`DXF lido em ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const IDENT = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const aplicar = (T, [x, y]) => [T.a * x + T.b * y + T.tx, T.c * x + T.d * y + T.ty];
const compor = (T, U) => ({
  a: T.a * U.a + T.b * U.c, b: T.a * U.b + T.b * U.d,
  c: T.c * U.a + T.d * U.c, d: T.c * U.b + T.d * U.d,
  tx: T.a * U.tx + T.b * U.ty + T.tx, ty: T.c * U.tx + T.d * U.ty + T.ty,
});
function transformInsert(ins, bloco) {
  const sx = ins.xScale ?? 1, sy = ins.yScale ?? 1;
  const rot = ((ins.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const bx = bloco.position?.x ?? 0, by = bloco.position?.y ?? 0;
  const px = ins.position?.x ?? 0, py = ins.position?.y ?? 0;
  const a = cos * sx, b = -sin * sy, c = sin * sx, d = cos * sy;
  return { a, b, c, d, tx: px - (a * bx + b * by), ty: py - (c * bx + d * by) };
}

/** Tira a formatação do MTEXT: {\fArial|b1;07} → "07", \P → espaço. */
const limparTexto = (s) =>
  String(s ?? "").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/\\P/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

const brutos = [];
function varrer(entidades, T, layerHerdado, prof) {
  for (const e of entidades ?? []) {
    if (e.inPaperSpace) continue;
    const layer = layerHerdado && (!e.layer || e.layer === "0") ? layerHerdado : (e.layer ?? "0");
    if ((e.type === "TEXT" || e.type === "MTEXT") && e.text) {
      const p = e.type === "TEXT" ? (e.startPoint ?? e.position) : e.position;
      if (!p) continue;
      const esc = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c));
      brutos.push({ texto: limparTexto(e.text), h: (e.textHeight ?? e.height ?? 0) * esc, layer, utm: aplicar(T, [p.x, p.y]) });
    } else if (e.type === "INSERT" && e.name && prof < 8) {
      const bloco = blocos[e.name];
      if (!bloco?.entities) continue;
      varrer(bloco.entities, compor(T, transformInsert(e, bloco)), e.layer && e.layer !== "0" ? e.layer : layerHerdado, prof + 1);
    }
  }
}
varrer(dxf.entities, IDENT, null, 0);
console.log(`textos no desenho: ${brutos.length}`);

// ---------- 2. classificação ----------
const RX_QUADRA = /^(?:QUADRA|QUAD\.?|QD\.?|Q\.?)\s*[-:]?\s*(?:N[º°O.]?\s*)?([0-9]{1,3}[A-Z]?|[A-Z]{1,2}(?:-?[0-9]{1,2})?)$/i;
const RX_NUM = /^[0-9]{1,4}[A-Z]?$/;
const RX_CURTO = /^(?:[0-9]{1,4}[A-Z]?|[A-Z]{1,2}(?:-?[0-9]{1,2})?|[0-9]{1,3}-[A-Z0-9]{1,2})$/;

const tokens = [];
const stats = { explicita: 0, numero: 0, letra: 0, soletrada: 0, fora: 0 };
for (const b of brutos) {
  if (!dentro(b.utm) || !(b.h > 0)) { stats.fora++; continue; }
  const s = b.texto.toUpperCase();
  const q = s.match(RX_QUADRA);
  if (q && (/^(QUADRA|QUAD|QD)/.test(s) || /^Q[-. ]\s*[0-9]/.test(s))) {
    tokens.push({ tok: q[1], tipo: "explicita", ...b }); stats.explicita++;
  } else if (RX_NUM.test(s)) {
    tokens.push({ tok: s, tipo: "numero", ...b }); stats.numero++;
  } else if (RX_CURTO.test(s)) {
    tokens.push({ tok: s, tipo: "letra", ...b }); stats.letra++;
  }
}

// letras soltas vizinhas e da mesma altura = palavra escrita letra a letra
const letras = tokens.filter((t) => t.tipo === "letra" && /^[A-Z]$/.test(t.tok));
const grade = new Map();
const celula = (x, y) => `${Math.floor(x / 10)}:${Math.floor(y / 10)}`;
for (const t of letras) {
  const k = celula(t.utm[0], t.utm[1]);
  if (!grade.has(k)) grade.set(k, []);
  grade.get(k).push(t);
}
for (const t of letras) {
  const [cx, cy] = [Math.floor(t.utm[0] / 10), Math.floor(t.utm[1] / 10)];
  outer: for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const o of grade.get(`${cx + i}:${cy + j}`) ?? []) {
      if (o === t || Math.abs(o.h - t.h) > 0.05 * t.h) continue;
      if (Math.hypot(o.utm[0] - t.utm[0], o.utm[1] - t.utm[1]) < 1.6 * t.h) { t.soletrada = true; break outer; }
    }
  }
}
const uteis = tokens.filter((t) => !t.soletrada);
stats.soletrada = tokens.length - uteis.length;
console.log(`tokens: ${stats.numero} números · ${stats.letra} letras/códigos (${stats.soletrada} descartados por serem palavra soletrada) · ${stats.explicita} "QUADRA X" explícitos · ${stats.fora} fora da zona`);

const alturas = new Map();
for (const t of uteis.filter((x) => x.tipo === "numero")) {
  const h = Math.round(t.h * 10) / 10;
  alturas.set(h, (alturas.get(h) ?? 0) + 1);
}
console.log(`alturas dos números (m): ${[...alturas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => `${h}→${n}`).join(" · ")}`);
if (DRY) { console.log("DRY=1 — nada gravado."); process.exit(0); }

// ---------- 3. mesmo espaço dos lotes ----------
const db = new pg.Pool({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, max: 2,
});
const { rows: [cam] } = await db.query(`
  select c.id, c.nome, c.tiles_path, c.offset_leste_m, c.offset_norte_m, c.rotacao_graus, c.escala, c.lotes_total
  from cartography_layers c join municipalities m on m.id = c.municipality_id
  where m.nome ilike $1 and c.tipo = 'vector' and c.status = 'pronto' order by c.created_at desc limit 1`, [nomeMunicipio]);
if (!cam) { console.error(`nenhuma planta vetorial pronta para "${nomeMunicipio}"`); process.exit(1); }
if (!cam.lotes_total) { console.error(`${cam.nome}: os lotes ainda não foram gerados (scripts/gera-lotes.mjs)`); process.exit(1); }

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
console.log(`baixando o GeoJSON da planta para achar o centro da calibração…`);
const fc = await (await fetch(`${base}/storage/v1/object/public/media/${cam.tiles_path}`)).json();
const k = afim(centroDe(fc), {
  dx: Number(cam.offset_leste_m ?? 0), dy: Number(cam.offset_norte_m ?? 0),
  rot: Number(cam.rotacao_graus ?? 0), esc: Number(cam.escala ?? 1),
});
const arred = (n) => Math.round(n * 1e6) / 1e6; // o conversor grava 6 casas
for (const t of uteis) {
  const [lng0, lat0] = proj4(projDef, "EPSG:4326", t.utm).map(arred);
  // ST_Affine 2D: x' = a·x + b·y + xoff ; y' = d·x + e·y + yoff
  t.lng = k.a * lng0 + k.b * lat0 + k.xoff;
  t.lat = k.d * lng0 + k.e * lat0 + k.yoff;
}

// ---------- 4. casamento no banco ----------
const client = await db.connect();
try {
  await client.query("set statement_timeout = 0");
  await client.query("begin");
  await client.query(`create temp table _t (id serial primary key, tok text, tipo text, h numeric, g geometry(Point, 31982)) on commit drop`);
  for (let i = 0; i < uteis.length; i += 5000) {
    const lote = uteis.slice(i, i + 5000);
    await client.query(`
      insert into _t (tok, tipo, h, g)
      select tok, tipo, h, st_transform(st_setsrid(st_makepoint(lng, lat), 4326), 31982)
      from unnest($1::text[], $2::text[], $3::numeric[], $4::float8[], $5::float8[]) as u(tok, tipo, h, lng, lat)`,
    [lote.map((t) => t.tok), lote.map((t) => t.tipo), lote.map((t) => Math.round(t.h * 1000) / 1000), lote.map((t) => t.lng), lote.map((t) => t.lat)]);
  }
  await client.query("create index on _t using gist (g)");

  // lotes da planta e as quadras físicas (lotes que se tocam)
  await client.query(`
    create temp table _l on commit drop as
    select id, g, st_pointonsurface(g) p, st_clusterdbscan(g, 1.0, 1) over () cid
    from (select id, st_transform(geom, 31982) g from urban_lots where layer_id = $1) s`, [cam.id]);
  await client.query("create index on _l using gist (g)");
  await client.query(`create temp table _q on commit drop as select cid, st_convexhull(st_collect(g)) hull, count(*) n from _l group by cid`);
  await client.query("create index on _q using gist (hull)");

  // texto → lote que o contém e quadra cujo contorno o contém (o menor, se houver dois)
  await client.query(`
    create temp table _tl on commit drop as
    select t.*, (select l.id from _l l where st_contains(l.g, t.g) limit 1) lote_id,
           (select q.cid from _q q where st_contains(q.hull, t.g) order by st_area(q.hull) limit 1) cid
    from _t t`);

  // altura típica do número de lote em cada quadra
  await client.query(`
    create temp table _hq on commit drop as
    select l.cid, mode() within group (order by round(t.h, 2)) h_lote, count(*) n
    from _tl t join _l l on l.id = t.lote_id
    where t.tipo = 'numero' group by l.cid`);

  // candidatos a rótulo de quadra
  await client.query(`
    create temp table _rq on commit drop as
    select t.id, t.cid, t.tok, t.h, t.g, t.tipo = 'explicita' explicita
    from _tl t left join _hq hq on hq.cid = t.cid
    where t.cid is not null and (
      t.tipo = 'explicita'
      or (t.h <= 15 and t.h >= coalesce(hq.h_lote * 1.3, 3.0))
    )`);
  // em cada quadra, só os mais fortes: explícitos, ou os mais altos (≥ 85% do maior)
  await client.query(`
    delete from _rq r using (
      select cid, bool_or(explicita) tem_expl, max(h) hmax from _rq group by cid
    ) m
    where r.cid = m.cid and ((m.tem_expl and not r.explicita) or (not m.tem_expl and r.h < 0.85 * m.hmax))`);

  await client.query("update urban_lots set numero = null, quadra = null where layer_id = $1", [cam.id]);

  // número: o(s) número(s) dentro do lote, na altura típica; mais de um distinto = ambíguo
  const num = await client.query(`
    with cand as (
      select t.lote_id, t.tok, t.h, st_distance(t.g, l.p) d
      from _tl t join _l l on l.id = t.lote_id left join _hq hq on hq.cid = l.cid
      where t.tipo = 'numero'
        and t.id not in (select id from _rq)
        and (hq.h_lote is null or abs(t.h - hq.h_lote) <= 0.15 * hq.h_lote)
    ), por_lote as (
      select lote_id, count(distinct tok) distintos, (array_agg(tok order by d))[1] tok from cand group by lote_id
    )
    update urban_lots u set numero = p.tok
    from por_lote p where u.id = p.lote_id and p.distintos = 1`);
  const { rows: [amb] } = await client.query(`
    select count(*) n from (
      select t.lote_id from _tl t join _l l on l.id = t.lote_id left join _hq hq on hq.cid = l.cid
      where t.tipo = 'numero' and t.id not in (select id from _rq)
        and (hq.h_lote is null or abs(t.h - hq.h_lote) <= 0.15 * hq.h_lote)
      group by t.lote_id having count(distinct t.tok) > 1) s`);

  // quadra: o rótulo forte mais próximo dentro da mesma quadra física
  const qd = await client.query(`
    update urban_lots u set quadra = s.tok
    from (
      select distinct on (l.id) l.id, r.tok
      from _l l join _rq r on r.cid = l.cid
      order by l.id, st_distance(r.g, l.p)
    ) s where u.id = s.id`);

  const { rows: [tot] } = await client.query(`
    select count(*) lotes, count(numero) com_numero, count(quadra) com_quadra,
           count(*) filter (where numero is not null and quadra is not null) com_ambos
    from urban_lots where layer_id = $1`, [cam.id]);
  const { rows: [q] } = await client.query(`select count(*) quadras, count(*) filter (where n > 1) com_mais_de_um from _q`);
  const { rows: [qr] } = await client.query(`select count(distinct cid) quadras_com_rotulo from _rq`);
  const { rows: [tl] } = await client.query(`select count(*) filter (where tipo = 'numero' and lote_id is not null) numeros_em_lote, count(*) filter (where tipo = 'numero') numeros from _tl`);
  await client.query("commit");

  console.log(`\n${cam.nome}`);
  console.log(`  números de lote no desenho: ${tl.numeros} (${tl.numeros_em_lote} caem dentro de algum lote)`);
  console.log(`  quadras físicas (lotes que se tocam): ${q.quadras} (${q.com_mais_de_um} com 2+ lotes) · com rótulo de quadra: ${qr.quadras_com_rotulo}`);
  console.log(`  lotes: ${tot.lotes} · com número: ${tot.com_numero} (${num.rowCount}) · com quadra: ${tot.com_quadra} (${qd.rowCount}) · com os dois: ${tot.com_ambos}`);
  console.log(`  lotes com 2+ números distintos dentro (faces fundidas, ficaram sem número): ${amb.n}`);
} catch (e) {
  await client.query("rollback").catch(() => undefined);
  console.error("falhou:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
