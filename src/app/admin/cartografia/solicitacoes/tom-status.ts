import type { StatusSolicitacao } from "@/lib/cartografia/solicitacoes";

/**
 * Tom da `Etiqueta` para cada status da fila cartográfica. Substitui as
 * classes soltas de `STATUS_SOLICITACAO_COR` na tela (a laranja clara não
 * funcionava no tema escuro); a ordem de cores segue a mesma ideia:
 * ouro = chegou, alerta = parado/esperando, verde = andando, crítico = recusa.
 */
export const TOM_STATUS: Record<StatusSolicitacao, "verde" | "ouro" | "alerta" | "critico" | "neutro"> = {
  recebida: "ouro",
  em_triagem: "alerta",
  em_analise: "alerta",
  aguardando_documentacao: "alerta",
  em_vetorizacao: "verde",
  em_revisao: "verde",
  aprovada: "verde",
  publicada: "verde",
  rejeitada: "critico",
  cancelada: "neutro",
};
