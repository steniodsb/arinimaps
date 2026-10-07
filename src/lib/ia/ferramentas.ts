import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { imoveisDaVitrine } from "@/lib/imovel/vitrine";
import { formatArea, formatBRL, STATUS_LABEL } from "@/lib/format";

/**
 * As ÚNICAS coisas que o assistente consegue fazer no sistema (Segurança 18:
 * "a IA consulta os dados com a permissão de quem perguntou").
 *
 * Regras que valem para todas:
 *  · só leitura, por funções escritas aqui — nada de SQL livre;
 *  · só o que um visitante já vê no site: vitrine pública (mesma consulta de
 *    /imoveis), ficha pública (fn_property_public), dados públicos do CAR e
 *    resultados de consulta já gravados (nunca dispara consulta nova, que é
 *    paga/limitada), e artigos PUBLICADOS da base de conhecimento;
 *  · sem dado pessoal: nada de dono, parceiro, telefone, documento, lead;
 *  · tudo que volta é DADO, entregue como JSON — o prompt de sistema manda o
 *    modelo ignorar qualquer instrução que apareça dentro desses dados.
 */

export type Fonte = { tipo: "imovel" | "car" | "conhecimento"; rotulo: string; href?: string };
export type ResultadoFerramenta = { conteudo: string; fontes: Fonte[]; ok: boolean };

export const FERRAMENTA_ROTULO: Record<string, string> = {
  buscar_imoveis: "Buscando imóveis publicados",
  detalhes_imovel: "Lendo a ficha do imóvel",
  consultar_area_car: "Consultando a área do CAR",
  buscar_conhecimento: "Consultando a base de conhecimento",
};

// eager_input_streaming: as entradas chegam enquanto são geradas; como o
// servidor deixa de validá-las, cada executor abaixo valida e normaliza a sua.
export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_imoveis",
    description:
      "Busca imóveis PUBLICADOS na vitrine pública do Arini Maps (mesma busca da página /imoveis). Use para pedidos como " +
      "\"lotes de R$ 40 mil em Iturama\" ou \"fazendas acima de 100 ha em União de Minas\". Lote, casa, terreno na cidade = tipo urbano; " +
      "fazenda, sítio, chácara, área rural = tipo rural. Para valor aproximado (\"de R$ 40 mil\"), use uma faixa de cerca de ±20%. " +
      "Devolve no máximo 15 imóveis com código, título, município, valor, área e o link da ficha.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["rural", "urbano"], description: "rural ou urbano" },
        modalidade: { type: "string", enum: ["venda", "leilao"], description: "venda comum ou leilão" },
        municipio: { type: "string", description: "nome do município, ex.: Iturama" },
        texto: { type: "string", description: "palavras do título ou código do anúncio" },
        preco_min: { type: "number", description: "valor mínimo em reais" },
        preco_max: { type: "number", description: "valor máximo em reais" },
        area_min_ha: { type: "number", description: "área mínima em hectares (rural)" },
        area_max_ha: { type: "number", description: "área máxima em hectares (rural)" },
        area_min_m2: { type: "number", description: "área mínima em m² (urbano)" },
        area_max_m2: { type: "number", description: "área máxima em m² (urbano)" },
        ordem: { type: "string", enum: ["recentes", "menor_preco", "maior_preco", "maior_area"] },
        incluir_vendidos: { type: "boolean", description: "incluir imóveis já vendidos (padrão: não)" },
        limite: { type: "integer", minimum: 1, maximum: 15 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "detalhes_imovel",
    description:
      "Lê a ficha PÚBLICA de um imóvel pelo código (ex.: ARINI-MAP-000002): descrição, valor, área medida e declarada, " +
      "características, condições de venda, dados de leilão e pontos de interesse próximos. Não traz dados do proprietário.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { codigo: { type: "string", description: "código do anúncio, ex.: ARINI-MAP-000002" } },
      required: ["codigo"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_area_car",
    description:
      "Informações de uma área do CAR (Cadastro Ambiental Rural) pelo código do imóvel no SICAR (ex.: MG-3134400-F0B5DB13...): " +
      "área declarada, município, situação do cadastro, se está anunciada, e os resultados JÁ GRAVADOS do cruzamento com fontes " +
      "oficiais (mineração, terras indígenas, desmatamento, água etc.). Não faz consulta nova. Lembre que o CAR não comprova propriedade.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { codigo_car: { type: "string", description: "código do imóvel no CAR, formato UF-IBGE-HASH" } },
      required: ["codigo_car"],
      additionalProperties: false,
    },
  },
  {
    name: "buscar_conhecimento",
    description:
      "Pesquisa a base de conhecimento oficial da Arini (artigos com fonte e data): como funciona a publicação, comissão, planos, " +
      "CAR, consulta de área, solicitações cartográficas, privacidade/LGPD, leilões, pré-avaliação etc. Use SEMPRE antes de responder " +
      "dúvidas sobre regras, processos ou o funcionamento do sistema.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { consulta: { type: "string", description: "palavras-chave ou a pergunta em português" } },
      required: ["consulta"],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------------ validação
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const txt = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const json = (v: unknown) => JSON.stringify(v);

// ------------------------------------------------------------------ executores
async function buscarImoveis(e: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const tipo = e.tipo === "rural" || e.tipo === "urbano" ? e.tipo : undefined;
  const modalidade = e.modalidade === "leilao" || e.modalidade === "venda" ? e.modalidade : undefined;
  const municipio = txt(e.municipio, 80);
  const texto = txt(e.texto, 80);
  const [pMin, pMax] = [num(e.preco_min), num(e.preco_max)];
  const [haMin, haMax, m2Min, m2Max] = [num(e.area_min_ha), num(e.area_max_ha), num(e.area_min_m2), num(e.area_max_m2)];
  const limite = Math.min(15, Math.max(1, Math.round(num(e.limite) ?? 8)));
  const ordem = txt(e.ordem, 20) ?? "recentes";

  const { data, error } = await imoveisDaVitrine();
  if (error) return { ok: false, fontes: [], conteudo: json({ erro: "A busca de imóveis não respondeu agora." }) };

  type Linha = NonNullable<typeof data>[number];
  const munDe = (p: Linha) => p.municipality as unknown as { nome: string; uf: string } | null;
  const areaDe = (p: Linha) => Number((p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? 0);

  let lista = (data ?? []).filter((p) => {
    if (p.status === "vendido" && e.incluir_vendidos !== true) return false;
    if (tipo && p.tipo !== tipo) return false;
    if (modalidade && (p.modalidade ?? "venda") !== modalidade) return false;
    if (municipio && !norm(munDe(p)?.nome ?? "").includes(norm(municipio))) return false;
    if (texto && !norm(`${p.titulo} ${p.codigo}`).includes(norm(texto))) return false;
    const valor = p.valor == null ? null : Number(p.valor);
    if (pMin != null && (valor == null || valor < pMin)) return false;
    if (pMax != null && (valor == null || valor > pMax)) return false;
    const a = areaDe(p);
    if (haMin != null && a / 10_000 < haMin) return false;
    if (haMax != null && (!a || a / 10_000 > haMax)) return false;
    if (m2Min != null && a < m2Min) return false;
    if (m2Max != null && (!a || a > m2Max)) return false;
    return true;
  });
  lista = lista.sort((a, b) => {
    if (ordem === "menor_preco") return Number(a.valor ?? Infinity) - Number(b.valor ?? Infinity);
    if (ordem === "maior_preco") return Number(b.valor ?? 0) - Number(a.valor ?? 0);
    if (ordem === "maior_area") return areaDe(b) - areaDe(a);
    return String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""));
  });

  const imoveis = lista.slice(0, limite).map((p) => {
    const m = munDe(p);
    return {
      codigo: p.codigo, titulo: p.titulo, tipo: p.tipo, modalidade: p.modalidade ?? "venda",
      situacao: STATUS_LABEL[p.status] ?? p.status,
      municipio: m ? `${m.nome}/${m.uf}` : null,
      valor: p.valor == null ? null : Number(p.valor), valor_formatado: formatBRL(p.valor == null ? null : Number(p.valor)),
      area_formatada: formatArea(areaDe(p) || null, p.tipo as "urbano" | "rural"),
      link: `/imovel/${p.codigo}`,
    };
  });
  return {
    ok: true,
    fontes: imoveis.map((i) => ({ tipo: "imovel" as const, rotulo: `${i.codigo} — ${i.titulo}`, href: i.link })),
    conteudo: json({
      total_encontrado: lista.length, mostrando: imoveis.length, imoveis,
      observacao: "Somente anúncios aprovados e publicados na vitrine pública. Valores são os anunciados.",
    }),
  };
}

const CARACTERISTICAS_PUBLICAS = ["quartos", "suites", "banheiros", "vagas", "zoneamento", "solo", "benfeitorias", "unidade_area"];

async function detalhesImovel(e: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const codigo = txt(e.codigo, 40)?.toUpperCase();
  if (!codigo || !/^[A-Z0-9-]{4,40}$/.test(codigo)) return { ok: false, fontes: [], conteudo: json({ erro: "Código inválido." }) };
  const admin = supabaseAdmin();
  const { data } = await admin.rpc("fn_property_public", { p_codigo: codigo });
  const p = data as {
    id: string; codigo: string; tipo: "urbano" | "rural"; status: string; titulo: string; descricao: string;
    valor: number | null; area_declarada: number | null; caracteristicas: Record<string, unknown> | null;
    condicoes_venda: string | null; aceita_permuta: boolean; aceita_financiamento: boolean;
    municipio: { nome: string; uf: string } | null; area_m2: number | null; perimeter_m: number | null; published_at: string | null;
  } | null;
  if (!p) return { ok: false, fontes: [], conteudo: json({ erro: `Nenhum anúncio publicado com o código ${codigo}.` }) };

  const [{ data: extra }, { data: pois }] = await Promise.all([
    admin.from("properties").select("modalidade, leilao, car_codigo").eq("id", p.id).maybeSingle(),
    admin.from("property_pois").select("distancia_m, poi:pois(nome, categoria)").eq("property_id", p.id).order("distancia_m").limit(8),
  ]);
  const carac = Object.fromEntries(Object.entries(p.caracteristicas ?? {}).filter(([k]) => CARACTERISTICAS_PUBLICAS.includes(k)));
  const leilao = extra?.modalidade === "leilao" ? (extra.leilao as Record<string, unknown> | null) : null;
  const link = `/imovel/${p.codigo}`;
  return {
    ok: true,
    fontes: [{ tipo: "imovel", rotulo: `${p.codigo} — ${p.titulo}`, href: link }],
    conteudo: json({
      codigo: p.codigo, titulo: p.titulo, tipo: p.tipo, situacao: STATUS_LABEL[p.status] ?? p.status,
      modalidade: extra?.modalidade ?? "venda",
      municipio: p.municipio ? `${p.municipio.nome}/${p.municipio.uf}` : null,
      valor: p.valor, valor_formatado: formatBRL(p.valor),
      area_medida: formatArea(p.area_m2, p.tipo),
      area_declarada: p.area_declarada ? `${Number(p.area_declarada).toLocaleString("pt-BR")} ${p.tipo === "rural" ? "ha" : "m²"}` : null,
      perimetro_km: p.perimeter_m ? Math.round(p.perimeter_m / 100) / 10 : null,
      descricao: (p.descricao ?? "").slice(0, 1500),
      caracteristicas: carac,
      condicoes_venda: p.condicoes_venda, aceita_permuta: p.aceita_permuta, aceita_financiamento: p.aceita_financiamento,
      leilao: leilao ? {
        praca1_data: leilao.praca1_data ?? null, praca1_lance: leilao.praca1_lance ?? null,
        praca2_data: leilao.praca2_data ?? null, praca2_lance: leilao.praca2_lance ?? null, site: leilao.site ?? null,
      } : null,
      tem_car_vinculado: !!extra?.car_codigo,
      pontos_de_interesse: (pois ?? []).map((x) => {
        const poi = x.poi as unknown as { nome: string | null; categoria: string } | null;
        return { nome: poi?.nome ?? poi?.categoria ?? "—", categoria: poi?.categoria, distancia_km: Math.round(Number(x.distancia_m) / 100) / 10 };
      }),
      publicado_em: p.published_at,
      link,
      observacao: "Dados da ficha pública. Distâncias em linha reta. Negociação sempre pela Arini.",
    }),
  };
}

const STATUS_CAR: Record<string, string> = { AT: "Ativo", PE: "Pendente", SU: "Suspenso", CA: "Cancelado" };
const TIPO_CAR: Record<string, string> = { IRU: "Imóvel rural", AST: "Assentamento", PCT: "Povos e comunidades tradicionais" };

async function consultarAreaCar(e: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const cod = txt(e.codigo_car, 80)?.toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
  if (!cod || !/^[A-Z]{2}-\d{7}-[0-9A-F]{32}$/.test(cod)) {
    return { ok: false, fontes: [], conteudo: json({ erro: "Código do CAR inválido. O formato é UF-código IBGE-identificador, ex.: MG-3134400-F0B5DB13248140BBAE3B90AD7E6F4A53." }) };
  }
  const admin = supabaseAdmin();
  const [{ data: car }, { data: consultas }, { data: fontes }, { data: anuncio }] = await Promise.all([
    admin.rpc("fn_car_imovel", { p_cod: cod }),
    admin.from("consultas_area").select("fonte_id, quantidade, incide, erro, consultado_em, resultado").eq("chave", `car:${cod}`),
    admin.from("fontes_externas").select("id, nome, orgao, ativa"),
    admin.from("properties").select("codigo, titulo").eq("car_codigo", cod).in("status", ["publicado", "em_negociacao"]).limit(1).maybeSingle(),
  ]);
  const props = (car as { properties?: Record<string, unknown> } | null)?.properties;
  if (!props) return { ok: false, fontes: [], conteudo: json({ erro: `A área ${cod} não está na cópia do CAR importada pela Arini (região piloto).` }) };

  const nomes = new Map((fontes ?? []).map((f) => [f.id, `${f.nome} (${f.orgao})`]));
  const link = `/consulta/car/${encodeURIComponent(cod)}`;
  const cruzamento = (consultas ?? []).map((c) => ({
    fonte: nomes.get(c.fonte_id) ?? c.fonte_id,
    resultado: c.erro ? "fonte indisponível na consulta (não significa ausência de restrição)" : c.incide ? "há registros" : "nada encontrado",
    quantidade: c.quantidade,
    itens: ((c.resultado as { itens?: { titulo?: string; detalhe?: string }[] } | null)?.itens ?? []).slice(0, 4)
      .map((i) => [i.titulo, i.detalhe].filter(Boolean).join(" — ")),
    consultado_em: c.consultado_em,
  }));
  const fontesOut: Fonte[] = [{ tipo: "car", rotulo: `CAR ${cod.slice(0, 18)}…`, href: link }];
  if (anuncio) fontesOut.push({ tipo: "imovel", rotulo: `${anuncio.codigo} — ${anuncio.titulo}`, href: `/imovel/${anuncio.codigo}` });
  return {
    ok: true, fontes: fontesOut,
    conteudo: json({
      codigo_car: cod,
      area_declarada_ha: props.area_ha,
      municipio: props.municipio,
      tipo: TIPO_CAR[String(props.tipo)] ?? props.tipo,
      situacao_cadastro: STATUS_CAR[String(props.status)] ?? props.status,
      analise_orgao: props.condicao,
      atualizado_sicar: props.atualizado_sicar,
      copiado_pela_arini_em: props.importado_em,
      anuncio: anuncio ? { codigo: anuncio.codigo, titulo: anuncio.titulo, link: `/imovel/${anuncio.codigo}` } : null,
      cruzamento_fontes_oficiais: cruzamento.length ? cruzamento : "Nenhuma consulta feita ainda para esta área. Quem tem o recurso no plano pode consultar na página da área.",
      fontes_nao_consultadas_automaticamente: (fontes ?? []).filter((f) => !f.ativa).map((f) => f.nome),
      link,
      avisos: [
        "O CAR é autodeclarado: não comprova propriedade nem substitui a matrícula.",
        "Resultado \"nada encontrado\" não equivale a certidão negativa.",
      ],
    }),
  };
}

async function buscarConhecimento(e: Record<string, unknown>): Promise<ResultadoFerramenta> {
  const consulta = txt(e.consulta, 300);
  if (!consulta) return { ok: false, fontes: [], conteudo: json({ erro: "Informe o que buscar." }) };
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("fn_kb_buscar", { p_q: consulta, p_limite: 4 });
  if (error) return { ok: false, fontes: [], conteudo: json({ erro: "A base de conhecimento não respondeu agora." }) };
  const achados = (data ?? []) as { id: string; slug: string; titulo: string; trecho: string; fonte: string; data_referencia: string; versao: number }[];
  if (!achados.length) return { ok: true, fontes: [], conteudo: json({ artigos: [], observacao: "Nenhum artigo publicado sobre isso. Não invente: diga que não há informação oficial e sugira falar com a Arini." }) };
  const { data: completos } = await admin.from("kb_artigos").select("id, conteudo").in("id", achados.slice(0, 3).map((a) => a.id));
  const conteudo = new Map((completos ?? []).map((c) => [c.id, String(c.conteudo)]));
  return {
    ok: true,
    fontes: achados.map((a) => ({ tipo: "conhecimento" as const, rotulo: `${a.titulo} (v${a.versao}, ${new Date(a.data_referencia).toLocaleDateString("pt-BR", { timeZone: "UTC" })})` })),
    conteudo: json({
      artigos: achados.map((a) => ({
        titulo: a.titulo, fonte: a.fonte, data_referencia: a.data_referencia, versao: a.versao,
        texto: conteudo.get(a.id)?.slice(0, 3000) ?? a.trecho,
      })),
    }),
  };
}

const EXECUTORES: Record<string, (e: Record<string, unknown>) => Promise<ResultadoFerramenta>> = {
  buscar_imoveis: buscarImoveis,
  detalhes_imovel: detalhesImovel,
  consultar_area_car: consultarAreaCar,
  buscar_conhecimento: buscarConhecimento,
};

/** Executa uma ferramenta. Nunca lança: falha vira resultado com ok=false. */
export async function executarFerramenta(nome: string, entrada: unknown): Promise<ResultadoFerramenta> {
  const fn = EXECUTORES[nome];
  if (!fn) return { ok: false, fontes: [], conteudo: json({ erro: `Ferramenta desconhecida: ${nome}` }) };
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { ok: false, fontes: [], conteudo: json({ erro: "Entrada inválida (esperado um objeto JSON)." }) };
  }
  try {
    return await fn(entrada as Record<string, unknown>);
  } catch (err) {
    console.error(`ferramenta ${nome} falhou:`, err);
    return { ok: false, fontes: [], conteudo: json({ erro: "A consulta falhou agora. Diga ao usuário que tente de novo mais tarde." }) };
  }
}
