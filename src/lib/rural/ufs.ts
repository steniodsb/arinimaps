/**
 * Envelope aproximado de cada UF (graus, SIRGAS 2000), com folga de meio grau.
 *
 * Serve para as fontes que publicam UMA CAMADA POR ESTADO (SICAR, i3geo do
 * INCRA): em vez de perguntar a 27 camadas, pergunta só às UFs cujo envelope
 * encosta no da consulta. A folga garante que uma fazenda na divisa consulte os
 * dois lados — errar para mais custa uma requisição; errar para menos esconderia
 * registro, que é o erro caro num relatório de terra.
 */
const UF_ENVELOPE: Record<string, [number, number, number, number]> = {
  ac: [-74.0, -11.2, -66.6, -7.1], al: [-38.3, -10.5, -35.1, -8.8], ap: [-54.9, -1.3, -49.8, 4.5],
  am: [-73.8, -9.9, -56.1, 2.3], ba: [-46.7, -18.4, -37.3, -8.5], ce: [-41.5, -7.9, -37.2, -2.8],
  df: [-48.3, -16.1, -47.3, -15.5], es: [-41.9, -21.3, -39.6, -17.9], go: [-53.3, -19.5, -45.9, -12.4],
  ma: [-48.8, -10.3, -41.8, -1.0], mt: [-61.7, -18.1, -50.2, -7.3], ms: [-58.2, -24.1, -50.9, -17.2],
  mg: [-51.1, -22.9, -39.8, -14.2], pa: [-58.9, -9.9, -46.0, 2.6], pb: [-38.8, -8.3, -34.8, -6.0],
  pr: [-54.7, -26.8, -48.0, -22.5], pe: [-41.4, -9.5, -32.4, -3.8], pi: [-46.0, -10.9, -40.4, -2.7],
  rj: [-44.9, -23.4, -40.9, -20.7], rn: [-38.6, -7.0, -34.9, -4.8], rs: [-57.7, -33.8, -49.7, -27.1],
  ro: [-66.9, -13.7, -59.8, -7.9], rr: [-64.9, -1.6, -58.9, 5.3], sc: [-53.9, -29.4, -48.3, -25.9],
  sp: [-53.2, -25.4, -44.1, -19.7], se: [-38.3, -11.6, -36.4, -9.5], to: [-50.8, -13.5, -45.7, -5.1],
};

const FOLGA = 0.5;

/** UFs (minúsculas) cujo envelope toca o da consulta. */
export function ufsDoEnvelope(b: { xmin: number; ymin: number; xmax: number; ymax: number }): string[] {
  return Object.entries(UF_ENVELOPE)
    .filter(([, [x0, y0, x1, y1]]) =>
      b.xmin <= x1 + FOLGA && b.xmax >= x0 - FOLGA && b.ymin <= y1 + FOLGA && b.ymax >= y0 - FOLGA)
    .map(([uf]) => uf);
}
