import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal, TextReveal } from "./movimento";

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
        corDestaque={claro ? "text-[#5FE09A]" : "text-verde"}
        className={`lp-display ${eyebrow ? "mt-3" : ""} text-4xl md:text-[3.4rem] ${claro ? "text-white" : "text-texto"}`}
      />
      {subtitulo && (
        <Reveal delay={0.15}>
          <p className={`mt-5 text-lg leading-relaxed md:text-xl ${claro ? "text-white/85" : "text-texto-2"}`}>{subtitulo}</p>
        </Reveal>
      )}
    </div>
  );
}

/** "Ver todos" com seta num círculo que gira no hover. */
export function MaisLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3 text-base font-bold text-texto">
      <span className="relative">
        {children}
        <span className="absolute -bottom-1 left-0 h-0.5 w-full origin-left scale-x-0 bg-verde transition duration-300 group-hover:scale-x-100" />
      </span>
      <span className="grid size-10 place-items-center rounded-full bg-verde text-fundo transition duration-300 group-hover:rotate-45">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}
