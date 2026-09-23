import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
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
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        <div className="space-y-2">
          <p className="text-sm text-verde font-medium">Transparência</p>
          <h1 className="text-3xl font-semibold text-texto">Termos e políticas</h1>
          <p className="text-texto-2 max-w-2xl">
            As regras da plataforma, escritas para serem lidas. Cada aceite fica registrado com a
            versão do documento, a data e a hora, e você pode consultar esta página quando quiser.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {docs.map((d) => (
            <Link key={d.id} href={`/termos/${d.id}`}
              className="cartao p-5 space-y-2 hover:border-verde transition block">
              <p className="text-xs text-texto-2">{d.paraQuem}</p>
              <h2 className="font-semibold text-texto text-lg">{d.titulo}</h2>
              <p className="text-sm text-texto-2">{d.resumo}</p>
              <p className="text-xs text-texto-2">Versão {d.versao} · vigente desde {d.vigencia}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
