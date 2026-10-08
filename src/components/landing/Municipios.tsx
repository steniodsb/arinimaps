"use client";

/**
 * Municípios atendidos: um cartão por município ativo, com o satélite da sede
 * (mesma imagem do mapa), nome e quantos imóveis estão publicados. Cartões
 * compactos para a grade inteira caber numa tela do desktop, como as "Áreas de
 * Atuação" do site de referência.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import MosaicoSatelite from "./MosaicoSatelite";
import { EASE } from "./movimento";

export type MunicipioCartao = {
  id: string;
  nome: string;
  uf: string;
  lng: number;
  lat: number;
  imoveis: number;
  lotes: number;
};

export default function Municipios({ municipios }: { municipios: MunicipioCartao[] }) {
  const reduce = useReducedMotion();
  const colunas = municipios.length > 6 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 ${colunas}`}>
      {municipios.map((m, k) => (
        <motion.div
          key={m.id}
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-8%" }}
          transition={{ duration: 0.6, delay: (k % 4) * 0.07, ease: EASE }}
        >
          <Link
            href={`/imoveis?municipio=${m.id}`}
            className="spotlight lp-escuro group relative block aspect-[16/10] overflow-hidden rounded-xl bg-[#0E2C1E] ring-1 ring-linha transition hover:ring-2 hover:ring-[#3FCF7F]"
          >
            <div className="absolute inset-0 transition duration-700 ease-out group-hover:scale-[1.07]">
              <MosaicoSatelite lng={m.lng} lat={m.lat} z={13} alt={`Satélite de ${m.nome}`} />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,13,0)_30%,rgba(7,17,13,.55)_62%,rgba(7,17,13,.95)_100%)]" />
            <span className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition duration-300 group-hover:rotate-45 group-hover:opacity-100">
              <ArrowUpRight className="size-5" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-white md:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#3FCF7F] text-[#0A1F14]">
                {m.lotes > 0 ? <Building2 className="size-5" strokeWidth={1.8} /> : <MapPin className="size-5" strokeWidth={1.8} />}
              </span>
              <span className="min-w-0">
                <span className="lp-display block text-xl leading-tight md:text-2xl">{m.nome}</span>
                <span className="mt-1 block text-[15px] text-white/80">
                  {m.imoveis > 0
                    ? `${m.imoveis} ${m.imoveis === 1 ? "imóvel publicado" : "imóveis publicados"}`
                    : "Satélite e malha do CAR no mapa"}
                  {m.lotes > 0 && ` · ${m.lotes.toLocaleString("pt-BR")} lotes`}
                </span>
              </span>
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
