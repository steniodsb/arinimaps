/**
 * Códigos internos (ações de auditoria, nomes de coluna) mostrados na tela.
 * Antes iam com o `_` trocado por espaço: "revisao aprovada", "documento nova
 * versao", "valor: 521000", "record: false" (QA 19/10/2026).
 */

/** Ações com nome próprio; o resto passa pelo `humanizarCodigo`. */
const ACOES: Record<string, string> = {
  revisao_proposta: "Alteração proposta pelo anunciante",
  revisao_aprovada: "Alteração aprovada pela Matriz",
  revisao_rejeitada: "Alteração rejeitada pela Matriz",
  revisao_cancelada: "Alteração cancelada pelo anunciante",
  geometria_validada: "Divisa validada",
  lead_criado: "Novo interessado",
  venda_registrada: "Venda registrada",
  visita_agendada: "Visita agendada",
  proposta_registrada: "Proposta registrada",
  video_anexado: "Vídeo anexado",
  video_removido: "Vídeo removido",
  visualizacao: "Visualização",
  visualizar: "Visualização",
  upload: "Arquivo enviado",
  estimado: "Pré-avaliação calculada",
  dados_insuficientes: "Pré-avaliação sem dados suficientes",
  pois_enfileirar: "Pontos de referência pedidos",
  pois_atualizar: "Pontos de referência atualizados",
};

/** Palavras que o código guarda sem acento. */
const ACENTOS: Record<string, string> = {
  revisao: "revisão", versao: "versão", solicitacao: "solicitação", cartografica: "cartográfica",
  visualizacao: "visualização", alteracao: "alteração", organizacao: "organização", retencao: "retenção",
  usuario: "usuário", video: "vídeo", criacao: "criação", geometria: "geometria", proprietario: "proprietário",
  imovel: "imóvel", comissao: "comissão", aprovacao: "aprovação", reprovacao: "reprovação", situacao: "situação",
  descricao: "descrição", titulo: "título", area: "área", perimetro: "perímetro", municipio: "município",
  codigo: "código", numero: "número", publicacao: "publicação", conclusao: "conclusão", analise: "análise",
  documentacao: "documentação", inclusao: "inclusão", exclusao: "exclusão", correcao: "correção",
  midia: "mídia", senha: "senha", mensagem: "mensagem", equipe: "equipe", acao: "ação", observacao: "observação",
};

export function humanizarCodigo(codigo: string): string {
  if (ACOES[codigo]) return ACOES[codigo];
  const t = codigo.split("_").map((p) => ACENTOS[p] ?? p).join(" ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// campos técnicos que não dizem nada a quem lê a trilha
const OCULTOS = new Set(["id", "record", "user_id", "property_id", "owner_id", "created_at", "updated_at", "storage_path", "path", "hash"]);
const MOEDA = new Set(["valor", "valor_final", "valor_mensal", "preco", "comissao_valor"]);

/** "Valor: R$ 521.000 · Título: Chácara Bela Vista" (até `max` campos simples). */
export function resumoCampos(dados: Record<string, unknown> | null | undefined, max = 4): string {
  if (!dados || typeof dados !== "object") return "";
  return Object.entries(dados)
    .filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .slice(0, max)
    .map(([k, v]) => {
      let valor: string;
      if (typeof v === "boolean") valor = v ? "sim" : "não";
      else if (MOEDA.has(k) && Number.isFinite(Number(v))) valor = Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
      else if (typeof v === "string" && /^[a-z]+(_[a-z]+)+$/.test(v)) valor = humanizarCodigo(v).toLowerCase();
      else valor = String(v).slice(0, 60);
      return `${humanizarCodigo(k)}: ${valor}`;
    })
    .join(" · ");
}
