import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import DocumentosImovel from "@/components/crm/DocumentosImovel";

export default async function MeuImovel({ params }: PageProps<"/painel/imoveis/[id]">) {
  const { id } = await params;
  const supabase = await supabaseServer();
  // RLS: só o dono (ou Arini) enxerga
  const { data: p } = await supabase
    .from("properties")
    .select("id, codigo, titulo, tipo, status, valor, motivo_correcao")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="font-mono text-xs text-foreground/50">{p.codigo}</p>
        <h1 className="text-2xl font-semibold text-verde-escuro">{p.titulo}</h1>
        <p className="text-sm text-foreground/60">
          {formatBRL(p.valor)} · <strong>{STATUS_LABEL[p.status]}</strong>
        </p>
        {p.motivo_correcao && (
          <p className="mt-2 text-sm bg-orange-50 text-orange-800 rounded-lg px-3 py-2">
            A Arini pediu correção: {p.motivo_correcao}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-linha bg-white p-5 space-y-3">
        <h2 className="font-semibold text-verde-escuro">Documentos do imóvel</h2>
        <p className="text-sm text-foreground/60">
          Matrícula, CAR, ITR, planta DWG, autorização de venda — quanto mais completo, mais rápida a aprovação.
          Os arquivos ficam num cofre privado; só você e a Arini acessam.
        </p>
        <DocumentosImovel propertyId={p.id} />
      </section>
    </div>
  );
}
