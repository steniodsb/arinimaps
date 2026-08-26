// Sonda as fontes oficiais do módulo de Consulta Rural.
// Objetivo: descobrir o que responde HOJE, antes de escrever adaptador.
// Uso: node scripts/testa-apis-rurais.mjs

const FONTES = [
  { nome: "SICAR / CAR (WFS)", prio: 1, url: "https://geoserver.car.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "SICAR / CAR (site)", prio: 1, url: "https://consultapublica.car.gov.br/publico/imoveis/index" },
  { nome: "INCRA acervo fundiário (WFS)", prio: 2, url: "https://acervofundiario.incra.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "INCRA certificação SIGEF", prio: 2, url: "https://certificacao.incra.gov.br/csv_shp/export_shp.py" },
  { nome: "IBAMA SISCOM (WFS)", prio: 4, url: "https://siscom.ibama.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "INPE Queimadas (dados abertos)", prio: 5, url: "https://queimadas.dgi.inpe.br/queimadas/dados-abertos/" },
  { nome: "INPE TerraBrasilis (WFS PRODES/DETER)", prio: 5, url: "http://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "MapBiomas (WMS)", prio: 6, url: "https://brasil.mapbiomas.org/" },
  { nome: "ANM SIGMINE (ArcGIS REST)", prio: 7, url: "https://geo.anm.gov.br/arcgis/rest/services?f=json" },
  { nome: "FUNAI (WFS)", prio: 8, url: "https://geoserver.funai.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "ICMBio (WFS)", prio: 9, url: "https://mapas.icmbio.gov.br/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { nome: "IBGE malhas (já em uso)", prio: 9, url: "https://servicodados.ibge.gov.br/api/v1/localidades/estados/MG/municipios" },
  { nome: "INDE / geoservicos IBGE (WMS)", prio: 9, url: "https://geoservicos.ibge.gov.br/geoserver/ows?service=WMS&request=GetCapabilities" },
  { nome: "ANA SNIRH (ArcGIS REST)", prio: 10, url: "https://www.snirh.gov.br/arcgis/rest/services?f=json" },
  { nome: "ANEEL SIGEL (ArcGIS REST)", prio: 10, url: "https://sigel.aneel.gov.br/arcgis/rest/services?f=json" },
  { nome: "DNIT VGeo (ArcGIS REST)", prio: 10, url: "https://servicos.dnit.gov.br/vgeo/api/publico/rotas" },
  { nome: "Overpass / OSM (já em uso)", prio: 10, url: "https://overpass-api.de/api/status" },
];

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";

async function sonda(f) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(f.url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    const texto = await r.text();
    const ms = Date.now() - t0;
    const ct = (r.headers.get("content-type") ?? "").split(";")[0];

    // em GetCapabilities, conta as camadas publicadas
    let extra = "";
    const camadas = texto.match(/<(?:wfs:)?FeatureType>|<Layer[ >]/g);
    if (camadas) extra = ` · ~${camadas.length} camadas`;
    else if (ct.includes("json")) {
      try {
        const j = JSON.parse(texto);
        if (Array.isArray(j)) extra = ` · ${j.length} itens`;
        else if (j.services) extra = ` · ${j.services.length} services / ${(j.folders ?? []).length} pastas`;
      } catch { /* ignora */ }
    }
    return { ...f, ok: r.ok, status: r.status, ms, ct, extra, tamanho: texto.length };
  } catch (e) {
    return { ...f, ok: false, status: 0, ms: Date.now() - t0, erro: e.name === "AbortError" ? "timeout 25s" : e.message };
  }
}

const resultados = await Promise.all(FONTES.map(sonda));
resultados.sort((a, b) => a.prio - b.prio);

console.log("FONTE".padEnd(38), "STATUS".padEnd(8), "TEMPO".padEnd(8), "DETALHE");
console.log("-".repeat(100));
for (const r of resultados) {
  const status = r.ok ? `${r.status} OK` : r.erro ? "FALHOU" : `${r.status}`;
  const detalhe = r.erro ? r.erro : `${r.ct}${r.extra} (${(r.tamanho / 1024).toFixed(0)}KB)`;
  console.log(r.nome.padEnd(38), status.padEnd(8), `${r.ms}ms`.padEnd(8), detalhe);
}
