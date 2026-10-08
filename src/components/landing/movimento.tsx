"use client";

/**
 * Efeitos de entrada e rolagem da página inicial (mesma gramática do site de
 * referência do Grupo Cordeiro): surgir ao aparecer, título palavra por
 * palavra saindo de uma máscara, número que conta, parallax e cortina.
 * Tudo vira estático com `prefers-reduced-motion`, e `?qa=1` na URL desliga
 * as animações para capturas de tela.
 */

import { Children, useEffect, useRef } from "react";
import {
  animate, motion, MotionGlobalConfig, useInView, useReducedMotion, useScroll, useTransform,
} from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;

if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("qa")) {
  MotionGlobalConfig.skipAnimations = true;
}

/** Rolagem suave nas âncoras do menu enquanto a landing está aberta. */
export function RolagemSuave() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const html = document.documentElement;
    const antes = html.style.scrollBehavior;
    html.style.scrollBehavior = "smooth";
    return () => { html.style.scrollBehavior = antes; };
  }, []);
  return null;
}

/** Sobe e surge ao entrar na tela. */
export function Reveal({ children, delay = 0, y = 40, x = 0, className = "" }: {
  children: React.ReactNode; delay?: number; y?: number; x?: number; className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Filhos entram em sequência. */
export function Stagger({ children, className = "", gap = 0.08, y = 40, itemClassName = "" }: {
  children: React.ReactNode; className?: string; gap?: number; y?: number; itemClassName?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {Children.map(children, (child) => (
        <motion.div
          className={itemClassName}
          variants={{ hidden: { opacity: 0, y }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } } }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * Título palavra por palavra, subindo de dentro de uma máscara. As últimas
 * `destaque` palavras saem na cor de destaque. A detecção de "entrou na tela"
 * fica no título inteiro: as palavras começam recortadas.
 */
export function TextReveal({ text, className = "", delay = 0, as = "h2", destaque = 0, corDestaque = "text-verde" }: {
  text: string; className?: string; delay?: number; as?: "h1" | "h2" | "h3" | "p"; destaque?: number; corDestaque?: string;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const words = text.split(" ").filter(Boolean);
  return (
    <Tag
      className={className}
      aria-label={text}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
    >
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.1em] align-bottom" aria-hidden>
          <motion.span
            className={`inline-block ${i >= words.length - destaque ? corDestaque : ""}`}
            variants={{ hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.85, ease: EASE } } }}
          >
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * Número que conta ao entrar na tela ("31.245", "+500", "1%", "18").
 * O valor final já vai no HTML (sem salto de layout, sem número errado se o
 * JavaScript atrasar); a contagem escreve direto no DOM, sem re-render.
 */
export function Counter({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const m = value.match(/^([^\d]*)([\d.,]+)(.*)$/);
    if (!inView || !m || reduce || !ref.current) return;
    const [, prefixo, bruto, sufixo] = m;
    const decimais = bruto.includes(",") ? bruto.split(",")[1].length : 0;
    const alvo = Number(bruto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(alvo) || alvo === 0) return;
    const fmt = (v: number) => v.toLocaleString("pt-BR", {
      minimumFractionDigits: decimais, maximumFractionDigits: decimais, useGrouping: bruto.includes("."),
    });
    const el = ref.current;
    const c = animate(0, alvo, { duration: 1.8, ease: EASE, onUpdate: (v) => { el.textContent = `${prefixo}${fmt(v)}${sufixo}`; } });
    return () => { c.stop(); el.textContent = value; };
  }, [inView, reduce, value]);

  return <span ref={ref} className={`tabular-nums ${className}`}>{value}</span>;
}

/** Imagem com parallax vertical ao rolar. */
export function Parallax({ children, className = "", strength = 60 }: { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-strength, strength]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <motion.div style={{ y }} className="absolute inset-x-0 -inset-y-[12%]">{children}</motion.div>
    </div>
  );
}

/** Imagem que se revela por uma "cortina" ao entrar na tela. */
export function ClipReveal({ children, className = "", from = "bottom" }: {
  children: React.ReactNode; className?: string; from?: "bottom" | "left" | "right";
}) {
  const reduce = useReducedMotion();
  const inicio = { bottom: "inset(100% 0 0 0)", left: "inset(0 100% 0 0)", right: "inset(0 0 0 100%)" }[from];
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { clipPath: inicio }}
      whileInView={{ clipPath: "inset(0 0 0 0)" }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 1.2, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Posiciona a luz dos elementos `.spotlight` sob o cursor. Um único listener
 * para a página, no máximo uma atualização por quadro, só no cartão sob o mouse.
 */
export function SpotlightTracker() {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    let frame = 0;
    let ev: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      const el = (ev?.target as HTMLElement | null)?.closest?.<HTMLElement>(".spotlight");
      if (!el || !ev) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${ev.clientX - r.left}px`);
      el.style.setProperty("--my", `${ev.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => { ev = e; if (!frame) frame = requestAnimationFrame(update); };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
