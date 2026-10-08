"use client";

/**
 * Carrossel de mídias do imóvel: fotos, vídeo e o tour 3D como slides,
 * com miniaturas, setas, contador, teclado e tela cheia.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Expand, Play, Rotate3d, X } from "lucide-react";

export type Slide =
  | { tipo: "foto"; url: string }
  | { tipo: "video"; url: string }
  | { tipo: "tour"; href: string; poster: string | null };

const SETA =
  "absolute top-1/2 -translate-y-1/2 grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100";

export default function GaleriaImovel({ slides, titulo }: { slides: Slide[]; titulo: string }) {
  const [atual, setAtual] = useState(0);
  const [cheia, setCheia] = useState(false);
  const total = slides.length;

  const ir = useCallback((delta: number) => {
    setAtual((i) => (i + delta + total) % total);
  }, [total]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
      else if (e.key === "Escape") setCheia(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ir]);

  if (!total) return null;
  const slide = slides[atual];

  const conteudo = (
    <>
      {slide.tipo === "foto" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.url} alt={`${titulo} — imagem ${atual + 1}`}
          className={cheia ? "max-h-full max-w-full object-contain" : "w-full h-full object-cover"} />
      )}
      {slide.tipo === "video" && (
        <video controls src={slide.url} className="w-full h-full object-contain bg-black" />
      )}
      {slide.tipo === "tour" && (
        <Link href={slide.href} className="relative block w-full h-full group/tour">
          {slide.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.poster} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="lp-malha-escura w-full h-full" />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#07130E]/65 px-6 text-center text-white">
            <span className="grid size-16 place-items-center rounded-full bg-ouro text-[#10201A] shadow-xl transition group-hover/tour:scale-105">
              <Play className="size-7 translate-x-0.5" fill="currentColor" />
            </span>
            <span className="lp-display text-2xl">Ver tour 3D da propriedade</span>
            <span className="text-base text-white/75">sobrevoo com relevo real e pontos de interesse</span>
          </span>
        </Link>
      )}
    </>
  );

  return (
    <>
      <div className="space-y-3">
        <div className="group relative aspect-[16/10] overflow-hidden rounded-[20px] bg-superficie-2 ring-1 ring-linha">
          {conteudo}

          {total > 1 && (
            <>
              <button onClick={() => ir(-1)} aria-label="Imagem anterior" className={`${SETA} left-4`}>
                <ChevronLeft className="size-6" />
              </button>
              <button onClick={() => ir(1)} aria-label="Próxima imagem" className={`${SETA} right-4`}>
                <ChevronRight className="size-6" />
              </button>
              <span className="absolute bottom-4 right-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold tabular-nums tracking-wider text-white backdrop-blur">
                {atual + 1} / {total}
              </span>
            </>
          )}

          {slide.tipo === "foto" && (
            <button onClick={() => setCheia(true)} aria-label="Ver em tela cheia"
              className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur transition hover:bg-black/80">
              <Expand className="size-3.5" /> Ampliar
            </button>
          )}
        </div>

        {total > 1 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {slides.map((s, i) => (
              <button key={i} onClick={() => setAtual(i)}
                aria-label={`Ir para mídia ${i + 1}`}
                className={`relative h-[4.5rem] w-28 shrink-0 overflow-hidden rounded-xl ring-2 transition
                  ${i === atual ? "ring-verde" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                {s.tipo === "foto" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="" className="w-full h-full object-cover" />
                )}
                {s.tipo === "video" && (
                  <span className="grid h-full w-full place-items-center bg-verde-escuro text-white">
                    <Play className="size-5" fill="currentColor" />
                  </span>
                )}
                {s.tipo === "tour" && (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-verde px-1 text-center text-[10px] font-bold tracking-wider text-[#0A1F14]">
                    <Rotate3d className="size-4" /> TOUR 3D
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {cheia && slide.tipo === "foto" && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-6"
          onClick={() => setCheia(false)} role="dialog" aria-modal="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.url} alt={`${titulo} — imagem ${atual + 1}`}
            className="max-h-full max-w-full object-contain" />
          <button onClick={() => setCheia(false)} aria-label="Fechar"
            className="absolute right-6 top-5 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <X className="size-5" />
          </button>
          {total > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); ir(-1); }} aria-label="Anterior"
                className="absolute left-5 grid size-12 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
                <ChevronLeft className="size-6" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); ir(1); }} aria-label="Próxima"
                className="absolute right-5 grid size-12 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
