import type { StatusSolicitacao } from "@/lib/cartografia/solicitacoes";

type Tom = "verde" | "ouro" | "alerta" | "critico" | "neutro";

/** Tom da `Etiqueta` de cada status de solicitação cartográfica (mesma leitura das cores da Central). */
export const TOM_SOLICITACAO: Record<StatusSolicitacao, Tom> = {
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
