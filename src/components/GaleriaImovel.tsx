"use client";

/**
 * Carrossel de mídias do imóvel: fotos, vídeo e o tour 3D como slides,
 * com miniaturas, setas, contador, teclado e tela cheia.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export type Slide =
  | { tipo: "foto"; url: string }
  | { tipo: "video"; url: string }
  | { tipo: "tour"; href: string; poster: string | null };

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
            <div className="w-full h-full bg-verde-escuro" />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-verde-escuro/65 text-white">
            <span className="w-16 h-16 rounded-full bg-ouro text-verde-escuro grid place-items-center text-2xl group-hover/tour:scale-110 transition">▶</span>
            <span className="font-semibold text-lg">Ver tour 3D da propriedade</span>
            <span className="text-sm text-white/75">sobrevoo com relevo real e pontos de interesse</span>
          </span>
        </Link>
      )}
    </>
  );

  return (
    <>
      <div className="space-y-2">
        <div className="relative rounded-2xl overflow-hidden bg-areia aspect-[16/10] group">
          {conteudo}

          {total > 1 && (
            <>
              <button onClick={() => ir(-1)} aria-label="Imagem anterior"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 shadow-lg grid place-items-center text-verde-escuro hover:bg-white hover:scale-105 transition opacity-0 group-hover:opacity-100 focus:opacity-100">
                ‹
              </button>
              <button onClick={() => ir(1)} aria-label="Próxima imagem"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 shadow-lg grid place-items-center text-verde-escuro hover:bg-white hover:scale-105 transition opacity-0 group-hover:opacity-100 focus:opacity-100">
                ›
              </button>
              <span className="absolute bottom-3 right-3 text-xs font-medium bg-black/60 text-white rounded-full px-3 py-1 tabular-nums">
                {atual + 1} / {total}
              </span>
            </>
          )}

          {slide.tipo === "foto" && (
            <button onClick={() => setCheia(true)} aria-label="Ver em tela cheia"
              className="absolute bottom-3 left-3 text-xs font-medium bg-black/60 text-white rounded-full px-3 py-1 hover:bg-black/80 transition">
              ⛶ Ampliar
            </button>
          )}
        </div>

        {total > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slides.map((s, i) => (
              <button key={i} onClick={() => setAtual(i)}
                aria-label={`Ir para mídia ${i + 1}`}
                className={`relative shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition
                  ${i === atual ? "border-ouro" : "border-transparent opacity-70 hover:opacity-100"}`}>
                {s.tipo === "foto" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="" className="w-full h-full object-cover" />
                )}
                {s.tipo === "video" && (
                  <span className="w-full h-full grid place-items-center bg-verde-escuro text-white text-lg">▶</span>
                )}
                {s.tipo === "tour" && (
                  <span className="w-full h-full grid place-items-center bg-verde text-white text-[10px] font-semibold px-1 text-center">
                    TOUR 3D
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
            className="absolute top-5 right-6 w-11 h-11 rounded-full bg-white/15 text-white text-xl hover:bg-white/25">✕</button>
          {total > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); ir(-1); }} aria-label="Anterior"
                className="absolute left-5 w-12 h-12 rounded-full bg-white/15 text-white text-2xl hover:bg-white/25">‹</button>
              <button onClick={(e) => { e.stopPropagation(); ir(1); }} aria-label="Próxima"
                className="absolute right-5 w-12 h-12 rounded-full bg-white/15 text-white text-2xl hover:bg-white/25">›</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
