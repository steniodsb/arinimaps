import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ScrollText } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { CabecalhoPagina, Conteudo } from "@/components/ui/Pagina";
import { lerConfiguracoes } from "@/lib/settings";
import { documentos } from "@/lib/juridico";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termos e políticas",
  description: "Termos de uso, política de privacidade, autorização de venda, exclusividade, remuneração e parceria.",
};

export default async function Termos() {
  const docs = documentos(await lerConfiguracoes());

  return (
    <div className="min-h-screen bg-fundo">
      <SiteHeader />
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Transparência"
        titulo="Termos e"
        destaque="políticas"
        subtitulo="As regras da plataforma, escritas para serem lidas. Cada aceite fica registrado com a versão do documento, a data e a hora, e você pode consultar esta página quando quiser."
      />
      <main>
        <Conteudo className="py-12 md:py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <Link key={d.id} href={`/termos/${d.id}`}
                className="cartao cartao-link group flex flex-col p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-verde/12 text-verde">
                  <ScrollText className="size-5" />
                </span>
                <p className="mt-5 text-xs font-bold uppercase tracking-wider text-texto-2">{d.paraQuem}</p>
                <h2 className="lp-display mt-2 text-xl text-texto transition group-hover:text-verde">{d.titulo}</h2>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-texto-2">{d.resumo}</p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-linha pt-4">
                  <span className="text-xs text-texto-2">Versão {d.versao} · vigente desde {d.vigencia}</span>
                  <ArrowRight className="size-4 shrink-0 text-verde transition group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </Conteudo>
      </main>
    </div>
  );
}
