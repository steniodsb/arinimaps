import "server-only";

/**
 * Sentinel-2 pelo Copernicus Data Space Ecosystem (CDSE), roadmap 3.8 e item 5
 * do levantamento do Carlos (22/10/2026): escolher a cena pela data e pela
 * nuvem, ver em cor real ou NDVI e medir a vegetação de uma área.
 *
 * Duas portas, com regras diferentes:
 *   · catálogo STAC (stac.dataspace.copernicus.eu) — ABERTO, sem conta: lista
 *     as cenas com data e cobertura de nuvem;
 *   · Sentinel Hub (sh.dataspace.copernicus.eu) — imagem e estatística, com
 *     conta gratuita e cliente OAuth (COPERNICUS_CLIENT_ID/SECRET). Cota
 *     grátis: 10.000 unidades de processamento por mês e 300 pedidos/min
 *     (documentation.dataspace.copernicus.eu/Quotas.html, 22/10/2026).
 *
 * Licença: dados Copernicus Sentinel são livres, inclusive para uso
 * comercial, com a atribuição "Contém dados Copernicus Sentinel modificados".
 * É o que destrava o Sentinel no relatório pago — o mosaico da EOX de 2018 em
 * diante é CC BY-NC-SA.
 */

const STAC = "https://stac.dataspace.copernicus.eu/v1/search";
const SH = "https://sh.dataspace.copernicus.eu";
const TOKEN = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const UA = "AriniImoveisBrasil/1.0 (contato@arinibrasil.com.br)";
export const ATRIBUICAO_COPERNICUS = "Contém dados Copernicus Sentinel modificados (Copernicus Data Space Ecosystem)";

export type Bbox4 = [number, number, number, number];
export type Cena = { id: string; data: string; nuvem: number; satelite: string; quadricula: string };
export type TipoImagem = "cor" | "ndvi";

/** A conta do Copernicus está configurada? Sem ela, só a busca de cenas funciona. */
export const processamentoLigado = () => !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET);

export class SemContaCopernicus extends Error {
  constructor() { super("conta do Copernicus Data Space ainda não configurada (COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET)"); }
}

// ---------------------------------------------------------------------------
// Catálogo (aberto)
// ---------------------------------------------------------------------------

/**
 * Cenas Sentinel-2 L2A que cobrem o envelope, da mais recente para a mais
 * antiga. A nuvem é a da quadrícula inteira (~110 km), não só da área: uma
 * cena "40%" pode estar limpa no ponto que interessa — por isso o filtro é
 * escolha da pessoa, não regra fixa.
 */
export async function buscarCenas(bbox: Bbox4, o: { de: string; ate: string; nuvemMax: number; limite?: number }): Promise<Cena[]> {
  const r = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      bbox,
      datetime: `${o.de}T00:00:00Z/${o.ate}T23:59:59Z`,
      filter: { op: "<=", args: [{ property: "eo:cloud_cover" }, o.nuvemMax] },
      "filter-lang": "cql2-json",
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      limit: Math.min(o.limite ?? 40, 100),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`catálogo do Copernicus respondeu ${r.status}`);
  const j = await r.json() as { features?: { id: string; properties: Record<string, unknown> }[] };
  // a mesma passagem aparece uma vez por quadrícula: na divisa de quadrícula, fica a de menos nuvem
  const porDia = new Map<string, Cena>();
  for (const f of j.features ?? []) {
    const data = String(f.properties.datetime).slice(0, 10);
    const cena: Cena = {
      id: f.id, data,
      nuvem: Math.round(Number(f.properties["eo:cloud_cover"] ?? 0) * 10) / 10,
      satelite: String(f.properties.platform ?? f.id.slice(0, 3)).replace(/^sentinel-/i, "Sentinel-").toUpperCase().replace("SENTINEL", "Sentinel"),
      quadricula: String(f.properties["grid:code"] ?? f.id.split("_")[5] ?? "").replace(/^MGRS-/, ""),
    };
    const ja = porDia.get(data);
    if (!ja || cena.nuvem < ja.nuvem) porDia.set(data, cena);
  }
  return [...porDia.values()].sort((a, b) => b.data.localeCompare(a.data));
}

// ---------------------------------------------------------------------------
// Sentinel Hub (com conta)
// ---------------------------------------------------------------------------

let token: { valor: string; vence: number } | null = null;
let pedindo: Promise<string> | null = null;

async function obterToken(): Promise<string> {
  if (!processamentoLigado()) throw new SemContaCopernicus();
  if (token && Date.now() < token.vence) return token.valor;
  pedindo ??= (async () => {
    try {
      const r = await fetch(TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.COPERNICUS_CLIENT_ID!,
          client_secret: process.env.COPERNICUS_CLIENT_SECRET!,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
      if (!r.ok || !j.access_token) throw new Error(`login no Copernicus recusado: ${j.error_description ?? r.status}`);
      // renova um minuto antes de vencer
      token = { valor: j.access_token, vence: Date.now() + Math.max(60, (j.expires_in ?? 600) - 60) * 1000 };
      return token.valor;
    } finally {
      pedindo = null;
    }
  })();
  return pedindo;
}

async function sh(caminho: string, corpo: unknown, aceitar: string) {
  const t = await obterToken();
  const r = await fetch(`${SH}${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Accept: aceitar, "User-Agent": UA },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(45_000),
  });
  if (r.status === 401) token = null;
  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    const motivo = (() => { try { return JSON.parse(texto)?.error?.message as string; } catch { return ""; } })();
    throw new Error(`Sentinel Hub respondeu ${r.status}${motivo ? `: ${motivo}` : ""}`);
  }
  return r;
}

const dia = (data: string) => ({ from: `${data}T00:00:00Z`, to: `${data}T23:59:59Z` });

/**
 * Nuvem e sombra pela classificação da própria cena (SCL do L2A): 3 sombra,
 * 8 e 9 nuvem, 10 cirro. Esses pixels saem transparentes na imagem e não
 * entram na conta do NDVI.
 */
const NUVEM_SCL = "[3, 8, 9, 10]";

const EVAL_COR = `//VERSION=3
function setup() { return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 4 } }; }
function evaluatePixel(s) { return [2.6 * s.B04, 2.6 * s.B03, 2.6 * s.B02, s.dataMask]; }`;

// faixas do NDVI (as mesmas da legenda do mapa e do relatório)
export const FAIXAS_NDVI = [
  { ate: 0, nome: "água ou sem vegetação", cor: "#3B6E8F" },
  { ate: 0.2, nome: "solo exposto", cor: "#B5835A" },
  { ate: 0.4, nome: "vegetação baixa", cor: "#E2C65B" },
  { ate: 0.6, nome: "vegetação moderada", cor: "#8BC34A" },
  { ate: 1, nome: "vegetação densa", cor: "#1E7A3A" },
] as const;

const EVAL_NDVI = `//VERSION=3
function setup() { return { input: ["B04", "B08", "SCL", "dataMask"], output: { bands: 4 } }; }
const nuvem = ${NUVEM_SCL};
const faixas = [${FAIXAS_NDVI.map((f) => `[${f.ate}, ${[1, 3, 5].map((i) => parseInt(f.cor.slice(i, i + 2), 16) / 255).map((v) => v.toFixed(3)).join(", ")}]`).join(", ")}];
function evaluatePixel(s) {
  if (!s.dataMask || nuvem.includes(s.SCL)) return [0.6, 0.6, 0.6, 0.25];
  const v = (s.B08 - s.B04) / (s.B08 + s.B04);
  for (const f of faixas) if (v <= f[0]) return [f[1], f[2], f[3], 1];
  return [faixas[faixas.length - 1][1], faixas[faixas.length - 1][2], faixas[faixas.length - 1][3], 1];
}`;

/** Um recorte da cena (tile do mapa, em EPSG:3857) em PNG. */
export async function imagemCena(o: { bbox3857: Bbox4; data: string; tipo: TipoImagem; px?: number }): Promise<Buffer> {
  const px = o.px ?? 256;
  const r = await sh("/api/v1/process", {
    input: {
      bounds: { bbox: o.bbox3857, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/3857" } },
      data: [{ type: "sentinel-2-l2a", dataFilter: { timeRange: dia(o.data), mosaickingOrder: "leastCC" } }],
    },
    output: { width: px, height: px, responses: [{ identifier: "default", format: { type: "image/png" } }] },
    evalscript: o.tipo === "ndvi" ? EVAL_NDVI : EVAL_COR,
  }, "image/png");
  return Buffer.from(await r.arrayBuffer());
}

export type EstatisticaNdvi = {
  data: string; media: number; pixels: number; nuvemPct: number;
  faixas: { nome: string; pct: number }[];
};

/**
 * NDVI de uma área numa cena: média e quanto da área cai em cada faixa, sem
 * os pixels de nuvem. Usa a Statistical API; a resolução cresce com a área
 * para o pedido ficar abaixo de ~1.000 × 1.000 pixels.
 */
export async function ndviDaArea(bbox: Bbox4, data: string): Promise<EstatisticaNdvi> {
  const largM = (bbox[2] - bbox[0]) * 111_320 * Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
  const altM = (bbox[3] - bbox[1]) * 110_540;
  const res = Math.max(10, Math.ceil(Math.max(largM, altM) / 1000));
  const evalscript = `//VERSION=3
function setup() { return { input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }], output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] }; }
const nuvem = ${NUVEM_SCL};
function evaluatePixel(s) {
  // pixel de nuvem/sombra vira "sem dado": fica fora da média e conta como sem leitura
  return { ndvi: [(s.B08 - s.B04) / (s.B08 + s.B04)], dataMask: [s.dataMask && !nuvem.includes(s.SCL) ? 1 : 0] };
}`;
  const limites = [-1, ...FAIXAS_NDVI.map((f) => f.ate)];
  const r = await sh("/api/v1/statistics", {
    input: {
      bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
      data: [{ type: "sentinel-2-l2a", dataFilter: { mosaickingOrder: "leastCC" } }],
    },
    aggregation: {
      timeRange: dia(data), aggregationInterval: { of: "P1D" },
      resx: res / 111_320, resy: res / 110_540, evalscript,
    },
    calculations: { ndvi: { histograms: { default: { bins: limites } } } },
  }, "application/json");
  const j = await r.json() as {
    data?: { outputs: Record<string, { bands: Record<string, { stats: Record<string, number>; histogram?: { bins: { lowEdge: number; highEdge: number; count: number }[] } }> }> }[];
  };
  const out = j.data?.[0]?.outputs;
  const b = out?.ndvi?.bands?.B0;
  if (!b || !Number.isFinite(b.stats.mean)) throw new Error("cena sem pixel válido na área (nuvem ou fora da passagem)");
  const validos = b.stats.sampleCount - b.stats.noDataCount;
  const bins = b.histogram?.bins ?? [];
  const total = bins.reduce((s, x) => s + x.count, 0) || 1;
  return {
    data, media: Math.round(b.stats.mean * 100) / 100, pixels: validos,
    // sem leitura = nuvem, sombra ou fora da passagem do satélite
    nuvemPct: Math.round((1000 * b.stats.noDataCount) / Math.max(1, b.stats.sampleCount)) / 10,
    faixas: FAIXAS_NDVI.map((f, i) => ({ nome: f.nome, pct: Math.round((100 * (bins[i]?.count ?? 0)) / total) })),
  };
}
