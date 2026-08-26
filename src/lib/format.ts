export function formatBRL(v: number | null | undefined) {
  if (v == null) return "Sob consulta";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Área amigável: rural em ha (e alqueires), urbano em m². */
export function formatArea(areaM2: number | null | undefined, tipo: "urbano" | "rural") {
  if (!areaM2) return "—";
  if (tipo === "rural") {
    const ha = areaM2 / 10000;
    const alq = ha / 4.84; // alqueire mineiro
    return `${ha.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha (${alq.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} alq.)`;
  }
  return `${areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²`;
}

export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", pendente: "Pendente", em_analise: "Em análise",
  correcao: "Aguardando correção", aprovado: "Aprovado", publicado: "Publicado",
  em_negociacao: "Em negociação", vendido: "Vendido", historico: "Histórico",
  suspenso: "Suspenso", inativo: "Inativo", reprovado: "Reprovado",
};
