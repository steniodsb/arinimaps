export const ETAPAS = [
  "novo_lead", "primeiro_contato", "qualificacao", "em_atendimento",
  "visita_agendada", "visitou", "proposta_enviada", "contraproposta",
  "negociacao", "aceite", "contrato", "fechado", "pos_venda",
] as const;

export type Etapa = (typeof ETAPAS)[number] | "perdido";

export const ETAPA_LABEL: Record<string, string> = {
  novo_lead: "Novo lead", primeiro_contato: "Primeiro contato", qualificacao: "Qualificação",
  em_atendimento: "Em atendimento", visita_agendada: "Visita agendada", visitou: "Visitou",
  proposta_enviada: "Proposta enviada", contraproposta: "Contraproposta", negociacao: "Negociação",
  aceite: "Aceite", contrato: "Contrato", fechado: "Fechado", pos_venda: "Pós-venda", perdido: "Perdido",
};

export const RESPONSAVEL_LABEL: Record<string, string> = {
  arini: "Arini (central)", parceiro: "Parceiro", proprietario: "Proprietário",
};
