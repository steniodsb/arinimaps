import "server-only";
import { inflateSync } from "node:zlib";

/**
 * Relevo do imóvel a partir do mesmo modelo de elevação do tour 3D
 * (Terrarium, tiles PNG públicos da AWS — elevation-tiles-prod).
 *
 * Como funciona (metodologia em docs/PRE-AVALIACAO.md §3.1):
 *  1. escolhe o zoom (13 ≈ 18 m/pixel na região; cai para 12 se a área exigir
 *     mais de 16 tiles);
 *  2. sorteia uma grade regular de pontos DENTRO da divisa (até 15 × 15);
 *  3. em cada ponto mede a declividade por diferenças centrais com 2 pixels de
 *     distância para cada lado (~70 m de base no zoom 13), o que suaviza o
 *     ruído do SRTM;
 *  4. devolve média, mediana, máxima e a fração da área acima de 8 %, 12 % e
 *     20 %, além da altitude mínima/máxima.
 *
 * O Terrarium vem do SRTM (~30 m). Serve para separar relevo plano de
 * ondulado, não para projeto de terraplenagem. Falha de rede = null (a tela
 * diz "relevo indisponível"), nunca um número inventado.
 */

const URL_TILE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const MAX_TILES = 16;
const GRADE = 15;

export type Relevo = {
  zoom: number;
  resolucao_m: number;
  amostras: number;
  declividade_media_pct: number;
  declividade_mediana_pct: number;
  declividade_max_pct: number;
  fracao_acima_8: number;
  fracao_acima_12: number;
  fracao_acima_20: number;
  altitude_min_m: number;
  altitude_max_m: number;
  fonte: string;
};

type Anel = [number, number][];
type Poligonos = Anel[][];

// ------------------------------------------------------------------ PNG (RGB 8 bits)
/** Decodificador mínimo de PNG para os tiles Terrarium (RGB/RGBA, 8 bits, sem entrelaçamento). */
export function decodificarPng(buf: Buffer): { largura: number; altura: number; canais: number; px: Uint8Array } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("não é PNG");
  let pos = 8;
  let largura = 0, altura = 0, canais = 3;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const tam = buf.readUInt32BE(pos);
    const tipo = buf.toString("ascii", pos + 4, pos + 8);
    const dados = buf.subarray(pos + 8, pos + 8 + tam);
    if (tipo === "IHDR") {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      const profundidade = dados[8], cor = dados[9], entrelacado = dados[12];
      if (profundidade !== 8 || entrelacado !== 0 || (cor !== 2 && cor !== 6)) throw new Error("PNG fora do formato Terrarium");
      canais = cor === 6 ? 4 : 3;
    } else if (tipo === "IDAT") {
      idat.push(dados);
    } else if (tipo === "IEND") break;
    pos += 12 + tam;
  }
  const bruto = inflateSync(Buffer.concat(idat));
  const linha = largura * canais;
  const px = new Uint8Array(linha * altura);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (linha + 1)];
    const ini = y * (linha + 1) + 1;
    for (let x = 0; x < linha; x++) {
      const v = bruto[ini + x];
      const a = x >= canais ? px[y * linha + x - canais] : 0;
      const b = y > 0 ? px[(y - 1) * linha + x] : 0;
      const c = x >= canais && y > 0 ? px[(y - 1) * linha + x - canais] : 0;
      let r: number;
      switch (filtro) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error("filtro PNG desconhecido");
      }
      px[y * linha + x] = r & 0xff;
    }
  }
  return { largura, altura, canais, px };
}

// ------------------------------------------------------------------ geometria
function poligonosDe(g: GeoJSON.Geometry | null | undefined): Poligonos {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Anel[]];
  if (g.type === "MultiPolygon") return g.coordinates as Anel[][];
  return [];
}

function dentroDoAnel(lng: number, lat: number, anel: Anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentro(lng: number, lat: number, polis: Poligonos) {
  return polis.some(([externo, ...furos]) => dentroDoAnel(lng, lat, externo) && !furos.some((f) => dentroDoAnel(lng, lat, f)));
}

// ------------------------------------------------------------------ tiles
const pxGlobal = (lng: number, lat: number, z: number) => {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

async function baixarTile(z: number, x: number, y: number) {
  const url = URL_TILE.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "AriniMaps/1.0 (pre-avaliacao)" } });
  if (!res.ok) throw new Error(`Terrarium ${res.status}`);
  return decodificarPng(Buffer.from(await res.arrayBuffer()));
}

/** Declividade e altitude dentro da divisa. null = sem geometria ou sem acesso ao modelo de elevação. */
export async function medirRelevo(geometria: GeoJSON.Geometry | null | undefined): Promise<Relevo | null> {
  const polis = poligonosDe(geometria);
  if (!polis.length) return null;
  const pontos = polis.flatMap((p) => p[0]);
  const lngs = pontos.map((p) => p[0]), lats = pontos.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const latMedia = (s + n) / 2;

  let z = 13;
  const tilesNoZoom = (zz: number) => {
    const a = pxGlobal(w, n, zz), b = pxGlobal(e, s, zz);
    return (Math.floor((b.x + 2) / 256) - Math.floor((a.x - 2) / 256) + 1) * (Math.floor((b.y + 2) / 256) - Math.floor((a.y - 2) / 256) + 1);
  };
  while (z > 10 && tilesNoZoom(z) > MAX_TILES) z--;

  // grade de amostras dentro da divisa
  const amostras: { lng: number; lat: number }[] = [];
  for (let i = 0; i < GRADE; i++) {
    for (let j = 0; j < GRADE; j++) {
      const lng = w + ((i + 0.5) / GRADE) * (e - w);
      const lat = s + ((j + 0.5) / GRADE) * (n - s);
      if (dentro(lng, lat, polis)) amostras.push({ lng, lat });
    }
  }
  // área muito estreita para a grade: usa os vértices médios
  if (amostras.length < 4) {
    const c = { lng: (w + e) / 2, lat: (s + n) / 2 };
    amostras.push(c);
  }

  const cache = new Map<string, Promise<ReturnType<typeof decodificarPng>>>();
  const tile = (x: number, y: number) => {
    const k = `${x}/${y}`;
    if (!cache.has(k)) cache.set(k, baixarTile(z, x, y));
    return cache.get(k)!;
  };
  const elevacao = async (gx: number, gy: number) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    const t = await tile(tx, ty);
    const px = Math.min(255, Math.max(0, Math.floor(gx - tx * 256)));
    const py = Math.min(255, Math.max(0, Math.floor(gy - ty * 256)));
    const i = (py * t.largura + px) * t.canais;
    return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
  };

  const resolucao = (156543.03392 * Math.cos((latMedia * Math.PI) / 180)) / 2 ** z;
  const D = 2; // pixels para cada lado
  try {
    const medidas = await Promise.all(amostras.map(async ({ lng, lat }) => {
      const { x, y } = pxGlobal(lng, lat, z);
      const [c, l, o, nn, ss] = await Promise.all([
        elevacao(x, y), elevacao(x + D, y), elevacao(x - D, y), elevacao(x, y - D), elevacao(x, y + D),
      ]);
      const dzdx = (l - o) / (2 * D * resolucao);
      const dzdy = (ss - nn) / (2 * D * resolucao);
      return { alt: c, decl: Math.sqrt(dzdx ** 2 + dzdy ** 2) * 100 };
    }));
    const decl = medidas.map((m) => m.decl).sort((a, b) => a - b);
    const alts = medidas.map((m) => m.alt);
    const frac = (lim: number) => decl.filter((d) => d > lim).length / decl.length;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      zoom: z,
      resolucao_m: Math.round(resolucao),
      amostras: medidas.length,
      declividade_media_pct: r1(decl.reduce((a, b) => a + b, 0) / decl.length),
      declividade_mediana_pct: r1(decl[Math.floor(decl.length / 2)]),
      declividade_max_pct: r1(decl[decl.length - 1]),
      fracao_acima_8: Math.round(frac(8) * 100) / 100,
      fracao_acima_12: Math.round(frac(12) * 100) / 100,
      fracao_acima_20: Math.round(frac(20) * 100) / 100,
      altitude_min_m: Math.round(Math.min(...alts)),
      altitude_max_m: Math.round(Math.max(...alts)),
      fonte: "Modelo de elevação Terrarium (AWS Open Data, derivado do SRTM ~30 m)",
    };
  } catch (e) {
    console.error("relevo (Terrarium) falhou:", e);
    return null;
  }
}
