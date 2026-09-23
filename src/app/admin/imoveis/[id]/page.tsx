import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import MiniMapa from "@/components/map/MiniMapa";
import DecisaoBotoes from "./DecisaoBotoes";
import DocumentosImovel from "@/components/crm/DocumentosImovel";
import ConsultaRural from "@/components/rural/ConsultaRural";

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export default async function AnaliseImovel({ params }: PageProps<"/admin/imoveis/[id]">) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: p } = await admin
    .from("properties")
    .select(`
      id, codigo, titulo, descricao, tipo, status, valor, area_declarada,
      caracteristicas, condicoes_venda, exclusividade, motivo_correcao, created_at,
      municipality:municipalities(nome, uf),
      owner:owners(id, profile:profiles(nome, telefone)),
      partner:partners(id, razao_social, tipo, profile:profiles(nome, telefone))
    `)
    .eq("id", id)
    .single();
  if (!p) notFound();

  const [{ data: geo }, { data: media }, { data: geoJson }, { data: autorizacao }] = await Promise.all([
    admin.from("property_geometries").select("area_m2, perimeter_m, fonte").eq("property_id", id).maybeSingle(),
    admin.from("property_media").select("tipo, storage_path").eq("property_id", id).order("ordem"),
    admin.rpc("fn_property_admin_geometry", { p_property_id: id }).then(
      (r) => r,
      () => ({ data: null })
    ),
    admin.from("property_authorizations")
      .select("tipo, validade, aceite_at, versao, aceite_ip")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const CONDICAO: Record<string, string> = {
    autorizacao: "Autorização de venda (sem exclusividade)",
    exclusividade: "Exclusividade Arini",
    parceiro: "Imóvel de parceiro",
  };

  const owner = p.owner as unknown as { profile: { nome: string; telefone: string | null } } | null;
  const partner = p.partner as unknown as { razao_social: string; tipo: string; profile: { nome: string; telefone: string | null } } | null;
  const municipio = p.municipality as unknown as { nome: string; uf: string } | null;

  const areaDeclaradaM2 =
    p.area_declarada != null
      ? p.tipo === "rural" ? Number(p.area_declarada) * 10000 : Number(p.area_declarada)
      : null;
  const divergencia =
    geo?.area_m2 && areaDeclaradaM2
      ? Math.abs(geo.area_m2 - areaDeclaradaM2) / areaDeclaradaM2
      : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="font-mono text-xs text-texto-2">{p.codigo}</p>
        <h1 className="text-2xl font-semibold text-texto">{p.titulo}</h1>
        <p className="text-sm text-texto-2">
          {municipio ? `${municipio.nome} · ${municipio.uf}` : "Sem município"} · {p.tipo} ·{" "}
          <strong>{STATUS_LABEL[p.status]}</strong>
        </p>
      </div>

      <section className="cartao p-5 space-y-2">
        <h2 className="font-semibold text-texto">Checklist de análise</h2>
        <ul className="text-sm space-y-1.5">
          <li>{p.descricao ? "✅" : "⚠️"} Descrição {p.descricao ? "preenchida" : "vazia"}</li>
          <li>{p.valor ? "✅" : "⚠️"} Valor: {formatBRL(p.valor)}</li>
          <li>{geo ? "✅" : "❌"} Geometria {geo ? `(${geo.fonte}) — ${formatArea(geo.area_m2, p.tipo as "urbano" | "rural")}` : "ausente"}</li>
          {divergencia != null && (
            <li>
              {divergencia > 0.1 ? "⚠️" : "✅"} Área medida vs declarada:{" "}
              {(divergencia * 100).toFixed(1)}% de diferença
              {divergencia > 0.1 && " — confirmar com o anunciante"}
            </li>
          )}
          <li>{media?.length ? "✅" : "⚠️"} {media?.length ?? 0} foto(s)</li>
          <li>
            {autorizacao?.aceite_at ? "✅" : "⚠️"}{" "}
            {autorizacao
              ? <>
                  {CONDICAO[autorizacao.tipo] ?? autorizacao.tipo}
                  {autorizacao.aceite_at
                    ? <> — aceite eletrônico em {new Date(autorizacao.aceite_at).toLocaleString("pt-BR")}
                        {autorizacao.aceite_ip && ` (IP ${autorizacao.aceite_ip})`}, versão {autorizacao.versao}
                        {autorizacao.validade && `, válida até ${new Date(autorizacao.validade + "T12:00:00").toLocaleDateString("pt-BR")}`}</>
                    : " — sem aceite eletrônico: confira a autorização assinada nos documentos"}
                </>
              : p.exclusividade ? "Exclusividade (cadastro anterior aos termos, sem aceite registrado)" : "Sem autorização registrada (cadastro anterior aos termos)"}
          </li>
          <li>
            👤 Responsável:{" "}
            {partner
              ? `${partner.razao_social} (${partner.tipo}) — ${partner.profile?.telefone ?? "sem telefone"}`
              : owner
                ? `${owner.profile?.nome} (proprietário) — ${owner.profile?.telefone ?? "sem telefone"}`
                : "—"}
          </li>
        </ul>
        {p.motivo_correcao && (
          <p className="text-sm bg-alerta/10 text-alerta rounded px-3 py-2">
            Última observação enviada: {p.motivo_correcao}
          </p>
        )}
      </section>

      {geoJson && (
        <MiniMapa
          geometry={geoJson as GeoJSON.Geometry}
          status={p.status}
          className="h-80 w-full rounded-xl overflow-hidden border border-linha"
        />
      )}

      {!!media?.length && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {media.map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.storage_path} src={mediaUrl(m.storage_path)} alt="" className="h-28 w-full object-cover rounded-lg" />
          ))}
        </div>
      )}

      {p.tipo === "rural" && (
        <section className="cartao p-5 space-y-3">
          <div>
            <h2 className="font-semibold text-texto">Consulta territorial</h2>
            <p className="text-sm text-texto-2">
              Cruza a área do imóvel com mineração (ANM), terras indígenas (FUNAI), desmatamento (INPE)
              e pontos de interesse. Cada resultado guarda a origem e a data.
            </p>
          </div>
          <ConsultaRural propertyId={p.id} />
        </section>
      )}

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Documentos</h2>
        <DocumentosImovel propertyId={p.id} />
      </section>

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Decisão</h2>
        <DecisaoBotoes propertyId={p.id} />
      </section>
    </div>
  );
}
