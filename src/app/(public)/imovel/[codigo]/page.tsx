import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import { currentUser } from "@/lib/supabase/server";
import MiniMapa from "@/components/map/MiniMapa";
import InteresseForm from "@/components/InteresseForm";
import BotaoCompartilhar from "@/components/BotaoCompartilhar";
import GaleriaImovel, { type Slide } from "@/components/GaleriaImovel";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";

const CATEGORIA_LABEL: Record<string, string> = {
  combustivel: "Posto de combustível", farmacia: "Farmácia", supermercado: "Supermercado",
  hospital: "Hospital", escola: "Escola", centro: "Centro da cidade", acesso_rodovia: "Acesso à rodovia",
};

type Media = { tipo: string; path: string; capa: boolean };

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

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
      description: `${formatBRL(imovel.valor)} · ${imovel.municipio?.nome ?? ""} — Arini Imóveis Brasil`,
      images: capa ? [mediaUrl(capa.path)] : [],
    },
  };
}

/** Ficha técnica: mostra só o que o anúncio realmente informou. */
function fichaTecnica(
  c: Record<string, unknown>,
  areaM2: number | null,
  tipo: "urbano" | "rural"
): { rotulo: string; valor: string; icone: string }[] {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const itens: { rotulo: string; valor: string; icone: string }[] = [];
  const add = (chave: string, rotulo: string, icone: string) => {
    const v = c[chave];
    if (v != null && v !== "" && num(v) > 0) itens.push({ rotulo, valor: String(num(v)), icone });
  };
  add("quartos", "Quartos", "🛏️");
  add("suites", "Suítes", "🚪");
  add("banheiros", "Banheiros", "🛁");
  add("vagas", "Vagas", "🚗");
  if (areaM2) itens.push({ rotulo: "Área", valor: formatArea(areaM2, tipo), icone: "📐" });
  if (typeof c.zoneamento === "string") itens.push({ rotulo: "Zoneamento", valor: c.zoneamento, icone: "🏗️" });
  if (typeof c.solo === "string") itens.push({ rotulo: "Solo", valor: c.solo, icone: "🌱" });
  return itens;
}

export default async function PaginaImovel({ params }: PageProps<"/imovel/[codigo]">) {
  const { codigo } = await params;
  const imovel = await getImovel(codigo);
  if (!imovel) notFound();

  const admin = supabaseAdmin();
  const { data: propId } = await admin.from("properties").select("id").eq("codigo", codigo).single();
  const [{ data: tourData }, { data: video }, { data: unidades }, { data: whats }] = await Promise.all([
    admin.rpc("fn_property_tour", { p_codigo: codigo }),
    admin.from("presentations").select("output_path")
      .eq("tipo", "video").eq("status", "pronto").not("output_path", "is", null)
      .eq("property_id", propId?.id ?? "").maybeSingle(),
    admin.from("properties")
      .select("codigo, titulo, valor, status")
      .eq("parent_property_id", propId?.id ?? "")
      .in("status", ["publicado", "em_negociacao", "vendido"])
      .order("titulo"),
    admin.from("settings").select("valor").eq("chave", "whatsapp_central").maybeSingle(),
  ]);

  const pois = ((tourData as { pois?: { nome: string | null; categoria: string; distancia_m: number }[] } | null)?.pois ?? [])
    .slice(0, 10);
  const centroid = (tourData as { centroid?: { lng: number; lat: number } } | null)?.centroid;
  const whatsapp = (typeof whats?.valor === "string" ? whats.valor : null)
    ?? process.env.NEXT_PUBLIC_WHATSAPP_ARINI
    ?? null;

  const fotos = imovel.media.filter((m) => m.tipo === "foto");
  const benfeitorias = (imovel.caracteristicas?.benfeitorias as string[] | undefined) ?? [];
  const ficha = fichaTecnica(imovel.caracteristicas ?? {}, imovel.area_m2, imovel.tipo);
  const vendido = imovel.status === "vendido";

  // slides: fotos → vídeo (se pronto) → tour 3D (se houver geometria)
  const slides: Slide[] = [
    ...fotos.map((f) => ({ tipo: "foto" as const, url: mediaUrl(f.path) })),
    ...(video?.output_path ? [{ tipo: "video" as const, url: mediaUrl(video.output_path) }] : []),
    ...(imovel.geometry
      ? [{ tipo: "tour" as const, href: `/imovel/${imovel.codigo}/tour`, poster: fotos[0] ? mediaUrl(fotos[0].path) : null }]
      : []),
  ];

  const user = await currentUser();
  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  return (
    <AppShell usuario={usuario} semPadding>
      {/* trilha de navegação */}
      <div className="border-b border-linha bg-superficie">
        <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-texto-2 flex items-center gap-2 flex-wrap">
          <Link href="/" className="hover:text-verde">Home</Link>
          <span>/</span>
          <Link href="/mapa" className="hover:text-verde">Imóveis</Link>
          <span>/</span>
          <span className="text-texto font-medium">{imovel.titulo}</span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl w-full px-4 py-8">
        <Link href="/mapa" className="inline-flex items-center gap-2 text-sm text-texto-2 hover:text-verde mb-5">
          ← Voltar para o mapa
        </Link>

        {/* cabeçalho */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className={`text-xs font-semibold rounded-full px-4 py-1.5 text-white ${vendido ? "bg-gray-500" : "bg-verde"}`}>
            {vendido ? "VENDIDO" : "DISPONÍVEL"}
          </span>
          <span className="text-sm text-texto-2">
            📍 {imovel.municipio ? `${imovel.municipio.nome} / ${imovel.municipio.uf}` : "Região piloto"}
          </span>
          <span className="text-sm text-texto-2 font-mono"># {imovel.codigo}</span>
          <span className="text-xs rounded-full bg-superficie-2 px-3 py-1 capitalize">{imovel.tipo}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-texto leading-tight text-balance">
          {imovel.titulo}
        </h1>
        <p className="mt-1 mb-7">
          <span className="texto-ouro text-3xl sm:text-4xl font-bold">{formatBRL(imovel.valor)}</span>
          <span className="text-texto-2 ml-2">Venda</span>
        </p>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px] items-start">
          {/* ---------- coluna principal ---------- */}
          <div className="space-y-8 min-w-0">
            {slides.length > 0 && <GaleriaImovel slides={slides} titulo={imovel.titulo} />}

            {ficha.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ficha.map((f) => (
                  <div key={f.rotulo} className="cartao p-4">
                    <p className="text-lg">{f.icone}</p>
                    <p className="text-lg font-semibold text-texto leading-tight mt-1">{f.valor}</p>
                    <p className="text-[11px] uppercase tracking-wide text-texto-2">{f.rotulo}</p>
                  </div>
                ))}
              </div>
            )}

            {benfeitorias.length > 0 && (
              <div className="cartao p-5">
                <p className="text-xs font-semibold tracking-[0.18em] text-ouro-escuro uppercase mb-3">Diferenciais</p>
                <ul className="grid sm:grid-cols-2 gap-2.5">
                  {benfeitorias.map((b) => (
                    <li key={b} className="flex items-center gap-2.5 text-sm">
                      <span className="w-6 h-6 rounded-full bg-ouro/15 text-ouro-escuro grid place-items-center text-xs shrink-0">✓</span>
                      <span className="capitalize">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section>
              <h2 className="text-2xl font-semibold text-texto mb-3">Sobre o imóvel</h2>
              <div className="text-texto whitespace-pre-line leading-relaxed max-w-[68ch]">
                {imovel.descricao || "Descrição não informada."}
              </div>
            </section>

            {imovel.geometry && (
              <section>
                <h2 className="text-2xl font-semibold text-texto mb-3">Localização e área</h2>
                <MiniMapa geometry={imovel.geometry} status={imovel.status}
                  className="h-96 w-full rounded-2xl overflow-hidden border border-linha" />
                <p className="mt-2 text-sm text-texto-2">
                  Área medida no mapa: <strong>{formatArea(imovel.area_m2, imovel.tipo)}</strong>
                  {imovel.perimeter_m ? ` · perímetro ${(imovel.perimeter_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null}
                  {imovel.area_declarada ? ` · área declarada pelo anunciante: ${imovel.area_declarada.toLocaleString("pt-BR")} ${imovel.tipo === "rural" ? "ha" : "m²"}` : null}
                </p>
              </section>
            )}

            {!!unidades?.length && (
              <section>
                <h2 className="text-2xl font-semibold text-texto mb-3">Unidades deste empreendimento</h2>
                <div className="cartao divide-y divide-linha overflow-hidden">
                  {unidades.map((u) => (
                    <Link key={u.codigo} href={`/imovel/${u.codigo}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-superficie-2 transition">
                      <span className="font-medium flex-1">{u.titulo}</span>
                      <span className="text-sm text-verde font-medium">{formatBRL(u.valor)}</span>
                      <span className={`text-xs rounded-full px-3 py-1 ${u.status === "vendido" ? "bg-gray-200 text-gray-600" : "bg-verde/10 text-verde"}`}>
                        {STATUS_LABEL[u.status]}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {pois.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold text-texto mb-3">Pontos de interesse próximos</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pois.map((p, i) => (
                    <div key={i} className="cartao px-4 py-2.5 text-sm flex justify-between gap-2">
                      <span>{p.nome ?? CATEGORIA_LABEL[p.categoria] ?? p.categoria}</span>
                      <span className="text-texto-2 tabular-nums shrink-0">
                        {(p.distancia_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-texto-2 mt-2">Distâncias em linha reta, do centro do imóvel.</p>
              </section>
            )}

            {imovel.condicoes_venda && (
              <section>
                <h2 className="text-2xl font-semibold text-texto mb-2">Condições de venda</h2>
                <p className="text-texto">{imovel.condicoes_venda}</p>
                <p className="text-sm text-texto-2 mt-1">
                  {imovel.aceita_permuta && "Aceita permuta. "}
                  {imovel.aceita_financiamento && "Aceita financiamento."}
                </p>
              </section>
            )}
          </div>

          {/* ---------- coluna lateral ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            {vendido ? (
              <div className="cartao p-6 text-center text-texto-2">
                Este imóvel já foi vendido pela Arini.
                <Link href="/mapa" className="btn-ouro block mt-4 py-3">Ver outros imóveis</Link>
              </div>
            ) : (
              <InteresseForm codigo={imovel.codigo} titulo={imovel.titulo} whatsapp={whatsapp} />
            )}

            {imovel.geometry && (
              <Link href={`/imovel/${imovel.codigo}/tour`}
                className="block text-center rounded-2xl bg-verde-escuro text-white font-semibold py-3.5 hover:bg-verde transition">
                ▶ Ver tour 3D da propriedade
              </Link>
            )}
            <BotaoCompartilhar codigo={imovel.codigo} titulo={imovel.titulo} />
            {centroid && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${centroid.lat},${centroid.lng}`}
                target="_blank" rel="noreferrer"
                className="block text-center cartao font-medium py-3 hover:bg-superficie-2 transition">
                📍 Como chegar até o imóvel
              </a>
            )}
            <p className="text-xs text-texto-2 text-center">
              Intermediação: Arini Negócios Imobiliários
            </p>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
