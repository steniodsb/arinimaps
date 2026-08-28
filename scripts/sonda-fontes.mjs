// Sondagem das fontes do documento técnico: descobre QUAL mecanismo cada órgão
// realmente oferece (ArcGIS REST, WFS, API própria) antes de escrever adaptador.
// Uso: node scripts/sonda-fontes.mjs [filtro]
//
// Não presume nada: bate no endpoint, lê a resposta e diz o que achou.

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";
const TIMEOUT = 25_000;

const ALVOS = [
  // --- fundiário / ambiental (prioridade 1-4 do documento) ---
  { id: "car_geoserver", org: "CAR/SICAR", tipo: "wfs", url: "https://geoserver.car.gov.br/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities" },
  { id: "car_arcgis", org: "CAR/SICAR", tipo: "arcgis", url: "https://geoserver.car.gov.br/arcgis/rest/services?f=json" },
  { id: "incra_acervo_wfs", org: "INCRA acervo fundiário", tipo: "wfs", url: "https://acervofundiario.incra.gov.br/i3geo/ogc.php?service=WFS&version=1.0.0&request=GetCapabilities" },
  { id: "incra_certificacao", org: "INCRA certificação", tipo: "arcgis", url: "https://certificacao.incra.gov.br/arcgis/rest/services?f=json" },
  { id: "sigef_geo", org: "INCRA SIGEF", tipo: "http", url: "https://sigef.incra.gov.br/" },
  { id: "ibama_geoserver", org: "IBAMA", tipo: "wfs", url: "https://siscom.ibama.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities" },
  { id: "ibama_arcgis", org: "IBAMA", tipo: "arcgis", url: "https://siscom.ibama.gov.br/arcgis/rest/services?f=json" },
  { id: "ibama_dados_abertos", org: "IBAMA dados abertos", tipo: "http", url: "https://dadosabertos.ibama.gov.br/dados/SICAFI/BR/embargo/Consulta.json" },

  // --- queimadas / desmatamento ---
  { id: "queimadas_api", org: "INPE Queimadas", tipo: "http", url: "https://queimadas.dgi.inpe.br/queimadas/dados-abertos/" },
  { id: "queimadas_geoserver", org: "INPE Queimadas", tipo: "wfs", url: "https://queimadas.dgi.inpe.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities" },
  { id: "terrabrasilis", org: "INPE TerraBrasilis", tipo: "wfs", url: "https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities" },

  // --- unidades de conservação ---
  { id: "icmbio_geoserver", org: "ICMBio", tipo: "wfs", url: "https://geoservicos.icmbio.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities" },
  { id: "mma_i3geo", org: "MMA / CNUC", tipo: "wfs", url: "http://mapas.mma.gov.br/i3geo/ogc.php?service=WFS&version=1.0.0&request=GetCapabilities" },

  // --- hídrico / energia / patrimônio / rodovias ---
  { id: "ana_arcgis", org: "ANA / SNIRH", tipo: "arcgis", url: "https://www.snirh.gov.br/arcgis/rest/services?f=json" },
  { id: "aneel_arcgis", org: "ANEEL / SIGEL", tipo: "arcgis", url: "https://sigel.aneel.gov.br/arcgis/rest/services?f=json" },
  { id: "iphan_geoserver", org: "IPHAN", tipo: "wfs", url: "http://portal.iphan.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities" },
  { id: "dnit_arcgis", org: "DNIT", tipo: "arcgis", url: "https://servicos.dnit.gov.br/arcgis/rest/services?f=json" },
  { id: "epe_arcgis", org: "EPE", tipo: "arcgis", url: "https://gisepeprd2.epe.gov.br/arcgis/rest/services?f=json" },
];

async function sonda(a) {
  const t0 = Date.now();
  try {
    const r = await fetch(a.url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    const ms = Date.now() - t0;
    if (!r.ok) return { ...a, ok: false, detalhe: `HTTP ${r.status}`, ms };
    const txt = await r.text();

    if (a.tipo === "arcgis") {
      let j;
      try { j = JSON.parse(txt); } catch { return { ...a, ok: false, detalhe: "resposta não é JSON", ms }; }
      if (j.error) return { ...a, ok: false, detalhe: `erro do serviço: ${j.error.message ?? ""}`, ms };
      const pastas = j.folders ?? [];
      const servicos = (j.services ?? []).map((s) => s.name);
      return { ...a, ok: true, ms, detalhe: `${pastas.length} pasta(s), ${servicos.length} serviço(s)`, itens: [...pastas, ...servicos].slice(0, 25) };
    }

    if (a.tipo === "wfs") {
      const nomes = [...txt.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1]);
      const camadas = nomes.filter((n) => n.includes(":") || nomes.length < 40);
      if (!camadas.length) {
        const ex = txt.match(/<ows:ExceptionText>([^<]+)/)?.[1] ?? txt.slice(0, 120).replace(/\s+/g, " ");
        return { ...a, ok: false, detalhe: `capabilities sem camadas — ${ex}`, ms };
      }
      return { ...a, ok: true, ms, detalhe: `${camadas.length} camada(s)`, itens: camadas.slice(0, 25) };
    }

    return { ...a, ok: true, ms, detalhe: `${txt.length} bytes`, itens: [] };
  } catch (e) {
    return { ...a, ok: false, ms: Date.now() - t0, detalhe: e?.name === "TimeoutError" ? "timeout" : String(e.message ?? e).slice(0, 90) };
  }
}

const filtro = process.argv[2];
const lista = filtro ? ALVOS.filter((a) => a.id.includes(filtro) || a.org.toLowerCase().includes(filtro.toLowerCase())) : ALVOS;

const res = await Promise.all(lista.map(sonda));
for (const r of res) {
  console.log(`${r.ok ? "OK  " : "FALHA"} ${r.id.padEnd(22)} ${String(r.ms).padStart(6)}ms  ${r.org} — ${r.detalhe}`);
  if (r.ok && r.itens?.length) for (const i of r.itens) console.log(`        · ${i}`);
}
console.log(`\n${res.filter((r) => r.ok).length}/${res.length} responderam.`);
