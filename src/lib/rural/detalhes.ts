/**
 * Detalhes de um registro oficial (o `extra` das incidências) em linguagem de
 * gente: rótulo em português, número no padrão brasileiro e data legível.
 *
 * Antes cada tela fazia `chave.replace("_", " ") + ": " + valor` e o cliente
 * lia "modulos fiscais: 2.756", "municipio ibge: 5203906",
 * "dat ult alteracao: 2024-03-01T00:00:00Z" (QA 19/10/2026).
 */
const ROTULOS: Record<string, string> = {
  ano_criacao: "Criação",
  area_ha: "Área (ha)",
  atualizado_no_sicar: "Atualizado no SICAR",
  cadastrado_em: "Cadastrado em",
  certificacao: "Certificação",
  codigo: "Código",
  codigo_incra: "Código INCRA",
  codigo_iphan: "Código IPHAN",
  data_deteccao: "Detectado em",
  decreto: "Decreto",
  desmatamento: "Desmatamento",
  esfera: "Esfera",
  etnia: "Etnia",
  extensao_dos_trechos_km: "Extensão (km)",
  grupo: "Grupo",
  imovel: "Imóvel",
  matricula: "Matrícula",
  modulos_fiscais: "Módulos fiscais",
  municipio_ibge: "Município (código IBGE)",
  parcela: "Parcela",
  potencia_kw: "Potência (kW)",
  processo: "Processo",
  protecao: "Proteção",
  publicacao: "Publicação",
  satelite: "Satélite",
  sensor: "Sensor",
  tipo: "Tipo",
  titulado: "Titulado",
  uf: "UF",
  ultimo_evento: "Último evento",
  unidade: "Unidade",
  uso: "Uso",
};

/** Siglas do CAR que o leigo não reconhece. */
const VALORES: Record<string, string> = {
  IRU: "Imóvel rural",
  AST: "Assentamento",
  PCT: "Povos e comunidades tradicionais",
  true: "sim",
  false: "não",
};

// campos que são identificadores: número sem separador de milhar
const IDENTIFICADORES = new Set(["codigo", "codigo_incra", "codigo_iphan", "municipio_ibge", "processo", "matricula", "decreto", "parcela"]);

function rotulo(chave: string): string {
  if (ROTULOS[chave]) return ROTULOS[chave];
  const t = chave.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function valor(chave: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "sim" : "não";
  const bruto = String(v).trim();
  if (VALORES[bruto]) return VALORES[bruto];
  // data ISO (com ou sem hora) → dd/mm/aaaa
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (!IDENTIFICADORES.has(chave) && /^-?\d+(\.\d+)?$/.test(bruto)) {
    const n = Number(bruto);
    return n.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });
  }
  return bruto;
}

/** "Tipo: Imóvel rural · Módulos fiscais: 2,76 · Área (ha): 120,6" */
export function detalhesRegistro(extra: Record<string, unknown> | null | undefined): string {
  if (!extra) return "";
  return Object.entries(extra)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${rotulo(k)}: ${valor(k, v)}`)
    .join(" · ");
}
