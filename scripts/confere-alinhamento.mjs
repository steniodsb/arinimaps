// Confere o alinhamento das plantas urbanas com o OpenStreetMap (roadmap 2.6).
//
// Não dá para "olhar" se a planta bate com o satélite, mas dá para MEDIR: as
// ruas do OSM foram traçadas sobre imagem de satélite, e na planta a rua é o
// vão entre as frentes dos lotes de um lado e do outro. Se a planta está no
// lugar, o eixo da rua do OSM passa no meio desse vão.
//
// MÉTODO
//  1. Ruas do OSM (Overpass, com User-Agent) no retângulo dos lotes da planta.
//  2. Pontos a cada 15 m ao longo de cada trecho reto de rua (≥ 20 m e longe
//     das esquinas), com a normal do trecho.
//  3. Em cada ponto, uma linha de ±25 m na direção da normal; a primeira divisa
//     de lote de cada lado dá as distâncias a (lado +n) e b (lado −n). Só vale
//     se as duas existem e o vão a+b fica entre 6 e 40 m (largura de rua com
//     calçada); senão é praça, esquina, rua sem lote ao lado.
//  4. Deslocamento medido naquele ponto, ao longo da normal: o = (a − b) / 2
//     (positivo = o meio do vão da planta está do lado +n da rua do OSM).
//  5. Por célula de 500 m, o vetor de deslocamento v = (leste, norte) sai por
//     mínimos quadrados de o_i = n_i · v (ruas em várias direções resolvem as
//     duas componentes), com uma rodada de corte de discrepantes (> 2,5 σ).
//     v é quanto a PLANTA está deslocada em relação ao OSM; para corrigir,
//     aplique −v na calibração.
//  6. Nome da célula: o bairro do OSM (place=suburb/neighbourhood/quarter)
//     mais próximo, a até 1,5 km; sem nome, o código da célula.
//
// LIMITES (declarados no relatório): o OSM tem erro próprio de alguns metros e
// pode estar traçado sobre outra imagem; célula com poucas amostras ou com
// ruas numa direção só não resolve as duas componentes — o script marca.
//
// Uso: node scripts/confere-alinhamento.mjs [--json saida.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const iJson = process.argv.indexOf("--json");
const saidaJson = iJson > 0 ? process.argv[iJson + 1] : null;

const UA = "AriniImoveisBrasil/1.0 (contato@ariniimoveisbrasil.com.br)";
const CELULA_M = 500;
const PASSO_M = 15;
const MIN_AMOSTRAS = 15;

const db = new pg.Pool({
  host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false }, max: 2,
});

async function overpass(q) {
  const espelhos = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  // o Overpass público oscila (504/429): três voltas pelos espelhos, com pausa
  for (let volta = 0; volta < 3; volta++) for (const url of espelhos) {
    if (volta) await new Promise((r) => setTimeout(r, 15_000));
    try {
      const r = await fetch(url, {
        method: "POST", body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (r.ok) return await r.json();
      console.log(`  overpass ${url} → HTTP ${r.status}`);
    } catch (e) {
      console.log(`  overpass ${url} → ${e.message}`);
    }
  }
  throw new Error("Overpass indisponível");
}

const rumo = (e, n) => {
  const az = (Math.atan2(e, n) * 180) / Math.PI;
  const nomes = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return nomes[Math.round(((az + 360) % 360) / 45) % 8];
};

function ajustar(amostras) {
  // mínimos quadrados de o = nx·ve + ny·vn
  const resolver = (lista) => {
    let sxx = 0, sxy = 0, syy = 0, bx = 0, by = 0;
    for (const a of lista) { sxx += a.nx * a.nx; sxy += a.nx * a.ny; syy += a.ny * a.ny; bx += a.o * a.nx; by += a.o * a.ny; }
    const det = sxx * syy - sxy * sxy;
    // condicionamento: ruas todas na mesma direção não resolvem a componente ao longo delas
    const cond = det / Math.max(1e-9, ((sxx + syy) / 2) ** 2);
    if (det < 1e-6) return null;
    return { ve: (syy * bx - sxy * by) / det, vn: (sxx * by - sxy * bx) / det, cond };
  };
  let v = resolver(amostras);
  if (!v) return null;
  const res = (a) => a.o - (a.nx * v.ve + a.ny * v.vn);
  const sigma = Math.sqrt(amostras.reduce((s, a) => s + res(a) ** 2, 0) / amostras.length);
  const boas = amostras.filter((a) => Math.abs(res(a)) <= Math.max(1, 2.5 * sigma));
  v = resolver(boas) ?? v;
  const sigma2 = Math.sqrt(boas.reduce((s, a) => s + (a.o - (a.nx * v.ve + a.ny * v.vn)) ** 2, 0) / boas.length);
  return { ...v, n: boas.length, descartadas: amostras.length - boas.length, sigma: sigma2 };
}

const { rows: plantas } = await db.query(`
  select c.id, c.nome, m.nome municipio, c.offset_leste_m, c.offset_norte_m, c.rotacao_graus, c.escala, c.lotes_total
  from cartography_layers c join municipalities m on m.id = c.municipality_id
  where c.tipo = 'vector' and c.status = 'pronto' and coalesce(c.lotes_total, 0) > 0 order by m.nome`);

const relatorio = [];
for (const pl of plantas) {
  console.log(`\n== ${pl.municipio} (${pl.lotes_total} lotes; calibração atual: leste ${pl.offset_leste_m} m, norte ${pl.offset_norte_m} m, giro ${pl.rotacao_graus}°, escala ${pl.escala})`);
  const { rows: [bb] } = await db.query(`
    select st_xmin(e) x0, st_ymin(e) y0, st_xmax(e) x1, st_ymax(e) y1 from (
      select st_extent(geom)::geometry e from urban_lots where layer_id = $1) s`, [pl.id]);
  const caixa = `${bb.y0},${bb.x0},${bb.y1},${bb.x1}`;
  let osm;
  try {
    osm = await overpass(`[out:json][timeout:90];(
    way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service)$"](${caixa});
  );out geom;
  (node["place"~"^(suburb|neighbourhood|quarter)$"](${caixa}););out;
  (way["building"](${caixa}););out count;`);
  } catch (e) {
    console.log(`  ${e.message} — cidade pulada`);
    relatorio.push({ municipio: pl.municipio, planta: pl.nome, erro: e.message });
    continue;
  }
  const ruas = (osm.elements ?? []).filter((e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 2);
  const lugares = (osm.elements ?? []).filter((e) => e.type === "node" && e.tags?.name);
  const contagem = (osm.elements ?? []).find((e) => e.type === "count");
  const predios = Number(contagem?.tags?.ways ?? contagem?.tags?.total ?? 0);
  console.log(`  OSM: ${ruas.length} trechos de rua · ${lugares.length} bairros nomeados · ${predios} prédios`);

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("create temp table _ruas (g geometry(LineString, 31982)) on commit drop");
    const wkts = ruas.map((w) => `LINESTRING(${w.geometry.map((p) => `${p.lon} ${p.lat}`).join(",")})`);
    for (let i = 0; i < wkts.length; i += 500) {
      await client.query(`insert into _ruas select st_transform(st_geomfromtext(w, 4326), 31982) from unnest($1::text[]) w`, [wkts.slice(i, i + 500)]);
    }
    await client.query(`create temp table _l on commit drop as select st_transform(geom, 31982) g from urban_lots where layer_id = $1`, [pl.id]);
    await client.query("create index on _l using gist (g)");
    await client.query("analyze _l");

    // pontos a cada 15 m nos trechos retos, a 8 m de distância das pontas do trecho (esquinas)
    const { rows: amostras } = await client.query(`
      with seg as (
        select (d).geom s from _ruas r, lateral st_dumpsegments(r.g) d
      ), seg2 as (
        select s, st_length(s) len,
          (st_x(st_endpoint(s)) - st_x(st_startpoint(s))) / st_length(s) tx,
          (st_y(st_endpoint(s)) - st_y(st_startpoint(s))) / st_length(s) ty
        from seg where st_length(s) >= 20
      ), pts as (
        select st_lineinterpolatepoint(s, f) p, -ty nx, tx ny
        from seg2, lateral generate_series(8::numeric, (len - 8)::numeric, ${PASSO_M}::numeric) dist, lateral (select dist::float8 / len f) ff
      ), cortes as (
        select p, nx, ny,
          (select min(t) from (
             select (st_x(q) - st_x(p)) * nx + (st_y(q) - st_y(p)) * ny t
             from _l, lateral (select (st_dump(st_intersection(st_boundary(_l.g), ray))).geom q) x
             where _l.g && ray and st_geometrytype(q) = 'ST_Point'
           ) z where t > 0.3) a,
          (select min(-t) from (
             select (st_x(q) - st_x(p)) * nx + (st_y(q) - st_y(p)) * ny t
             from _l, lateral (select (st_dump(st_intersection(st_boundary(_l.g), ray))).geom q) x
             where _l.g && ray and st_geometrytype(q) = 'ST_Point'
           ) z where t < -0.3) b
        from pts, lateral (select st_makeline(
          st_translate(p, -25 * nx, -25 * ny), st_translate(p, 25 * nx, 25 * ny)) ray) rr
      )
      select st_x(p) x, st_y(p) y, nx, ny, a, b,
        st_x(st_transform(p, 4326)) lng, st_y(st_transform(p, 4326)) lat
      from cortes where a is not null and b is not null and a + b between 6 and 40`);
    await client.query("commit");

    // células e nome do bairro
    const lugaresUtm = [];
    if (lugares.length) {
      const { rows } = await db.query(
        `select st_x(g) x, st_y(g) y, nome from (select st_transform(st_setsrid(st_makepoint(lng, lat), 4326), 31982) g, nome
           from unnest($1::float8[], $2::float8[], $3::text[]) u(lng, lat, nome)) s`,
        [lugares.map((l) => l.lon), lugares.map((l) => l.lat), lugares.map((l) => l.tags.name)]);
      lugaresUtm.push(...rows);
    }
    const celulas = new Map();
    for (const a of amostras) {
      const k = `${Math.floor(a.x / CELULA_M)}:${Math.floor(a.y / CELULA_M)}`;
      if (!celulas.has(k)) celulas.set(k, []);
      celulas.get(k).push({ nx: Number(a.nx), ny: Number(a.ny), o: (Number(a.a) - Number(a.b)) / 2, x: a.x, y: a.y, lng: a.lng, lat: a.lat });
    }

    const geral = ajustar([...celulas.values()].flat());
    const linhas = [];
    for (const [k, lista] of celulas) {
      if (lista.length < MIN_AMOSTRAS) continue;
      const v = ajustar(lista);
      if (!v) continue;
      const cx = lista.reduce((s, a) => s + a.x, 0) / lista.length, cy = lista.reduce((s, a) => s + a.y, 0) / lista.length;
      let nome = null, dmin = 1500;
      for (const l of lugaresUtm) { const d = Math.hypot(l.x - cx, l.y - cy); if (d < dmin) { dmin = d; nome = l.nome; } }
      linhas.push({
        celula: k, bairro: nome, amostras: v.n, descartadas: v.descartadas,
        leste_m: +v.ve.toFixed(1), norte_m: +v.vn.toFixed(1), modulo_m: +Math.hypot(v.ve, v.vn).toFixed(1),
        rumo: rumo(v.ve, v.vn), sigma_m: +v.sigma.toFixed(1), resolvida: v.cond > 0.15,
        lng: +(lista.reduce((s, a) => s + a.lng, 0) / lista.length).toFixed(5),
        lat: +(lista.reduce((s, a) => s + a.lat, 0) / lista.length).toFixed(5),
      });
    }
    linhas.sort((a, b) => b.modulo_m - a.modulo_m);
    console.log(`  amostras válidas: ${amostras.length} em ${celulas.size} células; ${linhas.length} células com ≥ ${MIN_AMOSTRAS} amostras`);
    if (geral) console.log(`  cidade inteira: leste ${geral.ve.toFixed(1)} m · norte ${geral.vn.toFixed(1)} m (|v| ${Math.hypot(geral.ve, geral.vn).toFixed(1)} m, σ ${geral.sigma.toFixed(1)} m, n ${geral.n})`);
    for (const l of linhas) {
      console.log(`  ${(l.bairro ?? l.celula).padEnd(32)} n=${String(l.amostras).padStart(4)}  L ${String(l.leste_m).padStart(5)}  N ${String(l.norte_m).padStart(5)}  |v| ${String(l.modulo_m).padStart(4)} m ${l.rumo.padEnd(2)}  σ ${l.sigma_m}${l.resolvida ? "" : "  (ruas numa direção só)"}  @ ${l.lat},${l.lng}`);
    }
    relatorio.push({
      municipio: pl.municipio, planta: pl.nome, lotes: pl.lotes_total,
      calibracao: { leste: Number(pl.offset_leste_m), norte: Number(pl.offset_norte_m), giro: Number(pl.rotacao_graus), escala: Number(pl.escala) },
      osm: { ruas: ruas.length, bairros: lugares.length, predios },
      amostras: amostras.length,
      geral: geral && { leste_m: +geral.ve.toFixed(1), norte_m: +geral.vn.toFixed(1), modulo_m: +Math.hypot(geral.ve, geral.vn).toFixed(1), sigma_m: +geral.sigma.toFixed(1), n: geral.n },
      celulas: linhas,
    });
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    console.log(`  falhou: ${e.message}`);
  } finally {
    client.release();
  }
}
await db.end();
if (saidaJson) { writeFileSync(saidaJson, JSON.stringify(relatorio, null, 1)); console.log(`\nJSON em ${saidaJson}`); }
