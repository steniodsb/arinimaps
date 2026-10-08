"use client";

/**
 * "Como você usa a Arini": abas à esquerda (perfis de uso) e um cartão grande
 * à direita, com foto ou satélite, que troca com movimento. Mesma ideia do
 * service-showcase do site de referência, em formato de abas.
 */

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Gavel, Handshake, Megaphone, ScanSearch, Search } from "lucide-react";
import MosaicoSatelite from "./MosaicoSatelite";
import { EASE } from "./movimento";

type Aba = {
  id: string;
  rotulo: string;
  frase: string;
  texto: string;
  link: { rotulo: string; href: string };
  icone: typeof Search;
  imagem: { tipo: "foto"; src: string } | { tipo: "satelite"; lng: number; lat: number; z: number };
  pontos: string[];
};

const ABAS: Aba[] = [
  {
    id: "comprar", rotulo: "Comprar", icone: Search,
    frase: "Encontre pelo mapa, não pela foto.",
    texto: "Navegue pelo satélite, filtre por tipo, município e preço e veja a divisa real de cada propriedade, com a área medida e o que há ao redor.",
    pontos: ["Divisa sobre o satélite", "Área medida e conferida", "Tour 3D do imóvel"],
    link: { rotulo: "Buscar imóveis", href: "/imoveis" },
    imagem: { tipo: "foto", src: "/img/aerea-interior.jpg" },
  },
  {
    id: "anunciar", rotulo: "Anunciar", icone: Megaphone,
    frase: "Seu imóvel no mapa, do jeito certo.",
    texto: "Cadastre a propriedade com a divisa, fotos e documentos. A Arini confere tudo antes de publicar e gera o tour 3D e o vídeo automaticamente.",
    pontos: ["Conferência antes de publicar", "Tour 3D e vídeo automáticos", "Interessados qualificados"],
    link: { rotulo: "Anunciar imóvel", href: "/painel/novo" },
    imagem: { tipo: "foto", src: "/img/hero-fazenda.jpg" },
  },
  {
    id: "consultar", rotulo: "Consultar área", icone: ScanSearch,
    frase: "Saiba o que pesa sobre a terra.",
    texto: "CAR, embargos, queimadas, processos minerários, terras indígenas e unidades de conservação cruzados com a divisa, num relatório com data e fonte de cada consulta.",
    pontos: ["Fontes oficiais ao vivo", "Raio de cada incidência", "Relatório em PDF"],
    link: { rotulo: "Ver relatórios territoriais", href: "/relatorios" },
    imagem: { tipo: "satelite", lng: -50.235, lat: -19.75, z: 14 },
  },
  {
    id: "leiloes", rotulo: "Leilões", icone: Gavel,
    frase: "Oportunidade com a lição de casa feita.",
    texto: "Imóveis de leilão da região reunidos num só lugar, com a área medida no satélite e as consultas ambientais prontas antes do lance.",
    pontos: ["Imóveis de leilão no mapa", "Cor própria na legenda", "Consultas antes do lance"],
    link: { rotulo: "Ver imóveis em leilão", href: "/imoveis?tipo=leilao" },
    imagem: { tipo: "foto", src: "/img/fazenda-gado.jpg" },
  },
  {
    id: "corretores", rotulo: "Para corretores", icone: Handshake,
    frase: "Ferramenta de território para quem vende.",
    texto: "Imobiliárias e corretores parceiros anunciam com a mesma qualidade cartográfica, usam as consultas na negociação e recebem os contatos pela central.",
    pontos: ["Planos por perfil", "Consultas na negociação", "Contatos pela central"],
    link: { rotulo: "Conhecer os planos", href: "/planos" },
    imagem: { tipo: "foto", src: "/img/casa-urbana.jpg" },
  },
];

export default function ComoUsar() {
  const [ativa, setAtiva] = useState(0);
  const reduce = useReducedMotion();
  const aba = ABAS[ativa];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      {/* ---------- abas ---------- */}
      <div role="tablist" aria-label="Como usar a Arini" aria-orientation="vertical" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ABAS.map((a, k) => {
          const sel = k === ativa;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              aria-selected={sel}
              aria-controls="painel-como-usar"
              onClick={() => setAtiva(k)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setAtiva((ativa + 1) % ABAS.length); }
                if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setAtiva((ativa - 1 + ABAS.length) % ABAS.length); }
              }}
              className={`group relative flex shrink-0 items-center gap-4 rounded-xl px-4 py-3.5 text-left transition lg:px-5 lg:py-5 ${
                sel ? "bg-superficie shadow-[0_18px_40px_-28px_rgba(0,0,0,.5)]" : "hover:bg-superficie/60"
              }`}
            >
              {sel && (
                <motion.span
                  layoutId="como-usar-marca"
                  className="absolute inset-y-3 left-0 w-1 rounded-full bg-verde"
                  transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                />
              )}
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-lg transition ${
                  sel ? "bg-verde text-fundo" : "bg-verde/10 text-verde group-hover:bg-verde/20"
                }`}
              >
                <a.icone className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className={`lp-display block text-lg lg:text-2xl ${sel ? "text-texto" : "text-texto-3"}`}>{a.rotulo}</span>
                <span className="hidden text-base text-texto-2 lg:block">{a.frase}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------- cartão ---------- */}
      <div
        id="painel-como-usar" role="tabpanel" aria-labelledby={`aba-${aba.id}`}
        className="spotlight lp-escuro relative isolate min-h-[30rem] overflow-hidden rounded-2xl bg-[#07110D] lg:min-h-[36rem]"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={aba.id}
            className="absolute inset-0 -z-20"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            {aba.imagem.tipo === "foto" ? (
              <Image src={aba.imagem.src} alt="" fill sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
            ) : (
              <MosaicoSatelite lng={aba.imagem.lng} lat={aba.imagem.lat} z={aba.imagem.z} />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,17,13,.1)_0%,rgba(7,17,13,.45)_45%,rgba(7,17,13,.95)_100%)]" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={aba.id}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            className="absolute inset-x-0 bottom-0 p-6 text-white md:p-10"
          >
            <p className="lp-eyebrow">{aba.rotulo}</p>
            <h3 className="lp-display mt-3 text-3xl md:text-[2.6rem]">{aba.frase}</h3>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/90">{aba.texto}</p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-base text-white/85">
              {aba.pontos.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#3FCF7F]" aria-hidden="true" /> {p}
                </li>
              ))}
            </ul>
            <Link href={aba.link.href} className="lp-btn lp-btn-verde mt-7">
              {aba.link.rotulo} <ArrowRight />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
