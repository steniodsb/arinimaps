/**
 * Pré-avaliação de valor e aptidão territorial — metodologia v0.
 *
 * TUDO o que este arquivo calcula está descrito, com os mesmos números, em
 * docs/PRE-AVALIACAO.md. Mudou um parâmetro aqui? Mude lá e suba a versão
 * (METODOLOGIA_VERSAO), porque cada resultado gravado em `avaliacoes` guarda a
 * versão que o produziu — é assim que a auditoria sabe qual regra valia.
 *
 * Funções puras (sem banco, sem rede): o servidor junta os dados e chama
 * daqui. Sem "server-only" — a tela usa os rótulos.
 */

export const METODOLOGIA_VERSAO = "v0-2026-10-07";

export const AVISO_OBRIGATORIO =
  "Estimativa automatizada, não substitui avaliação profissional.";

/** Parâmetros da v0. Ver docs/PRE-AVALIACAO.md §2. */
export const PARAMETROS = {
  /** preço anunciado → preço provável de venda (prática usual de mercado: ~10% de margem de negociação) */
  fatorOferta: 0.9,
  /** fator de área: (área do comparável / área do avaliando) ^ expoente, limitado */
  expoenteArea: 0.125,
  limiteFatorArea: [0.8, 1.25] as const,
  /** distância à sede municipal: efeito por km de diferença, limitado */
  sedePorKm: { rural: 0.002, urbano: 0.02 },
  limiteSede: { rural: 0.1, urbano: 0.15 },
  /** distância a acesso de rodovia (só rural): efeito por km, limitado */
  rodoviaPorKm: 0.004,
  limiteRodovia: 0.08,
  /** a partir de quantos comparáveis a faixa usa os quartis (abaixo, mínimo–máximo) */
  minParaQuartis: 8,
};

export type Comparavel = {
  codigo: string;
  status: string;
  valor: number | null;
  valor_venda: number | null;
  area_m2: number | null;
  area_declarada: number | null;
  municipio: string | null;
  mesmo_municipio: boolean | null;
  dist_sedes_km: number | null;
  dist_sede_m: number | null;
  dist_rodovia_m: number | null;
  data_ref: string | null;
};

export type Alvo = {
  id: string;
  codigo: string;
  tipo: "rural" | "urbano";
  status: string;
  valor: number | null;
  area_m2: number | null;
  area_declarada: number | null;
  caracteristicas: Record<string, unknown> | null;
  car_codigo: string | null;
  municipio: string | null;
  uf: string | null;
  dist_sede_m: number | null;
  dist_rodovia_m: number | null;
  geometria: GeoJSON.Geometry | null;
};

/** Incidência territorial já consultada (consultas_rurais / consultas_area). */
export type Incidencia = {
  fonte_id: string;
  nome: string;
  incide: boolean | null;
  quantidade: number | null;
  erro: string | null;
  consultado_em: string | null;
  itens: { titulo: string; detalhe?: string }[];
};

export type Confianca = "alta" | "media" | "baixa";

export type FatorAplicado = { id: string; nome: string; efeito_medio_pct: number; aplicado_em: number; explicacao: string };

export type ComparavelHomogeneizado = {
  codigo: string; municipio: string | null; base: "venda" | "oferta";
  unitario_bruto: number; fatores: Record<string, number>; unitario: number;
};

export type ResultadoPreAvaliacao =
  | {
      situacao: "dados_insuficientes";
      metodologia_versao: string;
      unidade: "ha" | "m2";
      comparaveis_encontrados: number;
      minimo_exigido: number;
      motivo: string;
      alertas: Alerta[];
      aviso: string;
    }
  | {
      situacao: "estimado";
      metodologia_versao: string;
      unidade: "ha" | "m2";
      area_avaliada: number;
      area_origem: "medida" | "declarada";
      unitario_mediana: number;
      unitario_min: number;
      unitario_max: number;
      valor_mediana: number;
      valor_min: number;
      valor_max: number;
      faixa_criterio: "quartis" | "minimo_maximo";
      comparaveis: number;
      escopo: "mesmo_municipio" | "regiao";
      coeficiente_variacao: number;
      fatores: FatorAplicado[];
      alertas: Alerta[];
      confianca: Confianca;
      confianca_motivo: string;
      detalhe: ComparavelHomogeneizado[];
      aviso: string;
    };

export type Alerta = { fonte: string; texto: string; gravidade: "restricao" | "atencao" | "informacao" };

// ------------------------------------------------------------------ utilidades
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const quantil = (ordenado: number[], q: number) => {
  if (!ordenado.length) return NaN;
  const pos = (ordenado.length - 1) * q;
  const base = Math.floor(pos), resto = pos - base;
  return ordenado[base + 1] !== undefined ? ordenado[base] + resto * (ordenado[base + 1] - ordenado[base]) : ordenado[base];
};

/** Área em m², preferindo a medida no mapa; a declarada vem em ha (rural) ou m² (urbano). */
export function areaDe(tipo: "rural" | "urbano", areaM2: number | null, declarada: number | null) {
  if (areaM2 && areaM2 > 0) return { m2: Number(areaM2), origem: "medida" as const };
  if (declarada && declarada > 0) return { m2: tipo === "rural" ? Number(declarada) * 10_000 : Number(declarada), origem: "declarada" as const };
  return null;
}

const emUnidade = (tipo: "rural" | "urbano", m2: number) => (tipo === "rural" ? m2 / 10_000 : m2);

// ------------------------------------------------------------------ alertas territoriais
/** Fontes cuja incidência é restrição (pode inviabilizar uso ou venda) ou atenção. */
const GRAVIDADE_FONTE: Record<string, Alerta["gravidade"]> = {
  funai: "restricao", ucs: "restricao", ibama_embargos: "restricao", quilombolas: "restricao",
  prodes_cerrado: "atencao", deter_cerrado: "atencao", anm: "atencao", iphan: "atencao",
};

export function alertasTerritoriais(incidencias: Incidencia[]): Alerta[] {
  const alertas: Alerta[] = [];
  for (const i of incidencias) {
    const grav = GRAVIDADE_FONTE[i.fonte_id];
    if (!grav || !i.incide) continue;
    alertas.push({
      fonte: i.nome, gravidade: grav,
      texto: grav === "restricao"
        ? `${i.nome}: incidência encontrada na área consultada — pode restringir o uso ou a venda; o efeito no valor não é quantificado pela v0.`
        : `${i.nome}: ${i.quantidade ?? "há"} registro(s) na área consultada — exige verificação antes de negociar.`,
    });
  }
  if (!incidencias.length) {
    alertas.push({ fonte: "Consulta territorial", gravidade: "informacao",
      texto: "A consulta territorial ainda não foi feita para esta área: embargos, terras indígenas e unidades de conservação não foram verificados." });
  }
  return alertas;
}

// ------------------------------------------------------------------ pré-avaliação
export function preAvaliar(alvo: Alvo, todos: Comparavel[], incidencias: Incidencia[], opcoes: { minComparaveis: number }): ResultadoPreAvaliacao {
  const unidade = alvo.tipo === "rural" ? "ha" as const : "m2" as const;
  const alertas = alertasTerritoriais(incidencias);
  const base = { metodologia_versao: METODOLOGIA_VERSAO, unidade, alertas, aviso: AVISO_OBRIGATORIO };
  const areaAlvo = areaDe(alvo.tipo, alvo.area_m2, alvo.area_declarada);

  // comparáveis válidos: preço e área conhecidos
  const validos = todos
    .map((c) => ({ c, area: areaDe(alvo.tipo, c.area_m2, c.area_declarada), preco: c.valor_venda ?? c.valor }))
    .filter((v) => v.area && v.preco && Number(v.preco) > 0);

  if (!areaAlvo) {
    return { ...base, situacao: "dados_insuficientes", comparaveis_encontrados: validos.length, minimo_exigido: opcoes.minComparaveis,
      motivo: "O imóvel não tem área medida no mapa nem área declarada." };
  }

  const mesmo = validos.filter((v) => v.c.mesmo_municipio);
  const usados = mesmo.length >= opcoes.minComparaveis ? mesmo : validos;
  const escopo = usados === mesmo ? "mesmo_municipio" as const : "regiao" as const;

  if (usados.length < opcoes.minComparaveis) {
    return { ...base, situacao: "dados_insuficientes", comparaveis_encontrados: usados.length, minimo_exigido: opcoes.minComparaveis,
      motivo: `Há ${usados.length} imóvel(is) comparável(is) do mesmo tipo na região com preço e área conhecidos; a metodologia exige pelo menos ${opcoes.minComparaveis}.` };
  }

  const tipo = alvo.tipo;
  const areaAlvoUn = emUnidade(tipo, areaAlvo.m2);
  const somaEfeito: Record<string, { soma: number; n: number }> = {};
  const registrar = (id: string, f: number) => {
    somaEfeito[id] = somaEfeito[id] ?? { soma: 0, n: 0 };
    somaEfeito[id].soma += f - 1; somaEfeito[id].n++;
  };

  const detalhe: ComparavelHomogeneizado[] = usados.map(({ c, area }) => {
    const vendido = c.valor_venda != null && Number(c.valor_venda) > 0;
    const preco = vendido ? Number(c.valor_venda) : Number(c.valor);
    const areaUn = emUnidade(tipo, area!.m2);
    const unitarioBruto = preco / areaUn;
    const fatores: Record<string, number> = {};

    fatores.oferta = vendido ? 1 : PARAMETROS.fatorOferta;
    registrar("oferta", fatores.oferta);

    fatores.area = limitar((areaUn / areaAlvoUn) ** PARAMETROS.expoenteArea, ...PARAMETROS.limiteFatorArea);
    registrar("area", fatores.area);

    if (alvo.dist_sede_m != null && c.dist_sede_m != null) {
      const difKm = (Number(c.dist_sede_m) - Number(alvo.dist_sede_m)) / 1000;
      fatores.sede = limitar(1 + PARAMETROS.sedePorKm[tipo] * difKm, 1 - PARAMETROS.limiteSede[tipo], 1 + PARAMETROS.limiteSede[tipo]);
      registrar("sede", fatores.sede);
    }
    if (tipo === "rural" && alvo.dist_rodovia_m != null && c.dist_rodovia_m != null) {
      const difKm = (Number(c.dist_rodovia_m) - Number(alvo.dist_rodovia_m)) / 1000;
      fatores.rodovia = limitar(1 + PARAMETROS.rodoviaPorKm * difKm, 1 - PARAMETROS.limiteRodovia, 1 + PARAMETROS.limiteRodovia);
      registrar("rodovia", fatores.rodovia);
    }
    const unitario = Object.values(fatores).reduce((acc, f) => acc * f, unitarioBruto);
    return { codigo: c.codigo, municipio: c.municipio, base: vendido ? "venda" : "oferta", unitario_bruto: unitarioBruto, fatores, unitario };
  });

  const ordenado = detalhe.map((d) => d.unitario).sort((a, b) => a - b);
  const media = ordenado.reduce((a, b) => a + b, 0) / ordenado.length;
  const desvio = Math.sqrt(ordenado.reduce((a, b) => a + (b - media) ** 2, 0) / ordenado.length);
  const cv = media > 0 ? desvio / media : 1;
  const usaQuartis = ordenado.length >= PARAMETROS.minParaQuartis;
  const uMin = usaQuartis ? quantil(ordenado, 0.25) : ordenado[0];
  const uMax = usaQuartis ? quantil(ordenado, 0.75) : ordenado[ordenado.length - 1];
  const uMed = quantil(ordenado, 0.5);

  // confiança: quantidade × dispersão, rebaixada por restrição territorial,
  // por comparáveis só de fora do município e por área apenas declarada
  let nivel = ordenado.length >= 10 && cv < 0.25 ? 2 : ordenado.length >= opcoes.minComparaveis && cv < 0.4 ? 1 : 0;
  const motivos = [`${ordenado.length} comparáveis, dispersão (CV) de ${Math.round(cv * 100)}%`];
  if (alertas.some((a) => a.gravidade === "restricao")) { nivel--; motivos.push("há restrição territorial não quantificada"); }
  if (escopo === "regiao") { nivel = Math.min(nivel, 1); motivos.push("comparáveis incluem municípios vizinhos"); }
  if (areaAlvo.origem === "declarada") { nivel = Math.min(nivel, 1); motivos.push("área apenas declarada, sem medição no mapa"); }
  const confianca: Confianca = nivel >= 2 ? "alta" : nivel === 1 ? "media" : "baixa";

  const NOMES: Record<string, [string, string]> = {
    oferta: ["Oferta × venda", `Preço anunciado multiplicado por ${PARAMETROS.fatorOferta} (margem de negociação); venda registrada entra pelo valor real.`],
    area: ["Tamanho da área", `(área do comparável ÷ área avaliada) elevado a ${PARAMETROS.expoenteArea}, entre ${PARAMETROS.limiteFatorArea[0]} e ${PARAMETROS.limiteFatorArea[1]}: áreas maiores costumam ter preço unitário menor.`],
    sede: ["Distância à sede municipal", `${PARAMETROS.sedePorKm[tipo] * 100}% por km de diferença, limitado a ±${PARAMETROS.limiteSede[tipo] * 100}%.`],
    rodovia: ["Distância a acesso de rodovia", `${PARAMETROS.rodoviaPorKm * 100}% por km de diferença, limitado a ±${PARAMETROS.limiteRodovia * 100}% (dados do OpenStreetMap).`],
  };
  const fatores: FatorAplicado[] = Object.entries(somaEfeito).map(([id, s]) => ({
    id, nome: NOMES[id][0], explicacao: NOMES[id][1], aplicado_em: s.n,
    efeito_medio_pct: Math.round((s.soma / s.n) * 1000) / 10,
  }));

  return {
    ...base,
    situacao: "estimado",
    area_avaliada: Math.round(areaAlvoUn * 100) / 100,
    area_origem: areaAlvo.origem,
    unitario_mediana: uMed, unitario_min: uMin, unitario_max: uMax,
    valor_mediana: uMed * areaAlvoUn, valor_min: uMin * areaAlvoUn, valor_max: uMax * areaAlvoUn,
    faixa_criterio: usaQuartis ? "quartis" : "minimo_maximo",
    comparaveis: ordenado.length,
    escopo,
    coeficiente_variacao: Math.round(cv * 100) / 100,
    fatores, alertas, confianca, confianca_motivo: motivos.join("; "),
    detalhe,
  };
}

// ------------------------------------------------------------------ aptidão territorial
export type Relevo = {
  declividade_media_pct: number; declividade_mediana_pct: number; declividade_max_pct: number;
  fracao_acima_8: number; fracao_acima_12: number; fracao_acima_20: number;
  altitude_min_m: number; altitude_max_m: number; amostras: number; resolucao_m: number; fonte: string;
};

export type Indicacao = "lavoura" | "pecuaria" | "restricoes" | "indeterminado";

export const INDICACAO_LABEL: Record<Indicacao, string> = {
  lavoura: "Mais propícia para lavoura (mecanizável)",
  pecuaria: "Mais propícia para pecuária",
  restricoes: "Área com restrições relevantes",
  indeterminado: "Indeterminado — faltam dados",
};

export type FatorAptidao = { fator: string; valor: string; efeito: "favorece_lavoura" | "favorece_pecuaria" | "restringe" | "neutro"; fonte: string };

export type ResultadoAptidao = {
  metodologia_versao: string;
  indicacao: Indicacao;
  resumo: string;
  fatores: FatorAptidao[];
  limitacoes: string[];
  dados_faltantes: string[];
  relevo: Relevo | null;
  aviso: string;
};

/** Classes de relevo da EMBRAPA (declividade em %). */
export function classeRelevo(pct: number) {
  if (pct <= 3) return "plano";
  if (pct <= 8) return "suave ondulado";
  if (pct <= 20) return "ondulado";
  if (pct <= 45) return "forte ondulado";
  if (pct <= 75) return "montanhoso";
  return "escarpado";
}

export function avaliarAptidao(alvo: Alvo, relevo: Relevo | null, incidencias: Incidencia[], fontesInativas: string[]): ResultadoAptidao {
  const fatores: FatorAptidao[] = [];
  const limitacoes: string[] = [];
  const faltantes: string[] = [];
  const inc = (id: string) => incidencias.find((i) => i.fonte_id === id);

  if (relevo) {
    const classe = classeRelevo(relevo.declividade_mediana_pct);
    fatores.push({
      fator: "Declividade",
      valor: `mediana ${relevo.declividade_mediana_pct.toLocaleString("pt-BR")}% (${classe}), média ${relevo.declividade_media_pct.toLocaleString("pt-BR")}%; ${Math.round(relevo.fracao_acima_12 * 100)}% dos pontos acima de 12%`,
      efeito: relevo.declividade_mediana_pct <= 8 && relevo.fracao_acima_12 <= 0.2 ? "favorece_lavoura" : relevo.declividade_mediana_pct <= 20 ? "favorece_pecuaria" : "restringe",
      fonte: relevo.fonte,
    });
    fatores.push({ fator: "Altitude", valor: `${relevo.altitude_min_m} a ${relevo.altitude_max_m} m`, efeito: "neutro", fonte: relevo.fonte });
  } else {
    faltantes.push("Relevo: o modelo de elevação não respondeu ou o imóvel não tem divisa no mapa.");
  }

  const agua = [inc("hidrografia"), inc("ana")].filter(Boolean) as Incidencia[];
  if (agua.length) {
    const temAgua = agua.some((a) => a.incide);
    fatores.push({
      fator: "Água",
      valor: temAgua
        ? agua.filter((a) => a.incide).flatMap((a) => a.itens.slice(0, 2).map((i) => i.titulo)).join("; ") || "corpos d'água na área consultada"
        : "nenhum corpo d'água mapeado na área consultada",
      efeito: temAgua ? "favorece_pecuaria" : "neutro",
      fonte: agua.map((a) => a.nome).join(" + "),
    });
    if (temAgua) limitacoes.push("Cursos d'água e nascentes geram Área de Preservação Permanente (APP), que reduz a área aproveitável.");
  } else {
    faltantes.push("Água: a consulta de hidrografia ainda não foi feita para esta área.");
  }

  const restricoes = ["funai", "ucs", "ibama_embargos", "quilombolas"].map(inc).filter((i): i is Incidencia => !!i && !!i.incide);
  for (const r of restricoes) {
    fatores.push({ fator: "Restrição legal", valor: `${r.nome}: incidência na área consultada`, efeito: "restringe", fonte: r.nome });
  }
  const desmat = ["prodes_cerrado", "deter_cerrado"].map(inc).filter((i): i is Incidencia => !!i && !!i.incide);
  for (const d of desmat) {
    fatores.push({ fator: "Desmatamento registrado", valor: `${d.nome}: ${d.quantidade ?? "há"} registro(s)`, efeito: "neutro", fonte: d.nome });
    limitacoes.push(`${d.nome}: desmatamento registrado pode restringir crédito rural e venda da produção (moratórias e exigências de rastreio) — verificar a regularidade.`);
  }

  const soloDeclarado = typeof alvo.caracteristicas?.solo === "string" ? (alvo.caracteristicas.solo as string) : null;
  if (soloDeclarado) {
    fatores.push({ fator: "Solo (declarado pelo anunciante)", valor: soloDeclarado, efeito: "neutro", fonte: "Anúncio — não verificado" });
  }
  if (fontesInativas.includes("mapbiomas")) faltantes.push("Uso e cobertura do solo (MapBiomas): fonte ainda não integrada.");
  if (fontesInativas.includes("ibama_embargos")) faltantes.push("Embargos do IBAMA: base ainda não importada — a ausência de alerta não significa ausência de embargo.");
  faltantes.push("Tipo e fertilidade do solo: não há base de solos integrada (ex.: EMBRAPA/SiBCS).");
  faltantes.push("Rentabilidade: não estimada — faltam produtividade, custos e preços regionais verificáveis.");
  if (!incidencias.length) faltantes.push("Consulta territorial: ainda não feita; restrições legais não foram verificadas.");

  let indicacao: Indicacao;
  if (restricoes.length) indicacao = "restricoes";
  else if (!relevo) indicacao = "indeterminado";
  else if (relevo.declividade_mediana_pct <= 8 && relevo.fracao_acima_12 <= 0.2) indicacao = "lavoura";
  else if (relevo.declividade_mediana_pct <= 20) indicacao = "pecuaria";
  else indicacao = "restricoes";

  const resumo =
    indicacao === "lavoura" ? "Relevo predominantemente plano a suave ondulado, compatível com mecanização. Também comporta pecuária."
    : indicacao === "pecuaria" ? "Relevo ondulado: mecanização limitada; mais indicado para pastagem, com lavoura apenas nos trechos planos."
    : indicacao === "restricoes" && restricoes.length ? "Há restrição legal incidente na área consultada; o uso produtivo depende de análise jurídica e ambiental."
    : indicacao === "restricoes" ? "Relevo forte ondulado ou mais íngreme: mecanização inviável na maior parte; pecuária extensiva, silvicultura ou preservação."
    : "Sem dados de relevo suficientes para indicar a aptidão.";

  if (relevo) limitacoes.push(`Relevo estimado com ${relevo.amostras} pontos do modelo de elevação (~${relevo.resolucao_m} m por pixel): não substitui levantamento topográfico.`);

  return { metodologia_versao: METODOLOGIA_VERSAO, indicacao, resumo, fatores, limitacoes, dados_faltantes: faltantes, relevo, aviso: AVISO_OBRIGATORIO };
}
