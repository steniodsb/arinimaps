import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { carregarConsultaArea } from "@/lib/geo/consultaArea";
import { formatArea } from "@/lib/format";

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

  const dados: [string, string][] = [
    ["Área desenhada", formatArea(Number(area.area_ha) * 10_000, Number(area.area_ha) >= 1 ? "rural" : "urbano")],
    ["Município", area.municipio ?? "fora da região cadastrada"],
    ["Ponto central", `${area.lat.toFixed(5)}, ${area.lng.toFixed(5)}`],
    ["Desenhada em", new Date(area.created_at).toLocaleDateString("pt-BR")],
  ];

  return (
    <AppShell usuario={consulta.usuario}>
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs text-texto-2">Área desenhada no mapa · consulta de área</p>
          <h1 className="text-2xl font-semibold text-texto">
            {formatArea(Number(area.area_ha) * 10_000, Number(area.area_ha) >= 1 ? "rural" : "urbano")}
            {area.municipio && <span className="text-texto-2 font-normal"> em {area.municipio}</span>}
          </h1>
          <p className="font-mono text-[11px] text-texto-2 break-all mt-1">{chave}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={area.geometry} status="publicado"
            className="h-80 w-full rounded-xl overflow-hidden border border-linha" />
          <div className="cartao p-5 space-y-3">
            <dl className="text-sm space-y-2">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-3 border-b border-linha last:border-0 pb-2">
                  <dt className="text-texto-2 shrink-0">{r}</dt><dd className="text-texto text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-texto-2 leading-snug">
              A área foi desenhada à mão sobre o satélite: é aproximada. Para uma análise do imóvel, use a divisa
              do CAR ou da matrícula.
            </p>
          </div>
        </div>

        <SecaoFontesOficiais
          url="/api/consulta/area"
          corpo={{ chave }}
          descricao="Cruzamento da área desenhada (com 2 km ao redor) com CAR, mineração, terras indígenas, desmatamento, queimadas, unidades de conservação, água e energia. Vale para qualquer ponto do Brasil."
          logado={!!consulta.user} podeConsultar={consulta.podeConsultar} acesso={consulta.acesso}
          cotaRestante={consulta.cotaRestante} lista={consulta.lista} pendentes={consulta.pendentes}
          jaConsultou={consulta.jaConsultou} />
      </div>
    </AppShell>
  );
}
