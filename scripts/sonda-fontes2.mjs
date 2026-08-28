// Segunda rodada de sondagem: entra nas pastas dos ArcGIS que responderam e
// testa endpoints alternativos dos órgãos que falharam na primeira rodada.
// Uso: node scripts/sonda-fontes2.mjs [secao]
//   secoes: terrabrasilis | ana | aneel | alternativos

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";
const T = 25_000;

async function pega(url, texto = false) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(T), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return texto ? r.text() : r.json();
}

async function terrabrasilis() {
  console.log("\n=== TerraBrasilis — camadas do Cerrado e DETER ===");
  const xml = await pega("https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities", true);
  const nomes = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]).filter((n) => n.includes(":"));
  for (const n of nomes.filter((n) => /cerrado|deter/i.test(n))) console.log("  ·", n);
}

async function arcgisPastas(base, nome, filtro) {
  console.log(`\n=== ${nome} — serviços relevantes ===`);
  const raiz = await pega(`${base}?f=json`);
  const pastas = raiz.folders ?? [];
  for (const p of pastas) {
    if (filtro && !filtro.test(p)) continue;
    try {
      const j = await pega(`${base}/${p}?f=json`);
      for (const s of j.services ?? []) console.log(`  · ${s.name} (${s.type})`);
    } catch (e) { console.log(`  ! ${p}: ${e.message}`); }
  }
}

const ALTERNATIVOS = [
  // INPE Programa Queimadas — a API de focos e o servidor de dados abertos
  ["queimadas focos (API)", "https://queimadas.dgi.inpe.br/api/focos?data_inicio=2026-07-01&data_fim=2026-08-01&pais=Brasil"],
  ["queimadas dataserver", "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/"],
  ["queimadas terrabrasilis wfs", "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  // ICMBio / unidades de conservação
  ["icmbio geoservicos", "https://geoservicos.icmbio.gov.br/geoserver/web/"],
  ["icmbio sisbio wfs", "http://geoservicos.icmbio.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  ["mma geoservicos", "https://geoservicos.mma.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  // IBAMA
  ["ibama geoservicos", "https://geoservicos.ibama.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  ["ibama siscom wms", "https://siscom.ibama.gov.br/geoserver/publica/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  // DNIT
  ["dnit vgeo", "https://servicos.dnit.gov.br/vgeo/api/"],
  ["dnit geoserver", "https://servicos.dnit.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  // IPHAN
  ["iphan sicg", "http://portal.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetCapabilities"],
  // CAR — capabilities cru, para ver se tem FeatureType
  ["car capabilities", "https://geoserver.car.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities"],
  // INCRA
  ["incra acervo arcgis", "https://acervofundiario.incra.gov.br/arcgis/rest/services?f=json"],
  ["incra certificacao geo", "https://certificacao.incra.gov.br/csv_shp/export_shp.py"],
];

async function alternativos() {
  console.log("\n=== endpoints alternativos ===");
  for (const [nome, url] of ALTERNATIVOS) {
    try {
      const t = await pega(url, true);
      const camadas = [...t.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]).filter((n) => n.includes(":"));
      const resumo = camadas.length
        ? `${camadas.length} camada(s): ${camadas.slice(0, 8).join(", ")}`
        : `${t.length} bytes — ${t.slice(0, 100).replace(/\s+/g, " ")}`;
      console.log(`  OK    ${nome.padEnd(28)} ${resumo}`);
    } catch (e) {
      console.log(`  FALHA ${nome.padEnd(28)} ${e.message}`);
    }
  }
}

const secao = process.argv[2];
if (!secao || secao === "terrabrasilis") await terrabrasilis().catch((e) => console.log("terrabrasilis:", e.message));
if (!secao || secao === "ana") await arcgisPastas("https://www.snirh.gov.br/arcgis/rest/services", "ANA / SNIRH", /SGI|INDE|DADOSABERTOS|SNIRH/i).catch((e) => console.log("ana:", e.message));
if (!secao || secao === "aneel") await arcgisPastas("https://sigel.aneel.gov.br/arcgis/rest/services", "ANEEL / SIGEL", /PORTAL|DadosAbertos|SGO_GEO|STD/i).catch((e) => console.log("aneel:", e.message));
if (!secao || secao === "alternativos") await alternativos();
