import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import DocumentosImovel from "@/components/crm/DocumentosImovel";
import VideosImovel from "@/components/crm/VideosImovel";
import HistoricoImovel from "@/components/crm/HistoricoImovel";
import ProporAlteracao from "./ProporAlteracao";

export default async function MeuImovel({ params }: PageProps<"/painel/imoveis/[id]">) {
  const { id } = await params;
  const supabase = await supabaseServer();
  // RLS: só o dono (ou Arini) enxerga
  const { data: p } = await supabase
    .from("properties")
    .select("id, codigo, titulo, descricao, tipo, status, valor, area_declarada, condicoes_venda, aceita_permuta, aceita_financiamento, motivo_correcao, pendencia_tipo")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const admin = supabaseAdmin();
  const [{ data: midia }, { data: revisao }] = await Promise.all([
    supabase.from("property_media").select("id, storage_path").eq("property_id", id).eq("tipo", "video").order("ordem"),
    // Fluxograma §9: proposta de alteração aguardando a Matriz
    admin.from("property_revisions").select("id, versao, dados, created_at")
      .eq("property_id", id).eq("status", "pendente").maybeSingle(),
  ]);
  const videos = (midia ?? []).map((m) => ({
    id: m.id, url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${m.storage_path}`,
  }));

  // Fluxograma §7: mesmo status `correcao`, pendência diferente
  const complemento = p.status === "correcao" && p.pendencia_tipo === "complemento";
  const rotuloStatus = complemento ? "Aguardando complemento" : STATUS_LABEL[p.status];
  const publicado = ["publicado", "em_negociacao"].includes(p.status);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="font-mono text-xs text-texto-2">{p.codigo}</p>
        <h1 className="text-2xl font-semibold text-texto">{p.titulo}</h1>
        <p className="text-sm text-texto-2">
          {formatBRL(p.valor)} · <strong>{rotuloStatus}</strong>
          {revisao && <span className="ml-2 text-xs rounded-full bg-alerta/15 text-alerta px-2.5 py-0.5">alteração em análise</span>}
        </p>
        {p.motivo_correcao && (
          <p className="mt-2 text-sm bg-alerta/10 text-alerta rounded-lg px-3 py-2">
            {complemento ? "A Arini pediu informações complementares" : "A Arini pediu correção"}: {p.motivo_correcao}
          </p>
        )}
      </div>

      {publicado && (
        <section className="cartao p-5 space-y-3">
          <h2 className="font-semibold text-texto">Alteração do anúncio</h2>
          <ProporAlteracao
            propertyId={p.id}
            tipo={p.tipo as "urbano" | "rural"}
            atual={{
              titulo: p.titulo, descricao: p.descricao ?? "", valor: p.valor, area_declarada: p.area_declarada,
              condicoes_venda: p.condicoes_venda, aceita_permuta: !!p.aceita_permuta, aceita_financiamento: !!p.aceita_financiamento,
            }}
            pendente={revisao ? { id: revisao.id, versao: revisao.versao, dados: (revisao.dados ?? {}) as Record<string, unknown>, created_at: revisao.created_at } : null}
          />
        </section>
      )}

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

      {/* §1: histórico do imóvel — versões da divisa, origem dos dados, alterações e auditoria */}
      <HistoricoImovel propertyId={p.id} modo="painel" tipoImovel={p.tipo as "urbano" | "rural"} />
    </div>
  );
}
