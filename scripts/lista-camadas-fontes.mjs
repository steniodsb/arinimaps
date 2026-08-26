// Lista as camadas publicadas em cada serviço oficial que respondeu à sondagem.
// Sem o nome exato da camada não existe consulta — este script é o mapa do tesouro.
const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";

const WFS = [
  ["SICAR / CAR", "https://geoserver.car.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities"],
  ["FUNAI", "https://geoserver.funai.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities"],
  ["TerraBrasilis (INPE)", "http://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities"],
];

const ARCGIS = [
  ["ANM / SIGMINE", "https://geo.anm.gov.br/arcgis/rest/services?f=json"],
  ["ANA / SNIRH", "https://www.snirh.gov.br/arcgis/rest/services?f=json"],
  ["ANEEL / SIGEL", "https://sigel.aneel.gov.br/arcgis/rest/services?f=json"],
];

const filtro = (process.argv[2] ?? "").toLowerCase();

for (const [nome, url] of WFS) {
  if (filtro && !nome.toLowerCase().includes(filtro)) continue;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const xml = await r.text();
    const nomes = [...xml.matchAll(/<(?:wfs:)?FeatureType[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<Title>([^<]*)<\/Title>/g)]
      .map((m) => `${m[1]}  —  ${m[2]}`);
    console.log(`\n=== ${nome} (${nomes.length} camadas) ===`);
    console.log(nomes.slice(0, 40).join("\n") || "(nenhuma camada encontrada no capabilities)");
  } catch (e) {
    console.log(`\n=== ${nome} === FALHOU: ${e.message}`);
  }
}

for (const [nome, url] of ARCGIS) {
  if (filtro && !nome.toLowerCase().includes(filtro)) continue;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    console.log(`\n=== ${nome} ===`);
    console.log("pastas:", (j.folders ?? []).join(", ") || "(nenhuma)");
    console.log("services:", (j.services ?? []).map((s) => `${s.name} [${s.type}]`).join(", ") || "(nenhum)");
  } catch (e) {
    console.log(`\n=== ${nome} === FALHOU: ${e.message}`);
  }
}
