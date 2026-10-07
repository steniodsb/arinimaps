import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { carregarConsultaArea } from "@/lib/geo/consultaArea";
import { CATEGORIA_POI_ICONE, CATEGORIA_POI_LABEL, formatDistancia, type PoiDistancia } from "@/lib/geo/distancia";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consulta de lote urbano" };

type Lote = {
  geometry: GeoJSON.Polygon;
  properties: {
    id: string; area_m2: number; perimetro_m: number; lados: { m: number }[];
    numero: string | null; quadra: string | null;
    municipio: string | null; uf: string | null; lng: number; lat: number; anuncio: string | null;
  };
};

const m2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const metros = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Consultar informações" do lote urbano (roadmap 2.10). Mostra o que a planta
 * da cidade diz do lote (área, perímetro, lados, quadra e número lidos do CAD),
 * os pontos de referência ao redor com a distância, e o cruzamento com as
 * fontes oficiais — este último com conta, plano e cota, como no rural.
 */
export default async function ConsultaLote({ params }: PageProps<"/consulta/lote/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = supabaseAdmin();
  const [{ data: loteRaw }, { data: raioCfg }, consulta] = await Promise.all([
    admin.rpc("fn_lote", { p_id: id }),
    admin.from("settings").select("valor").eq("chave", "poi_raio_urbano_m").maybeSingle(),
    carregarConsultaArea(`lote:${id}`),
  ]);
  const lote = loteRaw as Lote | null;
  if (!lote?.geometry) notFound();
  const p = lote.properties;

  const raio = Number(raioCfg?.valor ?? 4000) || 4000;
  const { data: poisRaw } = await admin.rpc("fn_pois_proximos", { p_lng: p.lng, p_lat: p.lat, p_raio_m: raio, p_por_categoria: 2 });
  const pois = ((poisRaw ?? []) as PoiDistancia[]).slice(0, 12);

  const identificacao = [p.quadra && `Quadra ${p.quadra}`, p.numero && `Lote ${p.numero}`].filter(Boolean).join(" · ");
  const dados: [string, string][] = [
    ["Município", p.municipio ? `${p.municipio}${p.uf ? ` — ${p.uf}` : ""}` : "—"],
    ["Quadra", p.quadra ?? "não identificada na planta"],
    ["Número do lote", p.numero ?? "não identificado na planta"],
    ["Área", `${m2(p.area_m2)} m²`],
    ["Perímetro", `${metros(p.perimetro_m)} m`],
    ["Lados", `${p.lados.filter((l) => l.m >= 1).map((l) => metros(l.m)).join(" · ")} m`],
    ["Centro do lote", `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`],
  ];

  return (
    <AppShell usuario={consulta.usuario}>
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs text-texto-2">Lote urbano · consulta de área</p>
          <h1 className="text-2xl font-semibold text-texto">
            {identificacao || `${m2(p.area_m2)} m²`}
            {p.municipio && <span className="text-texto-2 font-normal"> em {p.municipio}</span>}
          </h1>
          {identificacao && <p className="text-sm text-texto-2 mt-1">{m2(p.area_m2)} m² pela planta da cidade</p>}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={lote.geometry} status="publicado"
            className="h-80 w-full rounded-xl overflow-hidden border border-linha" />
          <div className="cartao p-5 space-y-3">
            <dl className="text-sm space-y-2">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-3 border-b border-linha last:border-0 pb-2">
                  <dt className="text-texto-2 shrink-0">{r}</dt><dd className="text-texto text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {p.anuncio ? (
              <Link href={`/imovel/${p.anuncio}`} className="btn-verde w-full text-center py-2.5 text-sm">
                Este lote está à venda — ver o anúncio
              </Link>
            ) : (
              <Link href={`/painel/novo?lote=${p.id}`} className="btn-ouro w-full text-center py-2.5 text-sm">
                Este lote é meu — anunciar
              </Link>
            )}
            <p className="text-[11px] text-texto-2 leading-snug">
              Medidas, quadra e número lidos da planta da cidade (CAD da prefeitura). São referência: não
              substituem a matrícula nem o levantamento do lote.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-texto text-lg">Pontos de referência próximos</h2>
            <p className="text-sm text-texto-2">Distância em linha reta do centro do lote, até {formatDistancia(raio)}.</p>
          </div>
          {pois.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {pois.map((poi, i) => (
                <div key={i} className="cartao px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-texto">
                      <span aria-hidden className="mr-1.5">{CATEGORIA_POI_ICONE[poi.categoria] ?? "•"}</span>
                      {poi.nome ?? CATEGORIA_POI_LABEL[poi.categoria] ?? poi.categoria}
                    </span>
                    {poi.nome && <span className="block text-[11px] text-texto-2">{CATEGORIA_POI_LABEL[poi.categoria] ?? poi.categoria}</span>}
                  </span>
                  <span className="font-medium tabular-nums text-texto shrink-0">{formatDistancia(poi.distancia_m)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="cartao p-5 text-sm text-texto-2">
              Nenhum ponto de referência no cache para esta região ainda. Ao consultar as fontes oficiais, os pontos
              ao redor do lote são buscados no OpenStreetMap.
            </p>
          )}
        </section>

        <SecaoFontesOficiais
          url={`/api/consulta/lote/${p.id}`}
          alvo="o lote"
          descricao="Cruzamento do lote (com 500 m ao redor) com CAR, mineração, terras indígenas, desmatamento, queimadas, unidades de conservação, água e energia. Cada resultado mostra o órgão e a data."
          logado={!!consulta.user} podeConsultar={consulta.podeConsultar} acesso={consulta.acesso}
          cotaRestante={consulta.cotaRestante} lista={consulta.lista} pendentes={consulta.pendentes}
          jaConsultou={consulta.jaConsultou} />
      </div>
    </AppShell>
  );
}
