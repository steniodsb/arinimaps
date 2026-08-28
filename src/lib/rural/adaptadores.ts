import "server-only";

/**
 * Adaptadores das fontes oficiais de consulta rural.
 *
 * Cada fonte tem seu próprio contrato (ArcGIS, WFS, Overpass); o resto do
 * sistema só enxerga `ResultadoFonte`. Nenhum adaptador lança: fonte fora do
 * ar vira `erro` no relatório, com a data da tentativa — o documento técnico
 * exige rastrear origem e indisponibilidade.
 *
 * Endpoints sondados em 28/08/2026 por `scripts/sonda-fontes*.mjs`. O que não
 * está aqui não tem consulta pública por polígono e fica marcado no banco como
 * "depende de importação" — nunca como "nada encontrado".
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

/**
 * Uma chamada, com repetição.
 *
 * O geoserver do Programa Queimadas é um cluster e nem todo nó tem o
 * workspace: medido em 28/08, 3 de 8 chamadas idênticas voltam 404. Por isso
 * 404 é tratado como retentável junto com os 5xx — o que não existe mesmo
 * continua falhando depois das tentativas, e a fonte cai para `erro`.
 */
async function buscar(url: string, opcoes: RequestInit = {}, tentativas = 3) {
  let ultimo = "";
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, {
        ...opcoes,
        headers: { "User-Agent": UA, Accept: "application/json", ...(opcoes.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (r.ok) return r;
      ultimo = `HTTP ${r.status}`;
      if (r.status !== 404 && r.status < 500) break; // 4xx real: insistir não ajuda
    } catch (e) {
      ultimo = msg(e);
    }
    if (i < tentativas - 1) await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
  }
  throw new Error(ultimo || "falha desconhecida");
}

type Props = Record<string, string | number | null>;

/** GetFeature WFS por envelope, já em GeoJSON. */
async function wfs(base: string, camada: string, bbox: Bbox, max = 50): Promise<Props[]> {
  // o nome da camada vai CRU: o geoserver do Programa Queimadas devolve 404
  // quando o ':' chega escapado como %3A.
  const url = `${base}?service=WFS&version=1.0.0&request=GetFeature&typeName=${camada}` +
    `&outputFormat=application/json&maxFeatures=${max}` +
    `&bbox=${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:4326`;
  const j = await (await buscar(url)).json();
  if (j.exceptions) throw new Error(String(j.exceptions[0]?.text ?? "erro do WFS"));
  return ((j.features ?? []) as { properties: Props }[]).map((f) => f.properties ?? {});
}

/**
 * Contagem real de feições no envelope (`resultType=hits`), sem baixar nada.
 *
 * Serve para não publicar o teto de `maxFeatures` como se fosse o total: no
 * imóvel de teste o teto de 500 escondia 1.048 focos.
 */
async function wfsTotal(base: string, camada: string, bbox: Bbox): Promise<number> {
  const url = `${base}?service=WFS&version=1.1.0&request=GetFeature&typeName=${camada}` +
    `&resultType=hits&bbox=${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:4326`;
  const xml = await (await buscar(url, { headers: { Accept: "application/xml" } })).text();
  const n = xml.match(/number(?:OfFeatures|Matched)="(\d+)"/)?.[1];
  if (!n) throw new Error("o serviço não devolveu a contagem");
  return Number(n);
}

/** query ArcGIS REST por envelope. */
// max = null para servidores que recusam paginação (o SIGMINE responde
// "Pagination is not supported" e zera a consulta inteira).
async function arcgis(base: string, camada: string | number, bbox: Bbox, campos = "*", max: number | null = 50): Promise<Props[]> {
  const geometria = encodeURIComponent(JSON.stringify({
    xmin: bbox.xmin, ymin: bbox.ymin, xmax: bbox.xmax, ymax: bbox.ymax,
    spatialReference: { wkid: 4326 },
  }));
  const url = `${base}/${camada}/query?f=json&geometry=${geometria}&geometryType=esriGeometryEnvelope&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(campos)}` +
    "&returnGeometry=false" + (max === null ? "" : `&resultRecordCount=${max}`);
  const j = await (await buscar(url)).json();
  if (j.error) throw new Error(j.error.message ?? "erro do serviço");
  return ((j.features ?? []) as { attributes: Props }[]).map((f) => f.attributes ?? {});
}

const texto = (v: unknown, padrao = "") => (v === null || v === undefined || v === "" ? padrao : String(v));
const numero = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** Embrulha o adaptador: erro vira campo, nunca exceção. */
async function adaptador(
  fonte_id: string,
  fn: () => Promise<{ quantidade: number; itens: ItemEncontrado[]; incide?: boolean }>,
): Promise<ResultadoFonte> {
  try {
    const r = await fn();
    return { fonte_id, quantidade: r.quantidade, incide: r.incide ?? r.quantidade > 0, itens: r.itens };
  } catch (e) {
    return { fonte_id, quantidade: 0, incide: false, itens: [], erro: msg(e) };
  }
}

// ---------------------------------------------------------------------------
// Fundiário / mineral
// ---------------------------------------------------------------------------

/** ANM/SIGMINE — processos minerários ativos. Não aceita paginação. */
export function consultarAnm(bbox: Bbox) {
  return adaptador("anm", async () => {
    const linhas = await arcgis(
      "https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer",
      0, bbox, "PROCESSO,FASE,NOME,SUBS,USO,AREA_HA,ULT_EVENTO", null,
    );
    return {
      quantidade: linhas.length,
      itens: linhas.slice(0, 40).map((p) => ({
        titulo: `${texto(p.SUBS, "substância não informada")} — ${texto(p.FASE, "fase não informada")}`,
        detalhe: texto(p.NOME),
        extra: {
          processo: texto(p.PROCESSO),
          uso: texto(p.USO),
          area_ha: numero(p.AREA_HA),
          ultimo_evento: texto(p.ULT_EVENTO),
        },
      })),
    };
  });
}

/** FUNAI — terras indígenas (poligonais). */
export function consultarFunai(bbox: Bbox) {
  return adaptador("funai", async () => {
    const linhas = await wfs("https://geoserver.funai.gov.br/geoserver/Funai/ows", "Funai:tis_poligonais", bbox, 20);
    return {
      quantidade: linhas.length,
      itens: linhas.map((p) => ({
        titulo: texto(p.terrai_nom ?? p.nome, "Terra indígena"),
        detalhe: texto(p.fase_ti ?? p.modalidade),
        extra: { etnia: texto(p.etnia_nome), uf: texto(p.uf_sigla) },
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Ambiental — desmatamento, alertas, fogo, unidades de conservação
// ---------------------------------------------------------------------------

/** INPE/TerraBrasilis — desmatamento PRODES no bioma Cerrado, agregado por ano. */
export function consultarProdes(bbox: Bbox) {
  return adaptador("prodes_cerrado", async () => {
    const base = "https://terrabrasilis.dpi.inpe.br/geoserver/ows";
    const camada = "prodes-cerrado-nb:yearly_deforestation";
    // o total vem de hits: o teto de maxFeatures não pode virar "o número de polígonos"
    const total = await wfsTotal(base, camada, bbox);
    const linhas = total ? await wfs(base, camada, bbox, 400) : [];
    const porAno = new Map<string, number>();
    for (const p of linhas) {
      const ano = texto(p.year ?? p.ano, "—");
      porAno.set(ano, (porAno.get(ano) ?? 0) + numero(p.area_km));
    }
    return {
      quantidade: total,
      itens: [...porAno.entries()].sort().map(([ano, km2]) => ({
        titulo: `Ano ${ano}`,
        detalhe: `${(km2 * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha de supressão registrada no entorno`,
      })),
    };
  });
}

/** INPE/DETER — alertas de alteração da cobertura vegetal (Cerrado). */
export function consultarDeter(bbox: Bbox) {
  return adaptador("deter_cerrado", async () => {
    const base = "https://terrabrasilis.dpi.inpe.br/geoserver/ows";
    const camada = "deter-cerrado-nb:deter_cerrado";
    const total = await wfsTotal(base, camada, bbox);
    const linhas = total ? await wfs(base, camada, bbox, 200) : [];
    // o alerta mais recente primeiro: é o que muda a conversa numa negociação
    const ordenadas = [...linhas].sort((a, b) => texto(b.view_date).localeCompare(texto(a.view_date)));
    return {
      quantidade: total,
      itens: ordenadas.slice(0, 20).map((p) => ({
        titulo: texto(p.classname, "Alerta DETER").replace(/_/g, " "),
        detalhe: `${numero(p.areatotalkm) * 100 > 0
          ? `${(numero(p.areatotalkm) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha · `
          : ""}detectado em ${texto(p.view_date, "data não informada")}`,
        extra: {
          satelite: texto(p.satellite),
          sensor: texto(p.sensor),
          area_ha: Number((numero(p.areatotalkm) * 100).toFixed(2)),
          data_deteccao: texto(p.view_date),
        },
      })),
    };
  });
}

/**
 * INPE Programa Queimadas — focos de calor.
 *
 * A camada `bdqueimadas2:focos` é o histórico inteiro desde 1998, então:
 *  - o TOTAL vem de `resultType=hits`, não do que foi baixado (senão o teto de
 *    maxFeatures viraria "o número de focos", o que é falso);
 *  - o detalhamento baixa os mais recentes primeiro (`sortBy=data_hora_gmt D`),
 *    porque o que pesa numa negociação é fogo recente, não o de 1998;
 *  - se o histórico não coube na amostra, o relatório diz isso em vez de
 *    apresentar a quebra por ano como se fosse completa.
 */
const AMOSTRA_FOCOS = 2000;

export function consultarQueimadas(bbox: Bbox) {
  return adaptador("inpe_queimadas", async () => {
    const base = "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows";
    const camada = "bdqueimadas2:focos";
    const total = await wfsTotal(base, camada, bbox);
    if (total === 0) return { quantidade: 0, itens: [] };

    const url = `${base}?service=WFS&version=1.0.0&request=GetFeature&typeName=${camada}` +
      `&outputFormat=application/json&maxFeatures=${AMOSTRA_FOCOS}&sortBy=data_hora_gmt+D` +
      `&bbox=${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax},EPSG:4326`;
    const j = await (await buscar(url)).json();
    const linhas = ((j.features ?? []) as { properties: Props }[]).map((f) => f.properties ?? {});

    const porAno = new Map<string, number>();
    let recentes = 0;
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 1);
    for (const p of linhas) {
      const dh = texto(p.data_hora_gmt);
      porAno.set(dh.slice(0, 4) || "—", (porAno.get(dh.slice(0, 4) || "—") ?? 0) + 1);
      if (dh && new Date(dh) >= limite) recentes++;
    }
    const completo = linhas.length >= total;
    const itens: ItemEncontrado[] = [{
      titulo: `${recentes} foco(s) nos últimos 12 meses`,
      detalhe: `${total.toLocaleString("pt-BR")} foco(s) no histórico do INPE para o raio consultado` +
        (completo ? "" : ` · a quebra por ano abaixo cobre os ${linhas.length.toLocaleString("pt-BR")} mais recentes`),
    }];
    // 6 anos bastam para ler a tendência; a lista inteira afogava o relatório
    for (const [ano, n] of [...porAno.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)) {
      itens.push({ titulo: `Ano ${ano}`, detalhe: `${n} foco(s) de calor` });
    }
    return { quantidade: total, itens };
  });
}

/**
 * Unidades de conservação que incidem sobre o Cerrado.
 *
 * Vem da camada que o INPE publica no TerraBrasilis (compilada do CNUC/MMA):
 * o geoserviço do ICMBio e o do MMA não resolveram DNS na sondagem de 28/08.
 * A proveniência guardada é essa — não se apresenta como consulta ao CNUC.
 */
export function consultarUnidadesConservacao(bbox: Bbox) {
  return adaptador("ucs", async () => {
    const linhas = await wfs("https://terrabrasilis.dpi.inpe.br/geoserver/ows",
      "prodes-cerrado-nb:conservation_units_cerrado_biome", bbox, 20);
    return {
      quantidade: linhas.length,
      itens: linhas.map((p) => ({
        titulo: texto(p.nome, "Unidade de conservação"),
        detalhe: [texto(p.categoria), texto(p.esfera)].filter(Boolean).join(" · "),
        extra: {
          grupo: texto(p.grupo) === "PI" ? "Proteção Integral" : texto(p.grupo) === "US" ? "Uso Sustentável" : texto(p.grupo),
          ano_criacao: texto(p.ano_cria),
        },
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Hídrico e energia
// ---------------------------------------------------------------------------

/** ANA/SNIRH — cursos d'água do entorno. */
export function consultarAna(bbox: Bbox) {
  return adaptador("ana", async () => {
    const linhas = await arcgis(
      "https://www.snirh.gov.br/arcgis/rest/services/DADOSABERTOS/Curso_d%C3%81gua/MapServer",
      0, bbox, "*", 30,
    );
    // o serviço não padroniza o nome do campo; pega o primeiro que pareça nome
    // nomes medidos no serviço em 28/08: BHB_NM_NORIOCOMP é o nome composto
    const nomeDe = (p: Props) =>
      texto(p.BHB_NM_NORIOCOMP ?? p.BHB_CD_NORIO, "Curso d'água sem nome cadastrado");
    const nomes = new Map<string, number>();
    for (const p of linhas) nomes.set(nomeDe(p), (nomes.get(nomeDe(p)) ?? 0) + 1);
    return {
      quantidade: linhas.length,
      itens: [...nomes.entries()].slice(0, 20).map(([nome, n]) => ({
        titulo: nome,
        detalhe: n > 1 ? `${n} trecho(s) no raio consultado` : "1 trecho no raio consultado",
      })),
    };
  });
}

/** INPE/TerraBrasilis — corpos d'água e represas mapeados no Cerrado. */
export function consultarHidrografia(bbox: Bbox) {
  return adaptador("hidrografia", async () => {
    const base = "https://terrabrasilis.dpi.inpe.br/geoserver/ows";
    const camada = "prodes-cerrado-nb:hydrography";
    const total = await wfsTotal(base, camada, bbox);
    const linhas = total ? await wfs(base, camada, bbox, 400) : [];
    const porClasse = new Map<string, { n: number; km2: number }>();
    for (const p of linhas) {
      const c = texto(p.class_name ?? p.main_class, "corpo d'água");
      const at = porClasse.get(c) ?? { n: 0, km2: 0 };
      porClasse.set(c, { n: at.n + 1, km2: at.km2 + numero(p.area_km) });
    }
    return {
      quantidade: total,
      itens: [...porClasse.entries()].map(([classe, v]) => ({
        titulo: classe.charAt(0).toUpperCase() + classe.slice(1).replace(/_/g, " "),
        detalhe: `${v.n} feição(ões)${v.km2 > 0 ? ` · ${(v.km2 * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : ""}`,
      })),
    };
  });
}

/**
 * ANEEL/SIGEL — empreendimentos de geração e reservatórios no entorno.
 *
 * O SIGEL não expõe serviço público de linhas de transmissão e subestações
 * (sondado em 28/08); o que existe é a camada de empreendimentos. A limitação
 * fica registrada na fonte para não passar como cobertura completa.
 */
const ANEEL_CAMADAS: { id: number; rotulo: string }[] = [
  { id: 0, rotulo: "Central geradora eólica" },
  { id: 1, rotulo: "Usina hidrelétrica" },
  { id: 2, rotulo: "Usina termelétrica" },
  { id: 3, rotulo: "Pequena central hidrelétrica" },
  { id: 5, rotulo: "Central geradora hidrelétrica" },
  { id: 7, rotulo: "Usina fotovoltaica" },
  { id: 8, rotulo: "Reservatório" },
];

export function consultarAneel(bbox: Bbox) {
  return adaptador("aneel", async () => {
    const base = "https://sigel.aneel.gov.br/arcgis/rest/services/PORTAL/Camadas/MapServer";
    // uma camada fora do ar não pode zerar as outras
    const porCamada = await Promise.all(
      ANEEL_CAMADAS.map(async (c) => {
        try { return { ...c, linhas: await arcgis(base, c.id, bbox, "*", 20) }; }
        catch { return { ...c, linhas: [] as Props[] }; }
      }),
    );
    const itens: ItemEncontrado[] = [];
    for (const c of porCamada) {
      for (const p of c.linhas.slice(0, 10)) {
        itens.push({
          titulo: `${c.rotulo} — ${texto(p.NOME ?? p.nome ?? p.NOME_EMPRE ?? p.DESCRICAO, "sem nome")}`,
          detalhe: [texto(p.FASE ?? p.SITUACAO), texto(p.PROPRIETAR ?? p.PROPRIETARIO)].filter(Boolean).join(" · "),
          extra: { tipo: c.rotulo, potencia_kw: numero(p.POT_KW ?? p.POTENCIA) || null },
        });
      }
    }
    return { quantidade: porCamada.reduce((s, c) => s + c.linhas.length, 0), itens };
  });
}

/** Todas as fontes que consultam ao vivo, na ordem do relatório. */
export const ADAPTADORES: { id: string; fn: (b: Bbox) => Promise<ResultadoFonte> }[] = [
  { id: "anm", fn: consultarAnm },
  { id: "funai", fn: consultarFunai },
  { id: "prodes_cerrado", fn: consultarProdes },
  { id: "deter_cerrado", fn: consultarDeter },
  { id: "inpe_queimadas", fn: consultarQueimadas },
  { id: "ucs", fn: consultarUnidadesConservacao },
  { id: "hidrografia", fn: consultarHidrografia },
  { id: "ana", fn: consultarAna },
  { id: "aneel", fn: consultarAneel },
];

const msg = (e: unknown) =>
  e instanceof Error ? (e.name === "TimeoutError" ? "serviço não respondeu a tempo" : e.message) : "falha desconhecida";
