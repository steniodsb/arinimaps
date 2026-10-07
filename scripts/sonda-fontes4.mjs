// Sondagem de 07/10/2026 — PENDENCIAS 3.4, 3.5, 3.9 e 3.10.
// Refaz cada pergunta feita aos órgãos e mostra o que responde HOJE, para que
// a matriz de docs/FONTES.md possa ser conferida (ou atualizada) a qualquer hora.
// Região: Iturama e entorno (-50.6,-20.0,-49.8,-19.4).
//
// Uso: node scripts/sonda-fontes4.mjs

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";
const B = "-50.6,-20.0,-49.8,-19.4";
const ESRI = "geometry=" + encodeURIComponent(JSON.stringify({ xmin: -50.6, ymin: -20.0, xmax: -49.8, ymax: -19.4, spatialReference: { wkid: 4326 } })) +
  "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json";
const PAMGIA = "https://pamgia.ibama.gov.br/server/rest/services";
const I3GEO = "https://acervofundiario.incra.gov.br/i3geo/ogc.php";
const DNIT = "https://servicos.dnit.gov.br/dnitgeo/geoserver/ows";
const IPHAN = "https://geoserver.iphan.gov.br/geoserver/ows";
const SIGEL = "https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL";
const hits = (base, camada, sufixo = ",EPSG:4326") =>
  `${base}${base.includes("?") ? "&" : "?"}service=WFS&version=1.1.0&request=GetFeature&typeName=${camada}&resultType=hits&bbox=${B}${sufixo}`;

const SONDAS = [
  // 3.4 — SIGEF / SNCI (INCRA)
  { item: "3.4", nome: "INCRA i3geo · SIGEF particular MG", url: hits(`${I3GEO}?tema=certificada_sigef_particular_mg`, "certificada_sigef_particular_mg", "") },
  { item: "3.4", nome: "INCRA i3geo · SIGEF público MG", url: hits(`${I3GEO}?tema=certificada_sigef_publico_mg`, "certificada_sigef_publico_mg", "") },
  { item: "3.4", nome: "INCRA i3geo · SNCI privado MG", url: hits(`${I3GEO}?tema=imoveiscertificados_privado_mg`, "imoveiscertificados_privado_mg", "") },
  { item: "3.4", nome: "INCRA i3geo · bbox COM sufixo EPSG (inverte eixos)", url: hits(`${I3GEO}?tema=certificada_sigef_particular_mg`, "certificada_sigef_particular_mg") },
  { item: "3.4", nome: "INCRA i3geo · lista de temas", url: `${I3GEO}?lista=temas`, timeout: 60000 },
  { item: "3.4", nome: "INCRA certificacao · geoserver", url: "https://certificacao.incra.gov.br/geoserver/ows?service=WFS&request=GetCapabilities" },
  { item: "3.4", nome: "Espelho IBAMA · SIGEF privado (parado em 2022)", url: `${PAMGIA}/01_Publicacoes_Bases/lim_imovel_sigef_privado_a/MapServer/9/query?${ESRI}` },
  // 3.4 — embargos IBAMA
  { item: "3.4", nome: "IBAMA SISCOM geoserver antigo", url: "https://siscom.ibama.gov.br/geoserver/publica/ows?service=WFS&request=GetCapabilities" },
  { item: "3.4", nome: "IBAMA ArcGIS · SISCOM/publico camada 3 (embargos)", url: `${PAMGIA}/SISCOM/publico/MapServer/3/query?${ESRI}` },
  // 3.4 — quilombolas
  { item: "3.4", nome: "IBAMA ArcGIS · quilombos INCRA", url: `${PAMGIA}/BasesSincronizadas/lim_quilombos_incra_a/MapServer/0/query?${ESRI}` },
  { item: "3.4", nome: "DNIT · vgeo:vw_incra_quilombolas", url: hits(DNIT, "vgeo:vw_incra_quilombolas") },
  // 3.4 — IPHAN
  { item: "3.4", nome: "IPHAN · SICG:tg_bem_classificacao", url: hits(IPHAN, "SICG:tg_bem_classificacao") },
  { item: "3.4", nome: "IPHAN · SICG:bem_poligono", url: hits(IPHAN, "SICG:bem_poligono") },
  { item: "3.4", nome: "IPHAN · sicg.iphan.gov.br/geoserver", url: "https://sicg.iphan.gov.br/geoserver/ows?service=WFS&request=GetCapabilities" },
  // 3.5 — camadas ambientais do CAR
  { item: "3.5", nome: "SICAR WFS · capabilities (só imóveis)", url: "https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.1.0&request=GetCapabilities" },
  { item: "3.5", nome: "SICAR WFS · sicar:sicar_app_mg", url: "https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.1.0&request=DescribeFeatureType&typeName=sicar:sicar_app_mg" },
  { item: "3.5", nome: "SICAR WFS · sicar:sicar_reserva_legal_mg", url: "https://geoserver.car.gov.br/geoserver/sicar/ows?service=WFS&version=1.1.0&request=DescribeFeatureType&typeName=sicar:sicar_reserva_legal_mg" },
  { item: "3.5", nome: "SICAR base de downloads", url: "https://consultapublica.car.gov.br/publico/estados/downloads", semRedirect: true },
  // 3.9 — rodovias
  { item: "3.9", nome: "DNIT · vgeo:vw_snv_rod (todas as versões)", url: hits(DNIT, "vgeo:vw_snv_rod") },
  { item: "3.9", nome: "DNIT · vgeo:vw_cide_rod_2021 (estaduais)", url: hits(DNIT, "vgeo:vw_cide_rod_2021") },
  { item: "3.9", nome: "IDE-Sisema (MG)", url: "https://idesisema.meioambiente.mg.gov.br/geoserver/ows?service=WFS&request=GetCapabilities" },
  // 3.10 — ANEEL / ANM
  { item: "3.10", nome: "ANEEL · Transmissão/1 (linhas, ONS)", url: `${SIGEL}/Transmiss%C3%A3o/MapServer/1/query?${ESRI}` },
  { item: "3.10", nome: "ANEEL · Transmissão/3 (subestações, ONS)", url: `${SIGEL}/Transmiss%C3%A3o/MapServer/3/query?${ESRI}` },
  { item: "3.10", nome: "ANEEL · Camadas/1 (UHE)", url: `${SIGEL}/Camadas/MapServer/1/query?${ESRI}` },
  { item: "3.10", nome: "ANM · SIGMINE dados_anm/0", url: `https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query?${ESRI}` },
];

async function sondar(s) {
  const t0 = Date.now();
  try {
    const r = await fetch(s.url, {
      headers: { "User-Agent": UA }, redirect: s.semRedirect ? "manual" : "follow",
      signal: AbortSignal.timeout(s.timeout ?? 30000),
    });
    const corpo = await r.text();
    const n = corpo.match(/number(?:OfFeatures|Matched)="(\d+)"/)?.[1] ?? corpo.match(/"count"\s*:\s*(\d+)/)?.[1];
    const camadas = (corpo.match(/<(?:wfs:)?FeatureType[\s>]/g) ?? []).length;
    const detalhe = n != null ? `${n} feições na região`
      : camadas ? `${camadas} camadas publicadas`
      : r.status >= 300 && r.status < 400 ? `redireciona para ${r.headers.get("location")}`
      : /Exception/.test(corpo) ? "exceção do serviço (camada inexistente)"
      : corpo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
    return { ...s, status: r.status, ms: Date.now() - t0, detalhe };
  } catch (e) {
    return { ...s, status: 0, ms: Date.now() - t0, detalhe: e.name === "TimeoutError" ? "sem resposta (timeout)" : (e.cause?.code ?? e.message) };
  }
}

const resultados = await Promise.all(SONDAS.map(sondar));
console.log("ITEM".padEnd(5), "FONTE".padEnd(52), "HTTP".padEnd(5), "TEMPO".padStart(7), " RESULTADO");
console.log("-".repeat(120));
for (const r of resultados) {
  console.log(r.item.padEnd(5), r.nome.padEnd(52), String(r.status || "—").padEnd(5), `${(r.ms / 1000).toFixed(1)}s`.padStart(7), "", r.detalhe);
}
