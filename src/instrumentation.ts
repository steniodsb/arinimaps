/**
 * Fuso do servidor = horário de Brasília (QA 19/10/2026).
 *
 * A Vercel roda em UTC: toda data formatada no servidor sem `timeZone` saía 3 h
 * adiantada (visita das 20:30 aparecia 23:30; perto da meia-noite, o dia virava).
 * São ~85 pontos que formatam com `toLocale*String` — fixar o fuso do processo
 * aqui conserta todos de uma vez e vale também para a VPS. O Node relê o TZ
 * quando a variável muda, então basta definir antes do primeiro pedido.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "America/Sao_Paulo";
  }
}
