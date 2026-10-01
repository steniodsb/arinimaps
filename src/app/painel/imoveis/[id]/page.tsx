import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import DocumentosImovel from "@/components/crm/DocumentosImovel";
import VideosImovel from "@/components/crm/VideosImovel";

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
  const { data: midia } = await supabase.from("property_media").select("id, storage_path").eq("property_id", id).eq("tipo", "video").order("ordem");
  const videos = (midia ?? []).map((m) => ({
    id: m.id, url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${m.storage_path}`,
  }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="font-mono text-xs text-texto-2">{p.codigo}</p>
        <h1 className="text-2xl font-semibold text-texto">{p.titulo}</h1>
        <p className="text-sm text-texto-2">
          {formatBRL(p.valor)} · <strong>{STATUS_LABEL[p.status]}</strong>
        </p>
        {p.motivo_correcao && (
          <p className="mt-2 text-sm bg-alerta/10 text-alerta rounded-lg px-3 py-2">
            A Arini pediu correção: {p.motivo_correcao}
          </p>
        )}
      </div>

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Documentos do imóvel</h2>
        <p className="text-sm text-texto-2">
          Matrícula, CAR, ITR, planta DWG, autorização de venda — quanto mais completo, mais rápida a aprovação.
          Os arquivos ficam num cofre privado; só você e a Arini acessam.
        </p>
        <DocumentosImovel propertyId={p.id} />
      </section>

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Vídeos do imóvel</h2>
        <p className="text-sm text-texto-2">
          Um vídeo curto da sede, do acesso ou das benfeitorias ajuda muito na decisão. Ele entra na galeria do anúncio.
        </p>
        <VideosImovel propertyId={p.id} videos={videos} />
      </section>
    </div>
  );
}
