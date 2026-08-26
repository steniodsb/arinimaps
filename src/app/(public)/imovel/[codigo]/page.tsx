import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import MiniMapa from "@/components/map/MiniMapa";
import InteresseForm from "@/components/InteresseForm";
import BotaoCompartilhar from "@/components/BotaoCompartilhar";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";

const CATEGORIA_LABEL: Record<string, string> = {
  combustivel: "Posto de combustível", farmacia: "Farmácia", supermercado: "Supermercado",
  hospital: "Hospital", escola: "Escola", centro: "Centro da cidade", acesso_rodovia: "Acesso à rodovia",
};

type Media = { tipo: string; path: string; capa: boolean };

async function getImovel(codigo: string) {
  const { data } = await supabaseAdmin().rpc("fn_property_public", { p_codigo: codigo });
  return data as {
    codigo: string; tipo: "urbano" | "rural"; status: string; titulo: string;
    descricao: string; valor: number | null; area_declarada: number | null;
    caracteristicas: Record<string, unknown>; condicoes_venda: string | null;
    aceita_permuta: boolean; aceita_financiamento: boolean;
    municipio: { nome: string; uf: string } | null;
    geometry: GeoJSON.Geometry | null; area_m2: number | null; perimeter_m: number | null;
    media: Media[];
  } | null;
}

export async function generateMetadata(
  { params }: PageProps<"/imovel/[codigo]">
): Promise<Metadata> {
  const { codigo } = await params;
  const imovel = await getImovel(codigo);
  if (!imovel) return { title: "Imóvel não encontrado" };
  const capa = imovel.media.find((m) => m.capa) ?? imovel.media[0];
  return {
    title: `${imovel.titulo} — ${imovel.codigo}`,
    description: imovel.descricao.slice(0, 160),
    openGraph: {
      title: imovel.titulo,
      description: `${formatBRL(imovel.valor)} · ${imovel.municipio?.nome ?? ""} — Arini Maps`,
      images: capa ? [mediaUrl(capa.path)] : [],
    },
  };
}

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export default async function PaginaImovel({ params }: PageProps<"/imovel/[codigo]">) {
  const { codigo } = await params;
  const imovel = await getImovel(codigo);
  if (!imovel) notFound();

  const admin = supabaseAdmin();
  const [{ data: tourData }, { data: video }] = await Promise.all([
    admin.rpc("fn_property_tour", { p_codigo: codigo }),
    admin.from("presentations").select("output_path")
      .eq("tipo", "video").eq("status", "pronto").not("output_path", "is", null)
      .in("property_id", (await admin.from("properties").select("id").eq("codigo", codigo)).data?.map((p) => p.id) ?? [])
      .maybeSingle(),
  ]);
  const pois = ((tourData as { pois?: { nome: string | null; categoria: string; distancia_m: number }[] } | null)?.pois ?? [])
    .slice(0, 10);

  const fotos = imovel.media.filter((m) => m.tipo === "foto");
  const benfeitorias = (imovel.caracteristicas?.benfeitorias as string[] | undefined) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="mx-auto max-w-6xl w-full px-4 py-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs bg-areia rounded px-2 py-1">{imovel.codigo}</span>
              <span className="text-xs rounded-full bg-verde text-white px-3 py-1">{STATUS_LABEL[imovel.status]}</span>
              <span className="text-xs rounded-full bg-areia px-3 py-1 capitalize">{imovel.tipo}</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-verde-escuro">{imovel.titulo}</h1>
            <p className="text-foreground/60">
              {imovel.municipio ? `${imovel.municipio.nome} · ${imovel.municipio.uf}` : "Região piloto"}
            </p>
          </div>

          {fotos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {fotos.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.path}
                  src={mediaUrl(f.path)}
                  alt={`${imovel.titulo} — foto ${i + 1}`}
                  className={`rounded-lg object-cover w-full ${i === 0 ? "col-span-2 row-span-2 h-full max-h-[420px]" : "h-40"}`}
                />
              ))}
            </div>
          )}

          {imovel.geometry && (
            <section>
              <h2 className="font-semibold text-verde-escuro mb-2">Localização e área</h2>
              <MiniMapa geometry={imovel.geometry} status={imovel.status} className="h-96 w-full rounded-xl overflow-hidden border border-linha" />
              <p className="mt-2 text-sm text-foreground/70">
                Área medida no mapa: <strong>{formatArea(imovel.area_m2, imovel.tipo)}</strong>
                {imovel.perimeter_m ? ` · perímetro ${(imovel.perimeter_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-semibold text-verde-escuro">Sobre o imóvel</h2>
            <p className="text-foreground/85 whitespace-pre-line leading-relaxed">{imovel.descricao}</p>
            {benfeitorias.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {benfeitorias.map((b) => (
                  <span key={b} className="text-xs rounded-full bg-areia px-3 py-1 capitalize">{b}</span>
                ))}
              </div>
            )}
          </section>

          {pois.length > 0 && (
            <section>
              <h2 className="font-semibold text-verde-escuro mb-2">Pontos de interesse próximos</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {pois.map((p, i) => (
                  <div key={i} className="rounded-lg border border-linha bg-white px-3 py-2 text-sm flex justify-between gap-2">
                    <span>{p.nome ?? CATEGORIA_LABEL[p.categoria] ?? p.categoria}</span>
                    <span className="text-foreground/50 tabular-nums shrink-0">
                      {(p.distancia_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-foreground/40 mt-1">Distâncias em linha reta, calculadas do centro do imóvel.</p>
            </section>
          )}

          {video?.output_path && (
            <section>
              <h2 className="font-semibold text-verde-escuro mb-2">Vídeo do imóvel</h2>
              <video controls className="w-full rounded-xl border border-linha" src={mediaUrl(video.output_path)} />
            </section>
          )}

          {imovel.condicoes_venda && (
            <section>
              <h2 className="font-semibold text-verde-escuro mb-1">Condições de venda</h2>
              <p className="text-foreground/85">{imovel.condicoes_venda}</p>
              <p className="text-sm text-foreground/60 mt-1">
                {imovel.aceita_permuta && "Aceita permuta. "}
                {imovel.aceita_financiamento && "Aceita financiamento."}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="rounded-xl bg-verde-escuro text-white p-5">
            <p className="text-sm text-white/70">Valor</p>
            <p className="text-3xl font-semibold text-ouro">{formatBRL(imovel.valor)}</p>
          </div>
          {imovel.geometry && (
            <Link href={`/imovel/${imovel.codigo}/tour`}
              className="block text-center rounded-xl bg-verde text-white font-semibold py-3 hover:bg-verde-escuro">
              ▶ Ver tour 3D da propriedade
            </Link>
          )}
          <BotaoCompartilhar codigo={imovel.codigo} titulo={imovel.titulo} />
          {imovel.status === "vendido" ? (
            <div className="rounded-xl border border-linha bg-white p-5 text-center text-foreground/70">
              Este imóvel já foi vendido pela Arini.
            </div>
          ) : (
            <InteresseForm codigo={imovel.codigo} />
          )}
          <p className="text-xs text-foreground/50 text-center">
            Intermediação central: Arini Negócios Imobiliários
          </p>
        </aside>
      </main>
    </div>
  );
}
