/**
 * Camadas oficiais desenhadas no mapa (08/10/2026) — a parte que o navegador
 * também usa: nome, cor, zoom mínimo e como cada feição vira linha de cartão.
 * A busca nos órgãos fica no servidor (src/lib/geo/camadasMapa.ts).
 *
 * Todas pertencem ao recurso `camadas_oficiais` (plano profissional para cima).
 * `zoomMin` é onde a camada passa a ser pedida: SIGEF e desmatamento são
 * milhares de polígonos pequenos, só fazem sentido de perto; terras indígenas
 * e unidades de conservação são grandes e aparecem já na visão regional.
 */
export type CamadaOficialId =
  | "sigef" | "ibama_embargos" | "anm" | "funai" | "ucs" | "quilombolas" | "prodes_cerrado" | "inpe_queimadas";

export type CamadaOficial = {
  id: CamadaOficialId;
  nome: string;
  orgao: string;
  grupo: "Fundiário" | "Ambiental" | "Infraestrutura";
  cor: string;
  zoomMin: number;
  /** focos de calor são pontos; o resto, polígonos */
  ponto?: boolean;
  /** o que essa camada significa para quem negocia terra */
  ajuda: string;
};

export const CAMADAS_OFICIAIS: CamadaOficial[] = [
  { id: "sigef", nome: "Parcelas certificadas (SIGEF)", orgao: "INCRA", grupo: "Fundiário", cor: "#5BC0EB", zoomMin: 12,
    ajuda: "Imóveis com georreferenciamento certificado pelo INCRA." },
  { id: "funai", nome: "Terras indígenas", orgao: "FUNAI", grupo: "Fundiário", cor: "#E4572E", zoomMin: 7,
    ajuda: "Área indígena: compra e venda vedadas." },
  { id: "quilombolas", nome: "Territórios quilombolas", orgao: "INCRA", grupo: "Fundiário", cor: "#F3A712", zoomMin: 7,
    ajuda: "Território em reconhecimento ou titulado." },
  { id: "ibama_embargos", nome: "Áreas embargadas", orgao: "IBAMA", grupo: "Ambiental", cor: "#FF4D6D", zoomMin: 9,
    ajuda: "Embargo ambiental: a área não pode ser usada até a regularização." },
  { id: "ucs", nome: "Unidades de conservação (Cerrado)", orgao: "MMA/INPE", grupo: "Ambiental", cor: "#3FCF7F", zoomMin: 7,
    ajuda: "Uso restrito conforme a categoria da unidade." },
  { id: "prodes_cerrado", nome: "Desmatamento (PRODES Cerrado)", orgao: "INPE", grupo: "Ambiental", cor: "#C77DFF", zoomMin: 12,
    ajuda: "Supressão de vegetação detectada por satélite, por ano." },
  { id: "inpe_queimadas", nome: "Focos de queimada (12 meses)", orgao: "INPE", grupo: "Ambiental", cor: "#FF7B00", zoomMin: 9, ponto: true,
    ajuda: "Focos de calor detectados por satélite no último ano." },
  { id: "anm", nome: "Processos minerários", orgao: "ANM", grupo: "Infraestrutura", cor: "#B8B8B8", zoomMin: 9,
    ajuda: "Pedido ou direito de pesquisa e lavra mineral sobre a área." },
];

export const camadaOficialPorId = (id: string) => CAMADAS_OFICIAIS.find((c) => c.id === id);

/** Linha do cartão do clique: título e detalhe a partir das propriedades já enxutas pelo servidor. */
export function descreverFeicao(id: CamadaOficialId, p: Record<string, unknown>): { titulo: string; detalhe: string } {
  const s = (v: unknown) => (v == null || v === "" ? "" : String(v));
  const ha = (v: unknown) => (Number(v) > 0 ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha` : "");
  const junta = (...xs: string[]) => xs.filter(Boolean).join(" · ");
  switch (id) {
    case "sigef":
      return { titulo: s(p.nome) || "Parcela certificada", detalhe: junta(s(p.situacao), s(p.natureza), s(p.certificada_em) && `certificada em ${s(p.certificada_em)}`) };
    case "ibama_embargos":
      return { titulo: `Embargo ${s(p.termo)}`, detalhe: junta(s(p.data) && `embargado em ${s(p.data)}`, ha(p.area_ha), s(p.infracao)) };
    case "anm":
      return { titulo: `${s(p.substancia) || "Processo minerário"} — ${s(p.fase)}`, detalhe: junta(s(p.processo), s(p.uso), ha(p.area_ha)) };
    case "funai":
      return { titulo: s(p.nome) || "Terra indígena", detalhe: junta(s(p.fase), s(p.etnia)) };
    case "ucs":
      return { titulo: s(p.nome) || "Unidade de conservação", detalhe: junta(s(p.categoria), s(p.esfera)) };
    case "quilombolas":
      return { titulo: s(p.nome) || "Território quilombola", detalhe: junta(s(p.municipio), s(p.fase)) };
    case "inpe_queimadas":
      return { titulo: "Foco de queimada", detalhe: junta(s(p.data) && `detectado em ${s(p.data)}`, s(p.satelite)) };
    case "prodes_cerrado":
      return { titulo: `Desmatamento ${s(p.ano)}`, detalhe: junta(ha(p.area_ha), "PRODES Cerrado") };
  }
}
