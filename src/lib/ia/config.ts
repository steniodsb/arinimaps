import "server-only";

/**
 * Configuração do assistente de IA (PENDÊNCIA 5.1).
 *
 * Sem ANTHROPIC_API_KEY no ambiente o assistente fica INERTE: o botão mostra
 * "Assistente em configuração" e POST /api/ia/chat responde 503 com
 * codigo `ia_desligada` — o resto do site não percebe (mesmo padrão do
 * src/lib/asaas.ts). A chave nunca vai para o navegador.
 *
 * Variáveis (ver deploy/DEPLOY.md):
 *   ANTHROPIC_API_KEY      chave da API (obrigatória para ligar)
 *   ARINI_IA_MODELO        modelo; padrão claude-haiku-5-5 (custo); claude-sonnet-5-5 para respostas mais elaboradas
 *   ARINI_IA_ESFORCO       low | medium | high (padrão low: conversa curta, respostas rápidas)
 *   ARINI_IA_COTACAO_USD   cotação usada só para estimar custo em R$ na Central (padrão abaixo)
 */

// Haiku 5.5 (08/10/2026): ~R$ 0,005 por pergunta contra ~R$ 0,09 do Sonnet 5.5.
// Buscar imóvel, explicar o CAR e responder sobre o sistema não pedem mais que isso.
export const MODELO_PADRAO = "claude-haiku-5-5";

export function iaConfigurada() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function modeloIa() {
  return process.env.ARINI_IA_MODELO?.trim() || MODELO_PADRAO;
}

export function esforcoIa(): "low" | "medium" | "high" {
  const e = process.env.ARINI_IA_ESFORCO?.trim();
  return e === "medium" || e === "high" ? e : "low";
}

/** Limites por conta (além da cota mensal do plano). */
export const LIMITES_IA = {
  porMinuto: 8,
  porHora: 60,
  tamanhoPergunta: 1500,
  historico: 12,
  iteracoesFerramentas: 6,
};

/**
 * Preço por MILHÃO de tokens, em US$. VERIFICAR antes de usar para cobrança:
 * https://platform.claude.com/docs/en/about-claude/pricing — conferidos em
 * 08/10/2026. Haiku 5.5: preço vale para prompts até 100 mil tokens (os nossos
 * têm ~15 mil); acima disso custa 5×. Escrita em cache = 1,25 × entrada; leitura de cache conforme a
 * tabela do provedor. Modelo fora da lista usa o preço do padrão.
 */
export const PRECOS_USD_POR_MTOK: Record<string, { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }> = {
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.1, cacheEscrita: 2.5 },
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
  "claude-haiku-4-5": { entrada: 1, saida: 5, cacheLeitura: 0.1, cacheEscrita: 1.25 },
};

/** Cotação para mostrar custo estimado em R$ (só estimativa — VERIFICAR). */
export function cotacaoDolar() {
  const v = Number(process.env.ARINI_IA_COTACAO_USD);
  return Number.isFinite(v) && v > 0 ? v : 5.4;
}

export type UsoTokens = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number };

export function custoUsd(modelo: string | null | undefined, uso: UsoTokens) {
  const p = PRECOS_USD_POR_MTOK[modelo ?? ""] ?? PRECOS_USD_POR_MTOK[MODELO_PADRAO];
  return (uso.entrada * p.entrada + uso.saida * p.saida + uso.cacheLeitura * p.cacheLeitura + uso.cacheEscrita * p.cacheEscrita) / 1_000_000;
}
