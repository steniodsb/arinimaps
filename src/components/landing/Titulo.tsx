import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal, TextReveal } from "./movimento";

/**
 * Botão de ação principal da interface (Verde Arini no claro, Verde Mapa no
 * escuro). O vermelho (`lp-btn-verde`) fica só para a chamada de venda.
 */
export const BTN_ACAO = "lp-btn bg-[var(--botao)] text-[var(--botao-texto)] hover:brightness-110";

/**
 * Título de seção da landing: linha de topo em texto (sem formato de botão),
 * título grande que sobe palavra por palavra e texto de apoio em corpo grande.
 */
export function TituloSecao({ eyebrow, titulo, destaque = 0, subtitulo, centro = false, claro = false }: {
  eyebrow?: string; titulo: string; destaque?: number; subtitulo?: string | null; centro?: boolean; claro?: boolean;
}) {
  return (
    <div className={`${centro ? "mx-auto text-center" : ""} max-w-3xl`}>
      {eyebrow && <Reveal y={12}><p className="lp-eyebrow">{eyebrow}</p></Reveal>}
      <TextReveal
        text={titulo}
        destaque={destaque}
        corDestaque={claro ? "text-ouro" : "text-verde"}
        className={`lp-display ${eyebrow ? "mt-3" : ""} text-[2.6rem] md:text-[3.6rem] ${claro ? "text-white" : "text-texto"}`}
      />
      {subtitulo && (
        <Reveal delay={0.15}>
          <p className={`mt-5 text-lg leading-relaxed md:text-xl ${claro ? "text-white/85" : "text-texto-2"}`}>{subtitulo}</p>
        </Reveal>
      )}
    </div>
  );
}

/** "Ver todos": botão de contorno em pílula com seta (secundário do manual). */
export function MaisLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3 rounded-full border-[1.5px] border-verde py-2 pl-5 pr-2 text-[15px] font-semibold text-verde transition hover:bg-verde hover:text-fundo">
      {children}
      <span className="grid size-8 place-items-center rounded-full bg-verde text-fundo transition duration-300 group-hover:rotate-45 group-hover:bg-fundo group-hover:text-verde">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}
