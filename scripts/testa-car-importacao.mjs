// Importação manual das camadas ambientais do CAR (22/10/2026, docs/CAR-IMPORTACAO.md).
//
// Monta um zip no formato da base de downloads do SICAR (zips dentro do zip,
// .dbf em Latin-1, uma camada em UTM, outra sem .prj) com casos difíceis:
// polígono repetido, gravata (autointerseção), registro sem forma e polígono
// fora do Brasil. Sobe pela TELA da Central, como a equipe faz, e confere o
// banco, o histórico, o descarte, a cobertura e a consulta por área.
//
// Usa Fernando de Noronha (2605459) com polígonos sintéticos para não tocar em
// município de verdade; recusa rodar se lá já houver importação real. Desfaz tudo.
//
// Uso: node scripts/testa-car-importacao.mjs   (com `npm run dev` rodando)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import proj4 from "proj4";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (rotulo, cond, extra = "") => { if (!cond) falhas++; console.log(`${cond ? "✓" : "✗"} ${rotulo}${extra ? " — " + String(extra).slice(0, 240) : ""}`); };

const COD = 2605459; // Fernando de Noronha/PE
const { count: reais } = await admin.from("car_importacoes").select("id", { count: "exact", head: true })
  .eq("cod_ibge", COD).not("arquivo_nome", "like", "TESTE-%");
if (reais) {
  console.log(`– Fernando de Noronha já tem ${reais} importação(ões) real(is); teste não roda para não mexer nelas.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Arquivo de teste
// ---------------------------------------------------------------------------
const PRJ_SIRGAS = 'GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const PRJ_UTM25S = 'PROJCS["SIRGAS_2000_UTM_Zone_25S",GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-33.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const utm = proj4("EPSG:4326", PRJ_UTM25S);

/** quadrado (sentido horário, como o shapefile quer o anel externo) de lado `d` graus */
const quadrado = (x, y, d) => [[x, y], [x, y + d], [x + d, y + d], [x + d, y], [x, y]];
const buraco = (x, y, d) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]; // anti-horário
// 6 "imóveis" na ilha principal (~ -32,43 a -32,40; -3,86 a -3,84)
const imoveis = Array.from({ length: 6 }, (_, i) => ({
  cod: `PE-${COD}-TESTE${String(i).padStart(4, "0")}`,
  x: -32.432 + i * 0.004, y: -3.858, d: 0.003,
}));

function shapefile(registros, campos) {
  const conteudos = registros.map((r) => {
    if (!r.aneis) { const b = Buffer.alloc(4); b.writeInt32LE(0, 0); return b; }
    const pts = r.aneis.flat();
    const b = Buffer.alloc(44 + r.aneis.length * 4 + pts.length * 16);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    b.writeInt32LE(5, 0);
    b.writeDoubleLE(Math.min(...xs), 4); b.writeDoubleLE(Math.min(...ys), 12);
    b.writeDoubleLE(Math.max(...xs), 20); b.writeDoubleLE(Math.max(...ys), 28);
    b.writeInt32LE(r.aneis.length, 36); b.writeInt32LE(pts.length, 40);
    let o = 44, acc = 0;
    for (const a of r.aneis) { b.writeInt32LE(acc, o); o += 4; acc += a.length; }
    for (const [x, y] of pts) { b.writeDoubleLE(x, o); b.writeDoubleLE(y, o + 8); o += 16; }
    return b;
  });
  const cab = (tam) => { const h = Buffer.alloc(100); h.writeInt32BE(9994, 0); h.writeInt32BE(tam / 2, 24); h.writeInt32LE(1000, 28); h.writeInt32LE(5, 32); return h; };
  const partes = [], shx = [];
  let off = 100;
  conteudos.forEach((c, i) => {
    const rh = Buffer.alloc(8); rh.writeInt32BE(i + 1, 0); rh.writeInt32BE(c.length / 2, 4);
    const ix = Buffer.alloc(8); ix.writeInt32BE(off / 2, 0); ix.writeInt32BE(c.length / 2, 4);
    shx.push(ix); partes.push(rh, c); off += 8 + c.length;
  });
  const tamReg = 1 + campos.reduce((s, c) => s + c.tam, 0);
  const tamCab = 32 + campos.length * 32 + 1;
  const dbf = Buffer.alloc(tamCab + tamReg * registros.length + 1, 0x20);
  dbf.fill(0, 0, tamCab);
  dbf.writeUInt8(3, 0); dbf.writeUInt32LE(registros.length, 4); dbf.writeUInt16LE(tamCab, 8); dbf.writeUInt16LE(tamReg, 10);
  campos.forEach((c, i) => {
    const p = 32 + i * 32;
    dbf.write(c.nome, p, "latin1"); dbf.write(c.tipo, p + 11, "latin1"); dbf.writeUInt8(c.tam, p + 16); dbf.writeUInt8(c.dec ?? 0, p + 17);
  });
  dbf.writeUInt8(0x0d, tamCab - 1);
  registros.forEach((r, i) => {
    let p = tamCab + i * tamReg + 1;
    for (const c of campos) {
      const v = r.props[c.nome];
      const t = v == null ? "" : c.tipo === "N" ? Number(v).toFixed(c.dec ?? 0).padStart(c.tam) : String(v).padEnd(c.tam);
      dbf.write(t.slice(0, c.tam), p, "latin1"); p += c.tam;
    }
  });
  dbf.writeUInt8(0x1a, dbf.length - 1);
  return { shp: Buffer.concat([cab(off), ...partes]), shx: Buffer.concat([cab(100 + shx.length * 8), ...shx]), dbf };
}

const CAMPOS = [
  { nome: "COD_IMOVEL", tipo: "C", tam: 50 }, { nome: "NUM_AREA", tipo: "N", tam: 16, dec: 4 },
  { nome: "NOM_MUNICI", tipo: "C", tam: 40 },
];
const props = (cod) => ({ COD_IMOVEL: cod, NUM_AREA: 10, NOM_MUNICI: "Fernando de Noronha ação" });
async function zipTema(nome, registros, prj) {
  const z = new JSZip();
  const f = shapefile(registros, CAMPOS);
  z.file(`${nome}.shp`, f.shp); z.file(`${nome}.shx`, f.shx); z.file(`${nome}.dbf`, f.dbf);
  if (prj) z.file(`${nome}.prj`, prj);
  z.file(`${nome}.cpg`, "ISO-8859-1");
  return z.generateAsync({ type: "nodebuffer" });
}

const area = imoveis.map((m) => ({ aneis: [quadrado(m.x, m.y, m.d)], props: props(m.cod) }));
const app = imoveis.map((m) => ({ aneis: [quadrado(m.x, m.y, m.d / 3)], props: props(m.cod) }));
app.push({ ...app[0] });                                                                       // repetido
app.push({ aneis: [[[-32.42, -3.85], [-32.418, -3.848], [-32.418, -3.85], [-32.42, -3.848], [-32.42, -3.85]]], props: props(`PE-${COD}-GRAVATA`) });
app.push({ aneis: null, props: props(`PE-${COD}-SEMFORMA`) });                                // registro nulo (descartado na leitura)
app.push({ aneis: [quadrado(10, 10, 1)], props: props(`PE-${COD}-AFRICA`) });                  // fora do Brasil
const rl = imoveis.map((m) => ({ aneis: [quadrado(m.x + m.d / 2, m.y, m.d / 2).map((c) => utm.forward(c))], props: props(m.cod) }));
const veg = imoveis.map((m) => ({ aneis: [quadrado(m.x, m.y + m.d / 2, m.d / 2), buraco(m.x + m.d / 8, m.y + m.d * 5 / 8, m.d / 8)], props: props(m.cod) }));

const externo = new JSZip();
externo.file("AREA_IMOVEL.zip", await zipTema("AREA_IMOVEL", area, PRJ_SIRGAS));
externo.file("APP.zip", await zipTema("APP", app, PRJ_SIRGAS));
externo.file("RESERVA_LEGAL.zip", await zipTema("RESERVA_LEGAL", rl, PRJ_UTM25S));
externo.file("VEGETACAO_NATIVA.zip", await zipTema("VEGETACAO_NATIVA", veg, null));
const pasta = mkdtempSync(join(tmpdir(), "car-teste-"));
const arquivo = join(pasta, `TESTE-SHAPE_${COD}.zip`);
writeFileSync(arquivo, await externo.generateAsync({ type: "nodebuffer" }));

// área esperada da APP: quadrado de d/3 graus na latitude -3,858
const APP_HA = (() => {
  const d = 0.001, lat = -3.858 * Math.PI / 180, R = 6371008.8;
  return (d * Math.PI / 180 * R * Math.cos(lat)) * (d * Math.PI / 180 * R) / 10000;
})();

// ---------------------------------------------------------------------------
// Teste
// ---------------------------------------------------------------------------
async function limpar() {
  const { data } = await admin.from("car_importacoes").select("id").eq("cod_ibge", COD).like("arquivo_nome", "TESTE-%");
  for (const i of data ?? []) await admin.from("car_importacoes").delete().eq("id", i.id);
  const { count } = await admin.from("car_importacoes").select("id", { count: "exact", head: true }).eq("cod_ibge", COD);
  if (!count) await admin.from("car_cobertura").delete().eq("cod_ibge", COD);
  await admin.from("consultas_area").delete().eq("fonte_id", "car_ambiental");
}

const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--no-sandbox"],
});
try {
  await limpar();
  const p = await (await b.createBrowserContext()).newPage();
  await p.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.evaluate(async (s, e, sn) => {
    await fetch("/api/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s }) });
    await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, senha: sn }) });
  }, process.env.SITE_SENHA ?? "", "admin@arinibrasil.com.br", process.env.SEED_USER_PASSWORD);

  // anunciante não entra nas rotas
  const anon = await (await b.createBrowserContext()).newPage();
  await anon.goto(`${BASE}/acesso`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const semSessao = await anon.evaluate(async () => (await fetch("/api/admin/car/importacoes", { method: "POST", body: "{}" })).status);
  ok("sem sessão a rota recusa", [401, 403].includes(semSessao), semSessao);

  const importarPelaTela = async () => {
    await p.goto(`${BASE}/admin/car`, { waitUntil: "networkidle2", timeout: 180000 });
    const campo = await p.waitForSelector('input[type=file][accept=".zip"]');
    await campo.uploadFile(arquivo);
    await p.waitForFunction(() => /Importar \d+ polígonos/.test(document.body.innerText), { timeout: 60000 });
    const previa = await p.evaluate(() => document.body.innerText);
    return { previa, clicar: async () => {
      await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Importar \d+ polígonos/.test(x.textContent))?.click());
      await p.waitForFunction(() => /Importação concluída|Nada foi gravado|já foi importado|Não consegui/.test(document.body.innerText), { timeout: 180000 });
      return p.evaluate(() => document.body.innerText);
    } };
  };

  // 1. pré-visualização
  const t1 = await importarPelaTela();
  ok("prévia reconhece os 4 temas", ["Área do imóvel", "Área de preservação permanente (APP)", "Reserva legal", "Vegetação nativa"].every((t) => t1.previa.includes(t)));
  ok("prévia acha o município pelo código dos imóveis", /Fernando de Noronha\/PE/.test(t1.previa));
  ok("prévia lê a camada em UTM e a sem .prj", /SIRGAS_2000_UTM_Zone_25S/.test(t1.previa) && /sem \.prj/.test(t1.previa));
  ok("prévia descarta o registro sem forma", /1 descartados/.test(t1.previa));

  // 2. importa
  const fim1 = await t1.clicar();
  ok("importação concluída com falhas registradas", /Importação concluída com falhas registradas: Fernando de Noronha\/PE/.test(fim1), fim1.match(/Importação[^\n]*/)?.[0]);
  ok("APP: repetido ignorado, gravata corrigida, um recusado", /1 com geometria corrigida, 1 repetidos ignorados, 1 recusados/.test(fim1));

  const { data: imps } = await admin.from("car_importacoes").select("id, status, temas, falhas_total, data_base").eq("cod_ibge", COD).order("criado_em");
  const primeira = imps?.[0];
  ok("registro da importação", primeira?.status === "com_falhas" && primeira.falhas_total === 1, JSON.stringify(primeira?.temas));
  const { data: falha } = await admin.from("car_importacao_falhas").select("indice, motivo").eq("importacao_id", primeira.id);
  ok("falha aponta o registro do shapefile (9) e o motivo", falha?.length === 1 && falha[0].indice === 9 && /fora do Brasil/.test(falha[0].motivo), JSON.stringify(falha));

  const { data: apps } = await admin.from("car_temas").select("area_ha, cod_imovel").eq("importacao_id", primeira.id).eq("tema", "app").like("cod_imovel", "%TESTE%");
  const erroArea = Math.max(...apps.map((a) => Math.abs(Number(a.area_ha) - APP_HA) / APP_HA));
  ok("área da APP calculada certo (±1%)", apps.length === 6 && erroArea < 0.01, `${(erroArea * 100).toFixed(2)}%`);
  const { data: rls } = await admin.from("car_temas").select("area_ha").eq("importacao_id", primeira.id).eq("tema", "reserva_legal");
  ok("reserva legal em UTM chegou em graus (área ~2,8 ha)", rls.length === 6 && rls.every((r) => Number(r.area_ha) > 2 && Number(r.area_ha) < 3.5), JSON.stringify(rls.map((r) => r.area_ha)));
  const { data: veg } = await admin.rpc("fn_car_ambiental_imovel", { p_cod: imoveis[0].cod });
  const vegHa = veg?.find((t) => t.tema === "vegetacao_nativa")?.area_ha;
  ok("vegetação com buraco descontado", vegHa > 2 && vegHa < 2.8, vegHa);
  const { data: atributo } = await admin.from("car_temas").select("atributos").eq("importacao_id", primeira.id).limit(1).single();
  ok(".dbf em Latin-1 lido sem trocar acento", atributo?.atributos?.nom_munici === "Fernando de Noronha ação", atributo?.atributos?.nom_munici);

  // 3. mesmo arquivo: recusa; com "mesmo assim": nova versão, a anterior no histórico
  const t2 = await importarPelaTela();
  const fim2 = await t2.clicar();
  ok("mesmo arquivo recusado", /já foi importado para o município/.test(fim2));
  // a caixa "importar mesmo assim" aparece junto do aviso, na mesma tela
  const temCaixa = await p.evaluate(() => {
    const caixa = [...document.querySelectorAll("label")].find((l) => /mesmo assim/i.test(l.textContent))?.querySelector("input");
    caixa?.click();
    return !!caixa;
  });
  ok("aviso oferece 'importar mesmo assim'", temCaixa);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Importar \d+ polígonos/.test(x.textContent))?.click());
  await p.waitForFunction(() => /Importação concluída/.test(document.body.innerText), { timeout: 180000 }).catch(() => null);
  const fim3 = await p.evaluate(() => document.body.innerText);
  ok("com 'importar mesmo assim' vira nova versão", /Importação concluída/.test(fim3));
  const { data: imps2 } = await admin.from("car_importacoes").select("id, status").eq("cod_ibge", COD).order("criado_em");
  const nova = imps2[imps2.length - 1];
  const vig = async (id) => (await admin.from("car_temas").select("id", { count: "exact", head: true }).eq("importacao_id", id).eq("vigente", true)).count;
  const tot = async (id) => (await admin.from("car_temas").select("id", { count: "exact", head: true }).eq("importacao_id", id)).count;
  ok("versão anterior guardada e fora de uso", (await vig(primeira.id)) === 0 && (await tot(primeira.id)) > 0 && (await vig(nova.id)) > 0);

  // 4. envio interrompido: não vale e pode ser descartado; concluída não se descarta
  const api = (url, metodo, corpo) => p.evaluate(async (u, m, c) => {
    const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, url, metodo, corpo);
  const aberta = await api("/api/admin/car/importacoes", "POST", { cod_ibge: COD, arquivo_nome: "TESTE-interrompida.zip", data_base: "2026-10-22", temas: { app: 1 }, forcar: true });
  await api(`/api/admin/car/importacoes/${aberta.json.id}/lote`, "POST", { tema: "app", inicio: 0, feicoes: [{ type: "Feature", properties: { cod_imovel: imoveis[0].cod }, geometry: { type: "Polygon", coordinates: [quadrado(imoveis[0].x, imoveis[0].y, 0.0005)] } }] });
  const cob = await admin.from("car_cobertura").select("ultima_importacao").eq("cod_ibge", COD).single();
  ok("interrompida não passa a valer", cob.data.ultima_importacao === nova.id && (await vig(aberta.json.id)) === 0);
  const des = await api(`/api/admin/car/importacoes/${aberta.json.id}`, "DELETE");
  ok("descartar a interrompida apaga os polígonos dela", des.status === 200 && (await tot(aberta.json.id)) === 0);
  const des2 = await api(`/api/admin/car/importacoes/${nova.id}`, "DELETE");
  ok("concluída não se descarta (409)", des2.status === 409, des2.status);

  // 5. cobertura, painel e consulta por área
  const { data: c } = await admin.from("car_cobertura").select("temas, limite, data_base").eq("cod_ibge", COD).single();
  ok("cobertura com 4 temas e limite do IBGE", c.temas.length === 4 && !!c.limite);
  await p.goto(`${BASE}/admin/car?uf=PE&ver=importados`, { waitUntil: "networkidle2", timeout: 180000 });
  const painel = await p.evaluate(() => document.body.innerText);
  ok("painel lista o município como importado", /Fernando de Noronha[\s\S]{0,80}importado/.test(painel));
  await p.goto(`${BASE}/admin/car/${primeira.id}`, { waitUntil: "networkidle2", timeout: 180000 });
  const ficha = await p.evaluate(() => document.body.innerText);
  ok("ficha mostra a falha", /Polígonos recusados \(1\)/.test(ficha) && /fora do Brasil/.test(ficha));
  const { data: env } = await admin.rpc("fn_car_ambiental_envelope", { p_xmin: -32.44, p_ymin: -3.87, p_xmax: -32.40, p_ymax: -3.84 });
  // o retângulo pega mar em volta da ilha: a cobertura fica abaixo de 100% mesmo com tudo importado
  ok("consulta por área traz APP, RL e vegetação e a cobertura", ["app", "reserva_legal", "vegetacao_nativa"].every((t) => env.temas.some((x) => x.tema === t)) && env.cobertura_pct > 50 && env.cobertura_pct <= 100, `${env.cobertura_pct}%`);
  const { data: fora } = await admin.rpc("fn_car_ambiental_envelope", { p_xmin: -47.1, p_ymin: -22.95, p_xmax: -47.0, p_ymax: -22.85 });
  ok("fora dos municípios importados: nenhum (relatório diz 'ainda não importado')", fora.municipios.length === 0);
} finally {
  await b.close();
  await limpar();
  rmSync(pasta, { recursive: true, force: true });
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nimportação do CAR ok");
process.exit(falhas ? 1 : 0);
