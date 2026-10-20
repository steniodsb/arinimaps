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

export const CONTRATO_LABEL: Record<string, string> = {
  em_elaboracao: "Em elaboração", assinado: "Assinado", registrado: "Registrado",
};

/**
 * Eventos antigos da linha do tempo foram gravados com os códigos internos
 * ("Etapa: novo_lead → qualificacao", "Contrato: em_elaboracao", código
 * ARINI-MAP-…). Na tela viram rótulos; os novos já são gravados em português.
 */
export function humanizarEvento(texto: string): string {
  const rotulo = (c: string) => ETAPA_LABEL[c] ?? CONTRATO_LABEL[c] ?? RESPONSAVEL_LABEL[c] ?? c;
  return texto
    .replace(/^Etapa: ([a-z_]+) → ([a-z_]+)$/, (_, a: string, b: string) => `Etapa: ${rotulo(a)} → ${rotulo(b)}`)
    .replace(/^Contrato: ([a-z_]+)$/, (_, s: string) => `Contrato: ${rotulo(s).toLowerCase()}`)
    .replace(/^Encaminhada para ([a-z_]+)$/, (_, r: string) => `Encaminhada para ${rotulo(r)}`)
    .replace(/\bARINI-MAP-(\d{6})\b/g, "AIB-$1");
}

/** De onde veio o interessado (coluna `leads.origem`). */
export const LEAD_ORIGEM_LABEL: Record<string, string> = {
  pagina: "Página do imóvel", whatsapp: "WhatsApp", mapa: "Mapa", indicacao: "Indicação",
};
