/**
 * Cenas do mapa-vitrine da página inicial. Fica num módulo próprio, sem
 * MapLibre, porque a seção precisa das legendas antes de o mapa carregar —
 * e importar o componente do mapa aqui puxaria o chunk dele para a home.
 */
export type CenaVitrine = {
  id: "rural" | "urbano" | "regional";
  /** [lng, lat] onde a cena começa. */
  centro: [number, number];
  zoom: number;
  /** Quanto a câmera desliza (em graus) durante o passeio lento pela cena. */
  deriva: [number, number];
  legenda: string;
};

export const CENAS: CenaVitrine[] = [
  {
    id: "rural",
    centro: [-50.21, -19.73],
    zoom: 12.5,
    deriva: [0.024, -0.006],
    legenda: "Imóveis rurais do CAR sobre o satélite",
  },
  {
    id: "urbano",
    centro: [-50.196, -19.728],
    zoom: 16,
    deriva: [0.002, -0.0008],
    legenda: "Lotes urbanos de Iturama, lote a lote",
  },
  {
    id: "regional",
    // centro aproximado do Pontal do Triângulo Mineiro, para caber os seis municípios
    centro: [-50.15, -19.62],
    zoom: 9.5,
    deriva: [0.16, 0.04],
    legenda: "Seis municípios do Pontal",
  },
];
