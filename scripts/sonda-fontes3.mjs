// Terceira rodada: testa CONSULTA REAL por bbox nos endpoints que responderam,
// usando a área da Fazenda Boa Vista (Iturama/MG) com 10 km de entorno.
// Só entra no sistema o que devolver feição aqui.

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";
const T = 30_000;
// bbox ~10 km ao redor do imóvel de teste
const BB = { xmin: -50.30, ymin: -19.85, xmax: -50.05, ymax: -19.60 };

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(T) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error(`não-JSON: ${t.slice(0, 90).replace(/\s+/g, " ")}`); }
}

function wfs(base, camada, extra = "") {
  return `${base}?service=WFS&version=1.0.0&request=GetFeature&typeName=${camada}` +
    `&outputFormat=application/json&maxFeatures=10&bbox=${BB.xmin},${BB.ymin},${BB.xmax},${BB.ymax},EPSG:4326${extra}`;
}

function arcgis(base, camada) {
  const g = encodeURIComponent(JSON.stringify({ ...BB, spatialReference: { wkid: 4326 } }));
  return `${base}/${camada}/query?f=json&geometry=${g}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&resultRecordCount=10`;
}

const TESTES = [
  ["INPE focos de calor", wfs("https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows", "bdqueimadas2:focos")],
  ["INPE DETER cerrado", wfs("https://terrabrasilis.dpi.inpe.br/geoserver/ows", "deter-cerrado-nb:deter_cerrado")],
  ["INPE UCs no cerrado", wfs("https://terrabrasilis.dpi.inpe.br/geoserver/ows", "prodes-cerrado-nb:conservation_units_cerrado_biome")],
  ["INPE hidrografia cerrado", wfs("https://terrabrasilis.dpi.inpe.br/geoserver/ows", "prodes-cerrado-nb:hydrography")],
  ["ANEEL linhas de transmissão", arcgis("https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/WFS/MapServer", "0")],
  ["ANEEL portal camadas", "https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Camadas/MapServer?f=json"],
  ["ANA curso d'água", "https://www.snirh.gov.br/arcgis/rest/services/DADOSABERTOS/Curso_dÁgua/MapServer?f=json"],
  ["CAR capabilities featuretypes", "https://geoserver.car.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities"],
];

for (const [nome, url] of TESTES) {
  try {
    if (url.includes("GetCapabilities")) {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(T) });
      const t = await r.text();
      const ft = [...t.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
      console.log(`OK    ${nome.padEnd(30)} ${ft.length} Name(s): ${ft.slice(0, 10).join(", ") || "(nenhum)"}`);
      continue;
    }
    const j = await json(url);
    if (j.error) { console.log(`FALHA ${nome.padEnd(30)} ${j.error.message ?? JSON.stringify(j.error).slice(0, 80)}`); continue; }
    if (j.features) {
      const n = j.features.length;
      const props = n ? Object.keys(j.features[0].properties ?? j.features[0].attributes ?? {}) : [];
      console.log(`OK    ${nome.padEnd(30)} ${n} feição(ões) · campos: ${props.slice(0, 12).join(", ")}`);
      if (n) console.log(`        exemplo: ${JSON.stringify(j.features[0].properties ?? j.features[0].attributes).slice(0, 260)}`);
    } else if (j.layers) {
      console.log(`OK    ${nome.padEnd(30)} camadas: ${j.layers.map((l) => `${l.id}=${l.name}`).slice(0, 14).join(", ")}`);
    } else {
      console.log(`OK    ${nome.padEnd(30)} ${JSON.stringify(j).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`FALHA ${nome.padEnd(30)} ${e.message}`);
  }
}
