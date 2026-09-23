import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { lerConfiguracoes } from "@/lib/settings";
import { documento, documentos } from "@/lib/juridico";
import BotaoImprimir from "./BotaoImprimir";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/termos/[documento]">): Promise<Metadata> {
  const { documento: id } = await params;
  const doc = documento({}, id);
  return doc ? { title: doc.titulo, description: doc.resumo } : {};
}

export default async function DocumentoJuridico({ params }: PageProps<"/termos/[documento]">) {
  const { documento: id } = await params;
  const cfg = await lerConfiguracoes();
  const doc = documento(cfg, id);
  if (!doc) notFound();
  const outros = documentos(cfg).filter((d) => d.id !== doc.id);

  return (
    <div className="min-h-screen bg-fundo">
      <div className="print:hidden"><SiteHeader /></div>
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <nav className="text-sm text-texto-2 print:hidden">
          <Link href="/termos" className="hover:text-verde">Termos e políticas</Link> › {doc.titulo}
        </nav>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-texto">{doc.titulo}</h1>
          <p className="text-texto-2">{doc.resumo}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-texto-2">
            <span className="rounded-full bg-superficie-2 px-3 py-1">Versão {doc.versao}</span>
            <span className="rounded-full bg-superficie-2 px-3 py-1">Vigente desde {doc.vigencia}</span>
            <span className="rounded-full bg-superficie-2 px-3 py-1">{doc.paraQuem}</span>
            <BotaoImprimir />
          </div>
        </header>

        <article className="cartao p-6 sm:p-8 space-y-7">
          {doc.secoes.map((s, i) => (
            <section key={s.titulo} className="space-y-3">
              <h2 className="font-semibold text-texto text-lg">{i + 1}. {s.titulo}</h2>
              <ol className="space-y-2.5">
                {s.itens.map((item, j) => (
                  <li key={j} className="flex gap-3 text-sm leading-relaxed text-texto-2">
                    <span className="shrink-0 tabular-nums text-texto font-medium">{i + 1}.{j + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </article>

        <section className="space-y-3 print:hidden">
          <h2 className="font-semibold text-texto">Outros documentos</h2>
          <div className="flex flex-wrap gap-2">
            {outros.map((d) => (
              <Link key={d.id} href={`/termos/${d.id}`} className="btn-contorno px-4 py-2 text-sm">
                {d.titulo}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
