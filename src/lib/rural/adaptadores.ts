import "server-only";

/**
 * Adaptadores das fontes oficiais de consulta rural.
 *
 * Cada fonte tem seu próprio contrato (ArcGIS, WFS, Overpass); o resto do
 * sistema só enxerga `ResultadoFonte`. Nenhum adaptador lança: fonte fora do
 * ar vira `erro` no relatório, com a data da tentativa — o documento técnico
 * exige rastrear origem e indisponibilidade.
 */

const UA = "AriniMaps/1.0 (contato@arinimaps.com.br)";
const TIMEOUT = 30_000;

export type Bbox = { xmin: number; ymin: number; xmax: number; ymax: number; lng: number; lat: number };

export type ItemEncontrado = {
  titulo: string;
  detalhe?: string;
  extra?: Record<string, string | number | null>;
};

export type ResultadoFonte = {
  fonte_id: string;
  quantidade: number;
  incide: boolean;
  itens: ItemEncontrado[];
  erro?: string;
};

async function buscar(url: string, opcoes: RequestInit = {}) {
  const r = await fetch(url, {
    ...opcoes,
    headers: { "User-Agent": UA, Accept: "application/json", ...(opcoes.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

/** ANM/SIGMINE — processos minerários ativos. Não aceita paginação. */
export async function consultarAnm(bbox: Bbox): Promise<ResultadoFonte> {
  try {
    const geometria = encodeURIComponent(JSON.stringify({
      xmin: bbox.xmin, ymin: bbox.ymin, xmax: bbox.xmax, ymax: bbox.ymax,
      spatialReference: { wkid: 4326 },
    }));
    const url = "https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query" +
      `?f=json&geometry=${geometria}&geometryType=esriGeometryEnvelope&inSR=4326` +
      "&spatialRel=esriSpatialRelIntersects&outFields=PROCESSO,FASE,NOME,SUBS,USO,AREA_HA,ULT_EVENTO&returnGeometry=false";
    const j = await (await buscar(url)).json();
    if (j.error) throw new Error(j.error.message ?? "erro do serviço");

    const feats = (j.features ?? []) as { attributes: Record<string, string | number> }[];
    return {
      fonte_id: "anm",
      quantidade: feats.length,
      incide: feats.length > 0,
      itens: feats.slice(0, 40).map((f) => ({
        titulo: `${f.attributes.SUBS ?? "substância não informada"} — ${f.attributes.FASE ?? "fase não informada"}`,
        detalhe: String(f.attributes.NOME ?? ""),
        extra: {
          processo: String(f.attributes.PROCESSO ?? ""),
          uso: String(f.attributes.USO ?? ""),
          area_ha: Number(f.attributes.AREA_HA ?? 0),
          ultimo_evento: String(f.attributes.ULT_EVENTO ?? ""),
        },
      })),
    };
  } catch (e) {
    return { fonte_id: "anm", quantidade: 0, incide: false, itens: [], erro: msg(e) };
  }
}

/** FUNAI — terras indígenas (poligonais). */
export async function consultarFunai(bbox: Bbox): Promise<ResultadoFonte> {
  try {
    const url = "https://geoserver.funai.gov.br/geoserver/Funai/ows" +
      "?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais" +
      `&outputFormat=application/json&maxFeatures=20&bbox=${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:4326`;
    const j = await (await buscar(url)).json();
    const feats = (j.features ?? []) as { properties: Record<string, string | number> }[];
    return {
      fonte_id: "funai",
      quantidade: feats.length,
      incide: feats.length > 0,
      itens: feats.map((f) => ({
        titulo: String(f.properties.terrai_nom ?? f.properties.nome ?? "Terra indígena"),
        detalhe: String(f.properties.fase_ti ?? f.properties.modalidade ?? ""),
        extra: { etnia: String(f.properties.etnia_nome ?? ""), uf: String(f.properties.uf_sigla ?? "") },
      })),
    };
  } catch (e) {
    return { fonte_id: "funai", quantidade: 0, incide: false, itens: [], erro: msg(e) };
  }
}

/** INPE/TerraBrasilis — desmatamento PRODES no bioma Cerrado. */
export async function consultarProdes(bbox: Bbox): Promise<ResultadoFonte> {
  try {
    const url = "http://terrabrasilis.dpi.inpe.br/geoserver/ows" +
      "?service=WFS&version=1.0.0&request=GetFeature&typeName=prodes-cerrado-nb:yearly_deforestation" +
      `&outputFormat=application/json&maxFeatures=50&bbox=${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:4326`;
    const j = await (await buscar(url)).json();
    const feats = (j.features ?? []) as { properties: Record<string, string | number> }[];
    const porAno = new Map<string, number>();
    for (const f of feats) {
      const ano = String(f.properties.year ?? f.properties.ano ?? "—");
      porAno.set(ano, (porAno.get(ano) ?? 0) + Number(f.properties.area_km ?? 0));
    }
    return {
      fonte_id: "prodes_cerrado",
      quantidade: feats.length,
      incide: feats.length > 0,
      itens: [...porAno.entries()].sort().map(([ano, km2]) => ({
        titulo: `Ano ${ano}`,
        detalhe: `${(km2 * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha de supressão registrada no entorno`,
        extra: { ano, km2: Number(km2.toFixed(4)) },
      })),
    };
  } catch (e) {
    return { fonte_id: "prodes_cerrado", quantidade: 0, incide: false, itens: [], erro: msg(e) };
  }
}

const msg = (e: unknown) =>
  e instanceof Error ? (e.name === "TimeoutError" ? "serviço não respondeu a tempo" : e.message) : "falha desconhecida";
