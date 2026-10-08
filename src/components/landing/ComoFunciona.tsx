"use client";

/**
 * Como funciona: linha do tempo em 5 passos. A linha se preenche conforme a
 * rolagem e cada passo acende quando a linha chega nele. Horizontal no
 * desktop, vertical no celular.
 */

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { BadgeCheck, FileText, Handshake, MessagesSquare, UploadCloud } from "lucide-react";
import { EASE } from "./movimento";

const PASSOS = [
  { icone: UploadCloud, titulo: "Cadastro", texto: "Proprietário ou corretor envia o imóvel com a divisa, as fotos e os documentos." },
  { icone: BadgeCheck, titulo: "Conferência da Arini", texto: "A equipe confere documentos, área declarada contra a área medida e as consultas oficiais." },
  { icone: FileText, titulo: "Publicação", texto: "O anúncio vai ao mapa com divisa no satélite, tour 3D, vídeo e relatório territorial." },
  { icone: MessagesSquare, titulo: "Interessado pela central", texto: "Todo contato passa pela central da Arini antes de chegar ao proprietário ou parceiro." },
  { icone: Handshake, titulo: "Negociação e fechamento", texto: "A Arini organiza visitas, conduz a negociação e acompanha até a escritura." },
];

export default function ComoFunciona() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 55%"] });
  const progresso = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
  const escala = useTransform(progresso, [0, 1], [0, 1]);
  const [aceso, setAceso] = useState(reduce ? PASSOS.length : 0);

  useMotionValueEvent(progresso, "change", (p) => {
    const n = Math.min(PASSOS.length, Math.floor(p * (PASSOS.length - 1) + 1.0001));
    if (n !== aceso) setAceso(n);
  });

  const acesos = reduce ? PASSOS.length : aceso;

  return (
    <div ref={ref} className="relative">
      {/* trilho + preenchimento: horizontal (lg) / vertical (celular) */}
      <div aria-hidden="true" className="absolute left-[22px] top-0 h-full w-[3px] rounded bg-white/12 lg:left-0 lg:top-[22px] lg:h-[3px] lg:w-full">
        <motion.div
          style={reduce ? undefined : { scaleY: escala }}
          className="h-full w-full origin-top rounded bg-[#3FCF7F] lg:hidden"
        />
        <motion.div
          style={reduce ? undefined : { scaleX: escala }}
          className="hidden h-full w-full origin-left rounded bg-[#3FCF7F] lg:block"
        />
      </div>

      <ol className="relative grid gap-10 lg:grid-cols-5 lg:gap-8">
        {PASSOS.map((p, k) => {
          const on = k < acesos;
          return (
            <motion.li
              key={p.titulo}
              initial={reduce ? false : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.7, delay: k * 0.08, ease: EASE }}
              className="relative pl-16 lg:pl-0"
            >
              <span
                className={`absolute left-0 top-0 grid size-[47px] place-items-center rounded-full border-2 transition-colors duration-500 lg:relative ${
                  on ? "border-[#3FCF7F] bg-[#3FCF7F] text-[#0A1F14]" : "border-white/25 bg-[#0C2419] text-white/70"
                }`}
              >
                <p.icone className="size-5" strokeWidth={1.9} />
              </span>
              <p className="lp-display mt-0 text-sm tracking-[0.18em] text-[#E4C77E] lg:mt-6">PASSO {k + 1}</p>
              <h3 className="lp-display mt-2 text-2xl text-white">{p.titulo}</h3>
              <p className="mt-3 text-[17px] leading-relaxed text-white/80">{p.texto}</p>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
