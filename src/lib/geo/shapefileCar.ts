import JSZip from "jszip";
import proj4 from "proj4";
import type { TemaCar } from "./temasCar";

/**
 * Leitura do arquivo baixado da base de downloads do SICAR, no navegador.
 *
 * O SICAR entrega um zip por município (às vezes com outros zips dentro, um
 * por tema) com shapefiles: AREA_IMOVEL, APP, RESERVA_LEGAL,
 * VEGETACAO_NATIVA, AREA_CONSOLIDADA, USO_RESTRITO… Ler aqui, e não no
 * servidor, evita subir dezenas de MB de uma vez: o servidor recebe só GeoJSON
 * em graus, em lotes pequenos (PENDENCIAS 3.5, pedido do Carlos 22/10/2026).
 *
 * Sem dependência nova: shapefile de polígono é um formato simples (ESRI,
 * jul/1998) e o .dbf é dBASE III. A reprojeção usa o .prj com o proj4; sem
 * .prj, vale SIRGAS 2000 em graus, que é o que o SICAR publica.
 */

export { TEMAS_CAR, type TemaCar } from "./temasCar";

export type FeicaoCar = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, string | number | null>>;

export type CamadaLida = {
  /** caminho dentro do zip, sem extensão */
  nome: string;
  tema: TemaCar | null;
  feicoes: FeicaoCar[];
  /** feições que nem chegam a ir para o servidor (sem forma, tipo errado) */
  descartadas: { indice: number; motivo: string }[];
  semPrj: boolean;
  projecao: string;
};

export type ArquivoLido = {
  camadas: CamadaLida[];
  /** município que aparece no código dos imóveis (MG-3134400-…), pelo mais frequente */
  codIbge: number | null;
  uf: string | null;
  /** quantos imóveis apontam para outro município */
  outrosMunicipios: number;
  avisos: string[];
};

/** Nome do arquivo → tema. A ordem importa: "AREA_CONSOLIDADA" não pode virar "área do imóvel". */
export function temaDoNome(nome: string): TemaCar | null {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const partes = n.split(/[^A-Z0-9]+/).filter(Boolean);
  if (n.includes("RESERVA_LEGAL") || n.includes("RESERVA LEGAL") || partes.includes("RL")) return "reserva_legal";
  if (partes.includes("APP") || partes.includes("APPS") || n.includes("PRESERVACAO_PERMANENTE")) return "app";
  if (n.includes("VEGETACAO_NATIVA") || n.includes("REMANESCENTE")) return "vegetacao_nativa";
  if (n.includes("CONSOLIDADA")) return "area_consolidada";
  if (n.includes("USO_RESTRITO")) return "uso_restrito";
  if (n.includes("SERVIDAO")) return "servidao_administrativa";
  if (n.includes("HIDROGRAFIA")) return "hidrografia";
  if (n.includes("POUSIO")) return "area_pousio";
  if (n.includes("AREA_IMOVEL") || n.includes("AREA_DO_IMOVEL") || partes.includes("IMOVEL") || partes.includes("IMOVEIS")) return "area_imovel";
  return null;
}

// ---------------------------------------------------------------------------
// Zip (com zips dentro)
// ---------------------------------------------------------------------------

type Partes = { shp?: ArrayBuffer; dbf?: ArrayBuffer; prj?: string; cpg?: string };

async function abrirZip(dados: ArrayBuffer | Blob, prefixo: string, grupos: Map<string, Partes>, profundidade = 0) {
  const zip = await JSZip.loadAsync(dados);
  for (const entrada of Object.values(zip.files)) {
    if (entrada.dir || /(^|\/)(__MACOSX|\.)/.test(entrada.name)) continue;
    const ext = entrada.name.split(".").pop()?.toLowerCase();
    const base = (prefixo ? `${prefixo}/` : "") + entrada.name.replace(/\.[^./]+$/, "");
    if (ext === "zip" && profundidade < 3) {
      await abrirZip(await entrada.async("arraybuffer"), base, grupos, profundidade + 1);
      continue;
    }
    if (!ext || !["shp", "dbf", "prj", "cpg"].includes(ext)) continue;
    const g = grupos.get(base) ?? {};
    if (ext === "shp") g.shp = await entrada.async("arraybuffer");
    if (ext === "dbf") g.dbf = await entrada.async("arraybuffer");
    if (ext === "prj") g.prj = await entrada.async("string");
    if (ext === "cpg") g.cpg = (await entrada.async("string")).trim();
    grupos.set(base, g);
  }
}

// ---------------------------------------------------------------------------
// .dbf
// ---------------------------------------------------------------------------

function decodificador(cpg: string | undefined) {
  const c = (cpg ?? "").toUpperCase();
  if (/1252|LATIN|8859/.test(c)) return new TextDecoder("windows-1252");
  return null; // decide pelo conteúdo
}

export function lerDbf(buf: ArrayBuffer, cpg?: string): Record<string, string | number | null>[] {
  const v = new DataView(buf);
  const total = v.getUint32(4, true);
  const tamCabecalho = v.getUint16(8, true);
  const tamRegistro = v.getUint16(10, true);
  const bytes = new Uint8Array(buf);
  const campos: { nome: string; tipo: string; tam: number }[] = [];
  for (let p = 32; p < tamCabecalho - 1 && bytes[p] !== 0x0d; p += 32) {
    let nome = "";
    for (let k = 0; k < 11 && bytes[p + k]; k++) nome += String.fromCharCode(bytes[p + k]);
    campos.push({ nome: nome.trim(), tipo: String.fromCharCode(bytes[p + 11]), tam: bytes[p + 16] });
  }
  let dec = decodificador(cpg);
  if (!dec) {
    // UTF-8 se o arquivo inteiro decodifica sem erro; senão Windows-1252 (padrão dos .dbf brasileiros antigos)
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(tamCabecalho)); dec = new TextDecoder("utf-8"); }
    catch { dec = new TextDecoder("windows-1252"); }
  }
  const linhas: Record<string, string | number | null>[] = [];
  for (let r = 0; r < total; r++) {
    const inicio = tamCabecalho + r * tamRegistro;
    if (inicio + tamRegistro > bytes.length) break;
    const linha: Record<string, string | number | null> = {};
    let p = inicio + 1; // 1º byte: marca de apagado
    for (const c of campos) {
      const bruto = dec.decode(bytes.subarray(p, p + c.tam)).replace(/\0/g, "").trim();
      p += c.tam;
      if (c.tipo === "N" || c.tipo === "F") {
        const n = Number(bruto.replace(",", "."));
        linha[c.nome] = bruto === "" || !Number.isFinite(n) ? null : n;
      } else {
        linha[c.nome] = bruto === "" ? null : bruto;
      }
    }
    linhas.push(linha);
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// .shp (polígonos)
// ---------------------------------------------------------------------------

type Anel = [number, number][];

/** Área com sinal (fórmula do laço): negativa = sentido horário = anel externo no shapefile. */
function areaComSinal(a: Anel) {
  let s = 0;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) s += (a[j][0] - a[i][0]) * (a[j][1] + a[i][1]);
  return s / 2; // > 0 horário
}

function pontoNoAnel([x, y]: [number, number], anel: Anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Anéis de um registro → polígonos: externos no sentido horário, buracos no anti-horário. */
function montarPoligonos(aneis: Anel[]): Anel[][] {
  const externos: Anel[][] = [];
  const buracos: Anel[] = [];
  for (const a of aneis) {
    if (a.length < 4) continue;
    if (areaComSinal(a) >= 0) externos.push([a]); else buracos.push(a);
  }
  for (const b of buracos) {
    const dono = externos.find((p) => pontoNoAnel(b[0], p[0]));
    if (dono) dono.push(b);
    else externos.push([b.slice().reverse()]); // buraco sem dono: arquivo com orientação trocada
  }
  return externos;
}

export function lerShp(buf: ArrayBuffer): ({ aneis: Anel[] } | { erro: string })[] {
  const v = new DataView(buf);
  if (v.getInt32(0, false) !== 9994) throw new Error("o .shp não é um shapefile válido");
  const fim = v.getInt32(24, false) * 2;
  const registros: ({ aneis: Anel[] } | { erro: string })[] = [];
  let p = 100;
  while (p + 8 <= Math.min(fim, buf.byteLength)) {
    const tam = v.getInt32(p + 4, false) * 2;
    const c = p + 8;
    p = c + tam;
    if (c + 4 > buf.byteLength) break;
    const tipo = v.getInt32(c, true);
    if (tipo === 0) { registros.push({ erro: "registro sem forma" }); continue; }
    if (![5, 15, 25].includes(tipo)) { registros.push({ erro: `forma do tipo ${tipo} (esperado polígono)` }); continue; }
    const nPartes = v.getInt32(c + 36, true);
    const nPontos = v.getInt32(c + 40, true);
    const inicioPontos = c + 44 + nPartes * 4;
    if (inicioPontos + nPontos * 16 > buf.byteLength) { registros.push({ erro: "registro cortado no fim do arquivo" }); break; }
    const partes: number[] = [];
    for (let k = 0; k < nPartes; k++) partes.push(v.getInt32(c + 44 + k * 4, true));
    partes.push(nPontos);
    const aneis: Anel[] = [];
    for (let k = 0; k < nPartes; k++) {
      const anel: Anel = [];
      for (let q = partes[k]; q < partes[k + 1]; q++) {
        anel.push([v.getFloat64(inicioPontos + q * 16, true), v.getFloat64(inicioPontos + q * 16 + 8, true)]);
      }
      aneis.push(anel);
    }
    registros.push({ aneis });
  }
  return registros;
}

// ---------------------------------------------------------------------------
// Projeção e campos
// ---------------------------------------------------------------------------

const arred = (n: number) => Math.round(n * 1e7) / 1e7;

/** Função que leva a coordenada do arquivo para graus (WGS84 ≈ SIRGAS 2000). */
function conversor(prj: string | undefined): { fn: (c: [number, number]) => [number, number]; nome: string } {
  const wkt = (prj ?? "").trim();
  if (!wkt) return { fn: (c) => [arred(c[0]), arred(c[1])], nome: "sem .prj (lido como SIRGAS 2000 em graus)" };
  const nome = wkt.match(/^\w+\["([^"]+)"/)?.[1] ?? "desconhecida";
  // geográfica (SIRGAS 2000, WGS 84): já está em graus; a diferença entre os dois é de centímetros
  if (/^GEOGCS/i.test(wkt)) return { fn: (c) => [arred(c[0]), arred(c[1])], nome };
  const p = proj4(wkt, "EPSG:4326");
  return { fn: (c) => { const [x, y] = p.forward(c); return [arred(x), arred(y)]; }, nome };
}

/** Procura um campo sem diferenciar maiúsculas e aceitando nomes cortados em 10 letras pelo dBASE. */
function campo(props: Record<string, string | number | null>, ...nomes: string[]) {
  const chaves = Object.keys(props);
  for (const n of nomes) {
    const k = chaves.find((c) => c.toLowerCase() === n.toLowerCase());
    if (k && props[k] != null && props[k] !== "") return props[k];
  }
  return null;
}

/** Atributos que valem a pena guardar, com os nomes do SICAR em minúsculas. */
function atributos(props: Record<string, string | number | null>) {
  const saida: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(props)) {
    const chave = k.toLowerCase();
    if (["cod_imovel", "num_area", "area_ha", "area"].includes(chave)) continue;
    if (typeof v === "string" && v.length > 200) continue;
    saida[chave] = v;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export async function lerArquivoSicar(arquivos: File[]): Promise<ArquivoLido> {
  const grupos = new Map<string, Partes>();
  const avisos: string[] = [];
  for (const a of arquivos) {
    if (/\.zip$/i.test(a.name)) await abrirZip(a, a.name.replace(/\.zip$/i, ""), grupos);
    else avisos.push(`${a.name}: só arquivos .zip do SICAR são lidos.`);
  }

  const camadas: CamadaLida[] = [];
  // município → imóveis distintos (o mesmo imóvel aparece em várias camadas)
  const contagemMunicipio = new Map<string, Set<string>>();
  for (const [nome, g] of grupos) {
    if (!g.shp) { if (g.dbf) avisos.push(`${nome}: tem .dbf mas falta o .shp — camada ignorada.`); continue; }
    if (!g.dbf) { avisos.push(`${nome}: falta o .dbf (atributos) — camada ignorada.`); continue; }
    // o tema vem do nome do próprio shapefile; se for genérico, do zip em que ele estava
    const tema = temaDoNome(nome.split("/").pop() ?? nome) ?? temaDoNome(nome);
    const formas = lerShp(g.shp);
    const linhas = lerDbf(g.dbf, g.cpg);
    const { fn, nome: projecao } = conversor(g.prj);
    const camada: CamadaLida = { nome, tema, feicoes: [], descartadas: [], semPrj: !g.prj, projecao };
    if (!tema) avisos.push(`${nome}: não reconheci o tema pelo nome — camada não será importada.`);
    if (formas.length !== linhas.length) {
      avisos.push(`${nome}: ${formas.length} formas e ${linhas.length} linhas de atributos — arquivo incompleto; as sobras foram descartadas.`);
    }
    formas.forEach((forma, i) => {
      if ("erro" in forma) { camada.descartadas.push({ indice: i, motivo: forma.erro }); return; }
      const props = linhas[i] ?? {};
      let poligonos: Anel[][];
      try {
        poligonos = montarPoligonos(forma.aneis.map((a) => a.map(fn)));
      } catch {
        camada.descartadas.push({ indice: i, motivo: "não consegui converter as coordenadas" });
        return;
      }
      if (!poligonos.length) { camada.descartadas.push({ indice: i, motivo: "polígono com menos de 3 vértices" }); return; }
      const cod = campo(props, "cod_imovel", "codigo_imovel", "cod_car");
      const area = campo(props, "num_area", "area_ha", "area");
      if (typeof cod === "string") {
        const m = cod.match(/^([A-Z]{2})-(\d{7})-/);
        if (m) {
          const chave = `${m[1]}|${m[2]}`;
          contagemMunicipio.set(chave, (contagemMunicipio.get(chave) ?? new Set()).add(cod));
        }
      }
      camada.feicoes.push({
        type: "Feature",
        geometry: poligonos.length === 1
          ? { type: "Polygon", coordinates: poligonos[0] }
          : { type: "MultiPolygon", coordinates: poligonos },
        properties: {
          // registro do shapefile (do zero), para a falha apontar a linha certa do arquivo
          _registro: i,
          cod_imovel: cod == null ? null : String(cod),
          area_declarada_ha: typeof area === "number" ? area : null,
          ...atributos(props),
        },
      });
    });
    camadas.push(camada);
  }

  if (!camadas.length) avisos.unshift("Nenhum shapefile encontrado no arquivo. Confira se é o zip baixado da base de downloads do SICAR.");
  const ordenado = [...contagemMunicipio.entries()].map(([k, v]) => [k, v.size] as const).sort((a, b) => b[1] - a[1]);
  const [ufMaior, codMaior] = ordenado[0]?.[0].split("|") ?? [null, null];
  const outrosMunicipios = ordenado.slice(1).reduce((s, [, n]) => s + n, 0);
  return { camadas, codIbge: codMaior ? Number(codMaior) : null, uf: ufMaior ?? null, outrosMunicipios, avisos };
}

/** SHA-256 do(s) arquivo(s), para reconhecer o mesmo download subido duas vezes. */
export async function hashArquivos(arquivos: File[]) {
  const partes = await Promise.all(arquivos.map(async (a) => new Uint8Array(await crypto.subtle.digest("SHA-256", await a.arrayBuffer()))));
  const junto = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { junto.set(p, o); o += p.length; }
  const final = partes.length === 1 ? partes[0] : new Uint8Array(await crypto.subtle.digest("SHA-256", junto));
  return [...final].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Lotes para envio: no máximo `max` feições e ~1,5 MB de JSON cada — abaixo do
 * limite de corpo do proxy e da Vercel, e curto o bastante para o banco
 * validar feição por feição sem estourar o tempo da rota.
 */
export function emLotes(feicoes: FeicaoCar[], max = 400, bytes = 1_500_000) {
  const lotes: { inicio: number; feicoes: FeicaoCar[] }[] = [];
  let atual: FeicaoCar[] = [];
  let tam = 0;
  let inicio = 0;
  feicoes.forEach((f, i) => {
    const t = JSON.stringify(f).length;
    if (atual.length && (atual.length >= max || tam + t > bytes)) {
      lotes.push({ inicio, feicoes: atual });
      atual = []; tam = 0; inicio = i;
    }
    atual.push(f); tam += t;
  });
  if (atual.length) lotes.push({ inicio, feicoes: atual });
  return lotes;
}
