/**
 * Escapa texto para entrar em HTML montado à mão (popup do mapa, etiquetas).
 *
 * Título de anúncio, nome de ponto de interesse e qualquer texto digitado por
 * usuário passam por aqui antes de virar HTML. O sanitizador do MapLibre
 * (`setHTML`) não é barreira: a versão 5 tem falha conhecida de contorno
 * (GHSA-jrc7-96c5-q579, corrigida só na 6) — por isso nada de texto cru.
 */
const MAPA: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escaparHtml(valor: unknown): string {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => MAPA[c]);
}
