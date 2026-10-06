/**
 * Solicitações cartográficas (requisitos §2, Carlos, 05/10/2026): "não
 * encontrei meu imóvel no mapa" e "o mapa está divergente".
 *
 * Rótulos, cores e a máquina de status, num lugar só, para o formulário
 * público, o painel do solicitante e a fila da Matriz falarem a mesma língua.
 * Sem "server-only": o cliente também usa.
 *
 * As transições são as MESMAS do trigger fn_cart_request_transition
 * (migration 0029) — o banco é quem manda; aqui é só para desenhar os botões.
 */

export const TIPOS_SOLICITACAO = [
  "inclusao", "correcao_geometria", "divergencia", "atualizacao_area", "desmembramento",
  "unificacao", "sobreposicao", "erro_localizacao", "outro",
] as const;
export type TipoSolicitacao = (typeof TIPOS_SOLICITACAO)[number];

export const TIPO_SOLICITACAO_LABEL: Record<TipoSolicitacao, string> = {
  inclusao: "Inclusão de imóvel não cartografado",
  correcao_geometria: "Correção de geometria",
  divergencia: "Divergência cartográfica",
  atualizacao_area: "Atualização de área",
  desmembramento: "Desmembramento não representado",
  unificacao: "Unificação",
  sobreposicao: "Sobreposição/conflito",
  erro_localizacao: "Erro de localização",
  outro: "Outros",
};

export const STATUS_SOLICITACAO = [
  "recebida", "em_triagem", "em_analise", "aguardando_documentacao", "em_vetorizacao",
  "em_revisao", "aprovada", "publicada", "rejeitada", "cancelada",
] as const;
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

export const STATUS_SOLICITACAO_LABEL: Record<StatusSolicitacao, string> = {
  recebida: "Recebida",
  em_triagem: "Em triagem",
  em_analise: "Em análise",
  aguardando_documentacao: "Aguardando documentação",
  em_vetorizacao: "Em vetorização/correção",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  publicada: "Publicada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

/** Classes do selo de status. */
export const STATUS_SOLICITACAO_COR: Record<StatusSolicitacao, string> = {
  recebida: "bg-ouro/15 text-ouro",
  em_triagem: "bg-alerta/15 text-alerta",
  em_analise: "bg-alerta/15 text-alerta",
  aguardando_documentacao: "bg-orange-100 text-orange-900",
  em_vetorizacao: "bg-verde/10 text-verde",
  em_revisao: "bg-verde/10 text-verde",
  aprovada: "bg-verde/15 text-verde",
  publicada: "bg-verde text-white",
  rejeitada: "bg-critico/15 text-critico",
  cancelada: "bg-superficie-2 text-texto-2",
};

/** Para onde cada status pode ir (espelho do trigger do banco). */
export const TRANSICOES: Record<StatusSolicitacao, StatusSolicitacao[]> = {
  recebida: ["em_triagem", "rejeitada", "cancelada"],
  em_triagem: ["em_analise", "aguardando_documentacao", "rejeitada", "cancelada"],
  em_analise: ["aguardando_documentacao", "em_vetorizacao", "em_revisao", "rejeitada", "cancelada"],
  aguardando_documentacao: ["em_analise", "rejeitada", "cancelada"],
  em_vetorizacao: ["em_revisao", "em_analise"],
  em_revisao: ["aprovada", "em_vetorizacao", "rejeitada"],
  aprovada: ["publicada", "em_revisao"],
  rejeitada: ["em_triagem"],
  publicada: [],
  cancelada: [],
};

/** Status que contam como "em aberto" na fila da Matriz. */
export const STATUS_ABERTOS: StatusSolicitacao[] = [
  "recebida", "em_triagem", "em_analise", "aguardando_documentacao", "em_vetorizacao", "em_revisao",
];
/** Status finais: a solicitação não anda mais. */
export const STATUS_ENCERRADOS: StatusSolicitacao[] = ["publicada", "rejeitada", "cancelada"];
/** O solicitante ainda pode cancelar nestes status. */
export const STATUS_CANCELAVEIS: StatusSolicitacao[] = ["recebida", "em_triagem", "aguardando_documentacao"];

export const ARQUIVOS_ACEITOS = {
  extensoes: ["kml", "kmz", "pdf", "png", "jpg", "jpeg", "webp", "dxf", "zip"],
  accept: ".kml,.kmz,.pdf,.png,.jpg,.jpeg,.webp,.dxf,.zip",
  maxBytes: 25 * 1024 * 1024,
  maxMB: 25,
  maxQuantidade: 8,
  descricao: "KML, KMZ, PDF, imagem (PNG/JPG/WebP), DXF ou ZIP — até 25 MB cada, no máximo 8 arquivos.",
};

export type ArquivoSolicitacao = { nome: string; path: string; tipo: string; bytes: number };

export const ehStatusSolicitacao = (s: unknown): s is StatusSolicitacao =>
  typeof s === "string" && (STATUS_SOLICITACAO as readonly string[]).includes(s);
export const ehTipoSolicitacao = (s: unknown): s is TipoSolicitacao =>
  typeof s === "string" && (TIPOS_SOLICITACAO as readonly string[]).includes(s);

export const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
