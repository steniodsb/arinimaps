import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Map, Search } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import RodapeSite from "@/components/landing/RodapeSite";
import { lerConfiguracoes, texto } from "@/lib/settings";

export const metadata: Metadata = { title: "Página não encontrada" };

/** 404 com a cara do site: faixa escura em malha, título grande e caminhos de saída. */
export default async function NaoEncontrada() {
  const cfg = await lerConfiguracoes();
  const contato = {
    whatsapp: texto(cfg, "whatsapp_central") || undefined,
    email: texto(cfg, "email_contato") || undefined,
    telefone: texto(cfg, "telefone_contato") || undefined,
  };
  return (
    <div className="flex min-h-screen flex-col bg-fundo text-texto">
      <SiteHeader />
      <main className="lp-escuro lp-malha-escura relative flex flex-1 items-center overflow-hidden">
        <div className="lp-grade pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-container relative py-24 md:py-32">
          <p className="lp-eyebrow">Erro 404</p>
          <h1 className="lp-display mt-3 max-w-3xl text-4xl text-white md:text-6xl">
            Esta página saiu do <span className="text-[#5FE09A]">mapa</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80 md:text-xl">
            O endereço pode ter mudado ou o anúncio não está mais publicado. Procure pelo mapa ou pela
            lista de imóveis.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/mapa" className="lp-btn lp-btn-verde"><Map /> Abrir o mapa</Link>
            <Link href="/imoveis" className="lp-btn lp-btn-claro"><Search /> Buscar imóveis</Link>
            <Link href="/" className="lp-btn lp-btn-claro">Página inicial <ArrowRight /></Link>
          </div>
        </div>
      </main>
      <RodapeSite marca={texto(cfg, "nome_sistema", "Arini Imóveis Brasil")} contato={contato} />
    </div>
  );
}
