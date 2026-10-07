/**
 * Planos por nicho — o registro do que existe (pedido do Carlos, 05/10/2026).
 *
 * Três eixos, cada um numa coluna de `profiles`:
 *  · papel  (`role`)  — o que a pessoa FAZ no fluxo: src/lib/perfis.ts;
 *  · nicho  (`nicho`) — o segmento comercial da conta, vindo das personas do
 *                       Fluxograma Mestre (NICHOS, abaixo);
 *  · plano  (`plan_id`) — o pacote de RECURSOS e COTAS que a conta tem.
 *
 * O que cada plano libera mora no banco (tabela `plans`, editável pela
 * Diretoria em /admin/planos). O que cada recurso SIGNIFICA mora aqui: um
 * recurso novo = uma entrada em RECURSOS + a trava no servidor (`exigirRecurso`)
 * + a tela escondendo o botão. A equipe da Matriz tem todos os recursos pelo
 * papel, sem plano.
 *
 * Regra herdada do CRM: quem manda é o servidor, não a tela. Esconder um botão
 * é conveniência; `exigirRecurso` em src/lib/planos-servidor.ts é a trava.
 */

export type RecursoId =
  | "mapa" | "ficha_basica" | "interesse" | "camada_car" | "camada_lotes" | "ferramenta_medir"
  | "solicitacao_cartografica"
  | "camadas_oficiais" | "consulta_area" | "relatorio_territorial" | "ferramenta_kml" | "ferramenta_exportar"
  | "historico_imovel" | "pre_avaliacao" | "chat_ia"
  | "anunciar" | "painel_parceiro" | "oportunidades"
  | "multiusuario" | "api_dados" | "territorio";

export type Recurso = {
  id: RecursoId;
  nome: string;
  descricao: string;
  grupo: "consulta" | "ferramentas" | "profissional" | "anuncios" | "organizacao";
  /** ainda não há tela/rota que use: fica reservado no plano até existir */
  reservado?: boolean;
};

export const RECURSOS: Recurso[] = [
  // consulta básica
  { id: "mapa", nome: "Mapa e imóveis publicados", descricao: "Navegar no mapa regional e ver os anúncios aprovados.", grupo: "consulta" },
  { id: "ficha_basica", nome: "Ficha do imóvel", descricao: "Página pública do anúncio com fotos, área medida e pontos de interesse.", grupo: "consulta" },
  { id: "interesse", nome: "Demonstrar interesse", descricao: "Pedir informação ou visita; vira lead na central da Arini.", grupo: "consulta" },
  { id: "camada_car", nome: "Divisas do CAR", descricao: "Malha dos imóveis rurais (SICAR) sobre o satélite.", grupo: "consulta" },
  { id: "camada_lotes", nome: "Lotes urbanos", descricao: "Lotes clicáveis das plantas das cidades, com metragens.", grupo: "consulta" },
  { id: "ferramenta_medir", nome: "Medir área e distância", descricao: "Medição geodésica direto no mapa.", grupo: "ferramentas" },
  { id: "solicitacao_cartografica", nome: "Informar imóvel ausente ou divergente", descricao: "Abrir protocolo para a equipe de cartografia incluir ou corrigir uma área.", grupo: "consulta" },
  // consulta profissional
  { id: "camadas_oficiais", nome: "Camadas oficiais no mapa", descricao: "Terras indígenas, embargos, mineração, desmatamento e demais fontes ao vivo.", grupo: "profissional" },
  { id: "consulta_area", nome: "Consulta de área", descricao: "Cruzar com as fontes oficiais (CAR, SIGEF, IBAMA, ANM, INPE, ANA…) uma área do CAR, um lote urbano ou uma área desenhada em qualquer ponto do Brasil. Sujeita a cota mensal.", grupo: "profissional" },
  { id: "relatorio_territorial", nome: "Relatório territorial completo", descricao: "Relatório consolidado do imóvel com todas as fontes e o detalhe de cada item.", grupo: "profissional" },
  { id: "ferramenta_kml", nome: "Importar KML/KMZ", descricao: "Sobrepor um arquivo próprio ao mapa.", grupo: "ferramentas" },
  { id: "ferramenta_exportar", nome: "Imprimir e capturar", descricao: "Imprimir o mapa ou salvar a imagem da tela.", grupo: "ferramentas" },
  { id: "historico_imovel", nome: "Histórico e versões", descricao: "Ver as versões da divisa, a origem dos dados e o histórico do imóvel.", grupo: "profissional" },
  { id: "pre_avaliacao", nome: "Pré-avaliação de valor", descricao: "Estimativa automatizada por comparáveis e aptidão territorial (aparece quando a Diretoria liga a função).", grupo: "profissional" },
  { id: "chat_ia", nome: "Assistente de IA", descricao: "Perguntas em linguagem natural sobre imóveis publicados, áreas do CAR e a base de conhecimento. Cota mensal nos planos gratuitos.", grupo: "consulta" },
  // anúncios
  { id: "anunciar", nome: "Anunciar imóvel", descricao: "Cadastrar imóvel para análise e publicação pela Matriz.", grupo: "anuncios" },
  { id: "painel_parceiro", nome: "Painel do parceiro", descricao: "Carteira de imóveis de terceiros e atendimento das oportunidades encaminhadas.", grupo: "anuncios" },
  { id: "oportunidades", nome: "Oportunidades", descricao: "Acompanhar visitas, propostas e negociações dos próprios imóveis.", grupo: "anuncios" },
  // organização
  { id: "multiusuario", nome: "Vários usuários", descricao: "Contas de uma mesma organização compartilhando o plano: o administrador convida e remove membros em /painel/organizacao.", grupo: "organizacao" },
  { id: "api_dados", nome: "Acesso a dados", descricao: "Exportação e integração de dados (reservado).", grupo: "organizacao", reservado: true },
  { id: "territorio", nome: "Território de franquia", descricao: "Operar dentro da região da franquia.", grupo: "organizacao" },
];

export const RECURSO_IDS = RECURSOS.map((r) => r.id);
export const recursoPorId = (id: string) => RECURSOS.find((r) => r.id === id) ?? null;

export const GRUPO_RECURSO_LABEL: Record<Recurso["grupo"], string> = {
  consulta: "Consulta", ferramentas: "Ferramentas do mapa", profissional: "Consulta profissional",
  anuncios: "Anúncios e negociação", organizacao: "Organização e território",
};

/** Cotas que um plano pode limitar. Ausente no plano = sem limite. */
export const COTAS: { id: string; nome: string; ajuda: string }[] = [
  { id: "consultas_area_mes", nome: "Consultas de área por mês", ajuda: "Cruzamentos com as fontes oficiais por conta, no mês corrente." },
  { id: "imoveis_ativos", nome: "Imóveis ativos", ajuda: "Anúncios em análise ou publicados ao mesmo tempo." },
  { id: "mensagens_ia_mes", nome: "Mensagens ao assistente de IA por mês", ajuda: "Perguntas enviadas ao assistente por conta, no mês corrente." },
];

export type NichoId =
  | "consulta" | "comprador_investidor" | "proprietario" | "produtor_rural" | "corretor_imobiliaria"
  | "leiloeiro" | "engenheiro" | "empresa_holding" | "ente_publico" | "franqueado";

export type Nicho = {
  id: NichoId;
  nome: string;
  descricao: string;
  /** papéis que podem estar neste nicho (o primeiro é o sugerido no cadastro) */
  papeis: string[];
  /** a pessoa pode escolher no cadastro? franqueado e organização são definidos pela Matriz */
  escolhivel: boolean;
  /** persona do fluxograma sem fluxo próprio definido ainda */
  reservado?: boolean;
};

/** Personas do Fluxograma Mestre (05/10/2026) como nichos comerciais. */
export const NICHOS: Nicho[] = [
  { id: "consulta", nome: "Consulta", descricao: "Só pesquisa o mapa e as informações.", papeis: ["consulta"], escolhivel: true },
  { id: "comprador_investidor", nome: "Comprador / investidor", descricao: "Procura imóvel para comprar ou investir.", papeis: ["comprador"], escolhivel: true },
  { id: "proprietario", nome: "Proprietário / vendedor", descricao: "Quer anunciar o próprio imóvel.", papeis: ["proprietario"], escolhivel: true },
  { id: "produtor_rural", nome: "Produtor rural", descricao: "Consulta e gere as próprias áreas rurais.", papeis: ["proprietario", "consulta"], escolhivel: true, reservado: true },
  { id: "corretor_imobiliaria", nome: "Corretor / imobiliária", descricao: "Anuncia imóveis de terceiros e atende oportunidades.", papeis: ["corretor", "imobiliaria"], escolhivel: true },
  { id: "leiloeiro", nome: "Leiloeiro", descricao: "Publica imóveis de leilão.", papeis: ["leiloeiro"], escolhivel: true },
  { id: "engenheiro", nome: "Engenheiro / profissional técnico", descricao: "Consulta profissional e laudos.", papeis: ["engenheiro"], escolhivel: true },
  { id: "empresa_holding", nome: "Empresa / holding", descricao: "Organização com vários usuários.", papeis: ["consulta", "comprador", "proprietario"], escolhivel: false, reservado: true },
  { id: "ente_publico", nome: "Prefeitura / ente público", descricao: "Gestão urbana e parcerias.", papeis: ["consulta"], escolhivel: false, reservado: true },
  { id: "franqueado", nome: "Franqueado", descricao: "Opera o território de uma franquia da Arini.", papeis: ["franqueado"], escolhivel: false },
];

export const NICHO_IDS = NICHOS.map((n) => n.id);
export const nichoPorId = (id: string | null | undefined) => NICHOS.find((n) => n.id === id) ?? null;
export const NICHO_LABEL: Record<string, string> = Object.fromEntries(NICHOS.map((n) => [n.id, n.nome]));

/** Nichos que a pessoa pode escolher ao criar a conta com este papel. */
export const nichosDoPapel = (role: string) => NICHOS.filter((n) => n.escolhivel && n.papeis.includes(role));

/** Nicho que o papel recebe quando ninguém escolhe (espelha fn_nicho_padrao no banco). */
export function nichoPadrao(role: string): NichoId | null {
  return (NICHOS.find((n) => n.papeis[0] === role) ?? NICHOS.find((n) => n.papeis.includes(role)))?.id ?? null;
}

export type Plano = {
  id: string;
  nome: string;
  descricao: string;
  nichos_padrao: string[];
  recursos: string[];
  cotas: Record<string, number>;
  preco_mensal: number;
  periodicidade: "gratis" | "mensal" | "anual";
  escopo: "conta" | "organizacao";
  destaque: boolean;
  ativo: boolean;
  ordem: number;
};

/** O que a conta pode, já resolvido (plano + papel). */
export type Acesso = {
  planId: string | null;
  planNome: string | null;
  nicho: string | null;
  /** plano vencido (plan_valido_ate no passado): volta ao padrão do nicho */
  vencido: boolean;
  recursos: Set<string>;
  cotas: Record<string, number>;
  /** equipe da Matriz: tudo liberado pelo papel */
  equipe: boolean;
};

export const PAPEIS_EQUIPE_IDS = ["admin_central", "analista_arini"];

/** Conta sem sessão: o que o visitante vê. */
export const ACESSO_VISITANTE: Acesso = {
  planId: null, planNome: null, nicho: null, vencido: false, equipe: false, cotas: {},
  recursos: new Set(["mapa", "ficha_basica", "interesse", "camada_car", "camada_lotes", "ferramenta_medir"]),
};

/** Monta o acesso a partir do papel e do plano carregado do banco. */
export function montarAcesso(role: string | null | undefined, plano: Plano | null, nicho: string | null, validoAte: string | null): Acesso {
  if (role && PAPEIS_EQUIPE_IDS.includes(role)) {
    return { planId: null, planNome: "Matriz", nicho: null, vencido: false, equipe: true, cotas: {}, recursos: new Set(RECURSO_IDS) };
  }
  const vencido = !!validoAte && new Date(validoAte).getTime() < Date.now();
  if (!plano || vencido) {
    return { ...ACESSO_VISITANTE, planId: plano?.id ?? null, planNome: plano?.nome ?? null, nicho, vencido,
      recursos: new Set([...ACESSO_VISITANTE.recursos, "solicitacao_cartografica"]) };
  }
  return {
    planId: plano.id, planNome: plano.nome, nicho, vencido: false, equipe: false,
    cotas: plano.cotas ?? {},
    recursos: new Set(plano.recursos),
  };
}

export const temRecurso = (a: Acesso | null | undefined, recurso: RecursoId) => !!a?.recursos.has(recurso);

export const PERIODICIDADE_LABEL: Record<string, string> = { gratis: "Gratuito", mensal: "por mês", anual: "por ano" };
export const PLAN_ORIGEM_LABEL: Record<string, string> = { padrao: "Padrão do nicho", manual: "Definido pela Matriz", assinatura: "Assinatura" };
