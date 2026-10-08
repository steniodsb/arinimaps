import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Hash, MapPin, Ruler, Square } from "lucide-react";
import Moldura from "@/components/shell/Moldura";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { IconePoi } from "@/components/map/UiMapa";
import { BotaoLink, CabecalhoPagina, Conteudo, Estatistica, Secao } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { carregarConsultaArea } from "@/lib/geo/consultaArea";
import { CATEGORIA_POI_LABEL, formatDistancia, type PoiDistancia } from "@/lib/geo/distancia";

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
  const municipio = p.municipio ? `${p.municipio}${p.uf ? ` — ${p.uf}` : ""}` : "—";
  const dados: [string, string][] = [
    ["Município", municipio],
    ["Quadra", p.quadra ?? "não identificada na planta"],
    ["Número do lote", p.numero ?? "não identificado na planta"],
    ["Área", `${m2(p.area_m2)} m²`],
    ["Perímetro", `${metros(p.perimetro_m)} m`],
    ["Lados", `${p.lados.filter((l) => l.m >= 1).map((l) => metros(l.m)).join(" · ")} m`],
    ["Centro do lote", `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`],
  ];

  return (
    <Moldura usuario={consulta.usuario}>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Consulta territorial"
        titulo={identificacao || `${m2(p.area_m2)} m²`}
        destaque={p.municipio ? `em ${p.municipio}` : undefined}
        subtitulo={identificacao
          ? `Lote urbano · ${m2(p.area_m2)} m² pela planta da cidade`
          : "Lote urbano · consulta de área"}
        acoes={p.anuncio ? (
          <BotaoLink href={`/imovel/${p.anuncio}`}>Este lote está à venda — ver o anúncio</BotaoLink>
        ) : (
          <BotaoLink href={`/painel/novo?lote=${p.id}`} variante="ouro">Este lote é meu — anunciar</BotaoLink>
        )}
      />

      <Conteudo className="py-12 md:py-16 space-y-12 md:space-y-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Estatistica icone={Square} valor={`${m2(p.area_m2)} m²`} rotulo="Área do lote" />
          <Estatistica icone={Ruler} valor={`${metros(p.perimetro_m)} m`} rotulo="Perímetro" />
          <Estatistica icone={Hash} valor={[p.quadra && `Q ${p.quadra}`, p.numero && `L ${p.numero}`].filter(Boolean).join(" · ") || "—"} rotulo="Quadra e lote" />
          <Estatistica icone={MapPin} valor={p.municipio ?? "—"} rotulo="Município" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={lote.geometry} status="publicado"
            className="h-80 lg:h-full lg:min-h-96 w-full rounded-[20px] overflow-hidden border border-linha" />
          <div className="cartao p-6 space-y-5">
            <h2 className="lp-display text-xl text-texto">Dados da planta</h2>
            <dl className="text-[0.95rem] divide-y divide-linha">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-4 py-3">
                  <dt className="text-texto-2 shrink-0">{r}</dt><dd className="text-texto font-medium text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-texto-2 leading-relaxed border-t border-linha pt-4">
              Medidas, quadra e número lidos da planta da cidade (CAD da prefeitura). São referência: não
              substituem a matrícula nem o levantamento do lote.
            </p>
          </div>
        </div>

        <Secao eyebrow="Entorno" titulo="Pontos de referência próximos"
          subtitulo={`Distância em linha reta do centro do lote, até ${formatDistancia(raio)}.`}>
          {pois.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pois.map((poi, i) => (
                <div key={i} className="cartao flex items-center justify-between gap-3 p-4">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde">
                      <IconePoi categoria={poi.categoria} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-texto">
                        {poi.nome ?? CATEGORIA_POI_LABEL[poi.categoria] ?? poi.categoria}
                      </span>
                      {poi.nome && <span className="block text-xs text-texto-2">{CATEGORIA_POI_LABEL[poi.categoria] ?? poi.categoria}</span>}
                    </span>
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums text-texto shrink-0">{formatDistancia(poi.distancia_m)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="cartao p-6 text-base leading-relaxed text-texto-2">
              Nenhum ponto de referência no cache para esta região ainda. Ao consultar as fontes oficiais, os pontos
              ao redor do lote são buscados no OpenStreetMap.
            </p>
          )}
        </Secao>

        <SecaoFontesOficiais
          url={`/api/consulta/lote/${p.id}`}
          alvo="o lote"
          descricao="Cruzamento do lote (com 500 m ao redor) com CAR, mineração, terras indígenas, desmatamento, queimadas, unidades de conservação, água e energia. Cada resultado mostra o órgão e a data."
          logado={!!consulta.user} podeConsultar={consulta.podeConsultar} acesso={consulta.acesso}
          cotaRestante={consulta.cotaRestante} lista={consulta.lista} pendentes={consulta.pendentes}
          jaConsultou={consulta.jaConsultou} />
      </Conteudo>
    </Moldura>
  );
}
