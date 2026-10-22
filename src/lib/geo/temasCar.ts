/** Temas das camadas do CAR que a importação manual aceita (migration 0050). */
export const TEMAS_CAR = {
  area_imovel: "Área do imóvel",
  app: "Área de preservação permanente (APP)",
  reserva_legal: "Reserva legal",
  vegetacao_nativa: "Vegetação nativa",
  area_consolidada: "Área consolidada",
  uso_restrito: "Uso restrito",
  servidao_administrativa: "Servidão administrativa",
  hidrografia: "Hidrografia",
  area_pousio: "Área de pousio",
} as const;
export type TemaCar = keyof typeof TEMAS_CAR;

/** Situação de uma importação (car_importacoes.status) para a tela. */
export const ROTULO_STATUS: Record<string, { texto: string; tom: "verde" | "alerta" | "critico" | "neutro" | "ouro" }> = {
  concluida: { texto: "concluída", tom: "verde" },
  com_falhas: { texto: "concluída com falhas", tom: "alerta" },
  falhou: { texto: "nada gravado", tom: "critico" },
  enviando: { texto: "em envio / interrompida", tom: "ouro" },
  descartada: { texto: "descartada", tom: "neutro" },
};
