import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Moldura from "@/components/shell/Moldura";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { CabecalhoPagina, Conteudo, PilulaPonto, Secao } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { carregarConsultaArea } from "@/lib/geo/consultaArea";
import { formatArea } from "@/lib/format";
import IndicadoresMunicipio from "@/components/rural/IndicadoresMunicipio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consulta de área desenhada" };

type Area = {
  chave: string; area_ha: number; created_at: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  lng: number; lat: number; municipio: string | null;
};

/**
 * Consulta de uma área desenhada no mapa, em qualquer ponto do Brasil
 * (roadmap 5.6). A área chega aqui já registrada por POST /api/consulta/area;
 * a chave (`geo:<sha1>`) é a própria geometria — o link pode ser guardado e
 * reaberto, e quem desenhar a mesma área cai no mesmo resultado.
 */
export default async function ConsultaAreaDesenhada({ params }: PageProps<"/consulta/area/[chave]">) {
  const bruta = decodeURIComponent((await params).chave);
  const chave = bruta.startsWith("geo:") ? bruta : `geo:${bruta}`;
  if (!/^geo:[0-9a-f]{40}$/.test(chave)) notFound();
  const [{ data: areaRaw }, consulta] = await Promise.all([
    supabaseAdmin().rpc("fn_area_consulta", { p_chave: chave }),
    carregarConsultaArea(chave),
  ]);
  const area = areaRaw as Area | null;
  if (!area?.geometry) notFound();

  const tamanho = formatArea(Number(area.area_ha) * 10_000, Number(area.area_ha) >= 1 ? "rural" : "urbano");
  const municipio = area.municipio ?? "fora da região cadastrada";
  const centro = `${area.lat.toFixed(5)}, ${area.lng.toFixed(5)}`;
  const desenhadaEm = new Date(area.created_at).toLocaleDateString("pt-BR");
  const dados: [string, string][] = [
    ["Área desenhada", tamanho],
    ["Município", municipio],
    ["Ponto central", centro],
    ["Desenhada em", desenhadaEm],
  ];

  return (
    <Moldura usuario={consulta.usuario}>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="01 · Consulta territorial"
        titulo={tamanho}
        destaque={area.municipio ? `em ${area.municipio}` : undefined}
        subtitulo="Área desenhada no mapa · consulta de área"
      >
        <PilulaPonto>Área aproximada</PilulaPonto>
      </CabecalhoPagina>

      <Conteudo className="py-12 md:py-16 space-y-12 md:space-y-16">
        <Secao eyebrow="02 · Divisa no mapa" titulo="Dados da área">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={area.geometry} status="publicado"
            className="h-80 lg:h-full lg:min-h-80 w-full rounded-[20px] overflow-hidden border border-linha" />
          <div className="cartao p-6 space-y-5">
            <p className="lp-display text-5xl leading-none text-verde">{tamanho}</p>
            <dl className="divide-y divide-linha border-y border-linha">
              {dados.map(([r, v]) => (
                <div key={r} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-texto-2">{r}</dt>
                  <dd className="text-right text-[0.95rem] font-semibold text-texto">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-texto-2 leading-relaxed border-t border-linha pt-4">
              A área foi desenhada à mão sobre o satélite: é aproximada. Para uma análise do imóvel, use a divisa
              do CAR ou da matrícula.
            </p>
          </div>
        </div>
        </Secao>

        <IndicadoresMunicipio ponto={{ lng: area.lng, lat: area.lat }} />

        <SecaoFontesOficiais
          url="/api/consulta/area"
          corpo={{ chave }}
          descricao="Cruzamento da área desenhada (com 2 km ao redor) com CAR, mineração, terras indígenas, desmatamento, queimadas, unidades de conservação, água e energia. Vale para qualquer ponto do Brasil."
          logado={!!consulta.user} podeConsultar={consulta.podeConsultar} acesso={consulta.acesso}
          cotaRestante={consulta.cotaRestante} lista={consulta.lista} pendentes={consulta.pendentes}
          jaConsultou={consulta.jaConsultou} />
      </Conteudo>
    </Moldura>
  );
}
