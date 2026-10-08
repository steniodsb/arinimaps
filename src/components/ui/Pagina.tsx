/**
 * Kit de página do sistema (redesign de 08/10/2026), com a cara da página
 * inicial: títulos grandes em Urbanist, linha de topo em texto (nunca em
 * formato de botão), espaçamento generoso, cartões com canto de 20 px e
 * faixa escura em malha para o topo das páginas públicas.
 *
 * Sem animação de rolagem de propósito: o sistema é ferramenta de trabalho.
 * Use estes componentes em vez de montar títulos e cartões à mão — é o que
 * mantém as 60 telas iguais.
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/** Largura e respiro padrão (o mesmo da landing: 1280 px, 20/32 px de lado). */
export function Conteudo({ children, className = "", estreito = false }: {
  children: React.ReactNode; className?: string; estreito?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${estreito ? "max-w-4xl" : "max-w-[1280px]"} px-5 md:px-8 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Topo de página.
 *  · `faixa`  — páginas públicas: faixa escura em malha de ponta a ponta, título grande.
 *  · `simples` — painel e Central: só o título, sem faixa, dentro do conteúdo.
 */
export function CabecalhoPagina({
  eyebrow, titulo, destaque, subtitulo, acoes, variante = "simples", children,
}: {
  eyebrow?: string;
  titulo: string;
  /** trecho final do título em verde (ex.: titulo="Encontre seu" destaque="imóvel") */
  destaque?: string;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  variante?: "faixa" | "simples";
  /** conteúdo extra dentro da faixa (busca, filtros, números) */
  children?: React.ReactNode;
}) {
  const corpo = (
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl min-w-0">
        {eyebrow && <p className="lp-eyebrow">{eyebrow}</p>}
        <h1 className={`lp-display ${eyebrow ? "mt-3" : ""} ${variante === "faixa" ? "text-4xl md:text-[3.25rem]" : "text-3xl md:text-[2.5rem]"} text-texto text-balance`}>
          {titulo}{destaque && <> <span className="text-verde">{destaque}</span></>}
        </h1>
        {subtitulo && (
          <p className={`mt-4 leading-relaxed text-texto-2 ${variante === "faixa" ? "text-lg md:text-xl" : "text-base md:text-lg"}`}>
            {subtitulo}
          </p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap gap-3 shrink-0">{acoes}</div>}
    </div>
  );

  if (variante === "simples") {
    return <header className="mb-8 md:mb-10">{corpo}</header>;
  }
  return (
    <header className="lp-escuro lp-malha-escura relative overflow-hidden">
      <div className="lp-grade pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <Conteudo className="relative pt-16 pb-12 md:pt-20 md:pb-16">
        {corpo}
        {children && <div className="mt-8">{children}</div>}
      </Conteudo>
    </header>
  );
}

/** Seção com título no padrão do site (h2 grande, linha de topo opcional, ação à direita). */
export function Secao({
  eyebrow, titulo, subtitulo, acao, children, className = "",
}: {
  eyebrow?: string; titulo?: string; subtitulo?: React.ReactNode; acao?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`space-y-5 ${className}`}>
      {(titulo || acao) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="lp-eyebrow text-xs">{eyebrow}</p>}
            {titulo && <h2 className={`lp-display text-2xl md:text-[1.75rem] text-texto ${eyebrow ? "mt-2" : ""}`}>{titulo}</h2>}
            {subtitulo && <p className="mt-1.5 text-base text-texto-2 max-w-3xl">{subtitulo}</p>}
          </div>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

/** Cartão padrão. `href` vira link com o efeito de subir. */
export function Cartao({ children, className = "", href, padding = "p-6" }: {
  children: React.ReactNode; className?: string; href?: string; padding?: string;
}) {
  if (href) {
    return <Link href={href} className={`cartao cartao-link block ${padding} ${className}`}>{children}</Link>;
  }
  return <div className={`cartao ${padding} ${className}`}>{children}</div>;
}

/** Número em destaque com ícone e borda de acento à esquerda (como "Soluções integradas" do site). */
export function Estatistica({ icone: Icone, valor, rotulo, href, urgente = false }: {
  icone?: LucideIcon; valor: React.ReactNode; rotulo: string; href?: string; urgente?: boolean;
}) {
  const miolo = (
    <>
      {Icone && (
        <span className={`grid size-10 place-items-center rounded-xl ${urgente ? "bg-ouro/15 text-ouro" : "bg-verde/12 text-verde"}`}>
          <Icone className="size-5" />
        </span>
      )}
      <p className={`lp-display mt-4 text-3xl leading-none ${urgente ? "text-ouro" : "text-texto"}`}>{valor}</p>
      <p className="mt-2 text-sm text-texto-2">{rotulo}</p>
    </>
  );
  const classe = `cartao block border-l-4 p-5 ${urgente ? "border-l-ouro" : "border-l-verde"}`;
  return href
    ? <Link href={href} className={`${classe} cartao-link`}>{miolo}</Link>
    : <div className={classe}>{miolo}</div>;
}

/** Estado vazio com ícone, explicação e ação — nunca uma tela em branco. */
export function Vazio({ icone: Icone, titulo, texto, acao }: {
  icone?: LucideIcon; titulo: string; texto?: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <div className="cartao flex flex-col items-center px-6 py-14 text-center">
      {Icone && (
        <span className="grid size-14 place-items-center rounded-2xl bg-verde/10 text-verde">
          <Icone className="size-7" />
        </span>
      )}
      <p className="lp-display mt-4 text-xl text-texto">{titulo}</p>
      {texto && <p className="mt-2 max-w-md text-base text-texto-2">{texto}</p>}
      {acao && <div className="mt-6">{acao}</div>}
    </div>
  );
}

const TONS = {
  verde: "bg-verde/14 text-verde border-verde/25",
  ouro: "bg-ouro/14 text-ouro border-ouro/30",
  alerta: "bg-alerta/14 text-alerta border-alerta/30",
  critico: "bg-critico/12 text-critico border-critico/30",
  neutro: "bg-superficie-2 text-texto-2 border-linha",
  roxo: "bg-[#B18CFF]/14 text-[#B18CFF] border-[#B18CFF]/30",
} as const;

/** Etiqueta de status (substitui os `rounded-full px-2 …` soltos pelas telas). */
export function Etiqueta({ tom = "neutro", children, className = "", quebra = false }: {
  tom?: keyof typeof TONS; children: React.ReactNode; className?: string;
  /** texto longo: deixa quebrar a linha em vez de alargar a tela no celular */
  quebra?: boolean;
}) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 ${quebra ? "whitespace-normal" : "whitespace-nowrap"} rounded-md border px-2.5 py-1 text-xs font-semibold ${TONS[tom]} ${className}`}>
      {children}
    </span>
  );
}

/** Botão-link no padrão do site (ícone de seta que anda no hover). */
export function BotaoLink({ href, children, variante = "verde", seta = true, className = "" }: {
  href: string; children: React.ReactNode; variante?: "verde" | "ouro" | "contorno"; seta?: boolean; className?: string;
}) {
  const v = variante === "verde" ? "lp-btn-verde" : variante === "ouro" ? "lp-btn-ouro" : "lp-btn-contorno";
  return (
    <Link href={href} className={`lp-btn ${v} !px-5 !py-3 text-[0.95rem] ${className}`}>
      {children}{seta && <ArrowRight />}
    </Link>
  );
}

/** Classe de campo de formulário padrão (input/select/textarea). */
export const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-superficie-2 px-4 py-3 text-[0.95rem] text-texto placeholder:text-texto-2/70 transition focus:border-verde focus:outline-none focus:ring-2 focus:ring-verde/30";
/** Rótulo de campo padrão. */
export const ROTULO = "mb-1.5 block text-sm font-semibold text-texto";

/**
 * Navegação interna de página longa (âncoras `#id`), presa logo abaixo da
 * barra do topo da Central. Sem rolagem animada: é só link de âncora. As
 * seções-alvo devem ter `scroll-mt-36` para o título não ficar sob a barra.
 */
export function NavegacaoInterna({ itens, className = "" }: {
  itens: { href: string; rotulo: string; icone?: LucideIcon; contagem?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <nav aria-label="Seções desta página"
      className={`sticky top-16 lg:top-[72px] z-20 border-b border-linha bg-fundo/95 backdrop-blur ${className}`}>
      <ul className="flex gap-1 overflow-x-auto py-2.5">
        {itens.map(({ href, rotulo, icone: Icone, contagem }) => (
          <li key={href} className="shrink-0">
            <a href={href}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto">
              {Icone && <Icone className="size-4" />}
              {rotulo}
              {contagem != null && <span className="rounded-md bg-superficie-2 px-1.5 py-0.5 text-xs tabular-nums text-texto-2">{contagem}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
