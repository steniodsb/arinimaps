/**
 * Classes da Central (back-office) — tabelas, listas e filtros no padrão do
 * redesign. Arquivo sem dependências para servir tanto a páginas do servidor
 * quanto a componentes "use client" (Painel.tsx importa o Supabase e não pode
 * ir para o navegador).
 */

/** Caixa da tabela: o cartão rola na horizontal, a página não. */
export const TABELA_CAIXA = "cartao overflow-x-auto";
export const TABELA = "w-full text-[0.92rem]";
/** Linha de cabeçalho: caixa alta pequena, espaçada. */
export const THEAD = "border-b border-linha bg-superficie-2/60 text-left";
export const TH = "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-2 whitespace-nowrap";
export const TR = "transition-colors hover:bg-superficie-2/70";
export const TD = "px-4 py-3.5 align-middle";
export const TBODY = "divide-y divide-linha";

/** Lista de linhas clicáveis dentro de um cartão. */
export const LISTA = "cartao overflow-hidden divide-y divide-linha";
export const LINHA_LISTA = "flex items-center gap-4 flex-wrap px-5 py-3.5 text-[0.95rem] transition-colors hover:bg-superficie-2/70";
export const LISTA_VAZIA = "px-5 py-10 text-center text-[0.95rem] text-texto-2";

/** Código de imóvel / identificador. */
export const CODIGO = "font-mono text-xs text-texto-2 tabular-nums";

/** Abas de filtro (link): base + estado. */
export const ABA = "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors";
export const ABA_ATIVA = "border-verde bg-verde/12 text-verde";
export const ABA_INATIVA = "border-linha bg-superficie text-texto-2 hover:border-linha-forte hover:text-texto";
export const aba = (ativa: boolean) => `${ABA} ${ativa ? ABA_ATIVA : ABA_INATIVA}`;

/** Link de ação de seção ("Ver todos"). */
export const LINK_ACAO = "inline-flex items-center gap-1.5 text-sm font-semibold text-verde hover:underline underline-offset-4";

/** Campo compacto (filtros e edição em linha, onde CAMPO seria grande demais). */
export const CAMPO_COMPACTO =
  "rounded-lg border border-linha-forte bg-superficie-2 px-3 py-2 text-sm text-texto placeholder:text-texto-2/70 transition focus:border-verde focus:outline-none focus:ring-2 focus:ring-verde/30";

