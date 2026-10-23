import { Banknote, Landmark, Maximize2, Sprout, Users, UsersRound } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Estatistica, Secao } from "@/components/ui/Pagina";

type Indicador = { valor: number; ano: number; unidade: string; fonte: string };
type Municipio = {
  cod_ibge: number; nome: string; uf: string;
  indicadores: Partial<Record<
    "populacao_censo" | "populacao_estimada" | "area_km2" | "densidade" | "pib_mil_reais" | "pib_per_capita" | "agropecuaria_pct",
    Indicador
  >>;
  indicadores_em: string | null;
};

const num = (v: number, casas = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** R$ em mil → texto curto ("R$ 2,86 bi", "R$ 775 mi") */
const reaisMil = (mil: number) => {
  const r = mil * 1000;
  if (r >= 1e9) return `R$ ${num(r / 1e9, 2)} bi`;
  if (r >= 1e6) return `R$ ${num(r / 1e6, 0)} mi`;
  return `R$ ${num(r, 0)}`;
};

/**
 * O município da área consultada pelos números do IBGE (item 8 do levantamento
 * do Carlos, 22/10/2026): população do Censo e estimada, área, densidade, PIB,
 * PIB por habitante e o peso da agropecuária. Cada número leva o ano — o IBGE
 * publica cada um num calendário (Censo 2022, PIB até 2023, agro por
 * município até 2021). Lê o banco (ibge_municipios, scripts/ibge-importa.mjs).
 *
 * Recebe o código do IBGE quando a página sabe (CAR: está no código do
 * imóvel) ou um ponto, e acha o município que o contém.
 */
export default async function IndicadoresMunicipio({ codIbge, ponto }: {
  codIbge?: number | null; ponto?: { lng: number; lat: number } | null;
}) {
  const admin = supabaseAdmin();
  const { data } = codIbge
    ? await admin.rpc("fn_ibge_municipio", { p_cod: codIbge })
    : ponto
      ? await admin.rpc("fn_municipio_no_ponto", { p_lng: ponto.lng, p_lat: ponto.lat })
      : { data: null };
  const m = data as Municipio | null;
  const i = m?.indicadores ?? {};
  if (!m || !Object.keys(i).length) return null;

  const cartoes = [
    i.populacao_censo && { icone: Users, valor: num(i.populacao_censo.valor), rotulo: `Habitantes (Censo ${i.populacao_censo.ano})` },
    i.populacao_estimada && { icone: UsersRound, valor: num(i.populacao_estimada.valor), rotulo: `População estimada ${i.populacao_estimada.ano}` },
    i.area_km2 && { icone: Maximize2, valor: `${num(i.area_km2.valor, 1)} km²`, rotulo: i.densidade ? `Área · ${num(i.densidade.valor, 1)} hab/km²` : "Área do município" },
    i.pib_mil_reais && { icone: Landmark, valor: reaisMil(i.pib_mil_reais.valor), rotulo: `PIB ${i.pib_mil_reais.ano}` },
    i.pib_per_capita && { icone: Banknote, valor: `R$ ${num(i.pib_per_capita.valor)}`, rotulo: `PIB por habitante (${i.pib_per_capita.ano})` },
    i.agropecuaria_pct && { icone: Sprout, valor: `${num(i.agropecuaria_pct.valor, 1)}%`, rotulo: `Agropecuária no PIB (${i.agropecuaria_pct.ano})` },
  ].filter(Boolean) as { icone: typeof Users; valor: string; rotulo: string }[];

  return (
    <Secao eyebrow="Contexto do município · IBGE" titulo={`${m.nome}/${m.uf}`}
      subtitulo="Números oficiais do IBGE, cada um com o ano de referência.">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cartoes.map((c) => <Estatistica key={c.rotulo} icone={c.icone} valor={c.valor} rotulo={c.rotulo} />)}
      </div>
      <p className="text-xs leading-relaxed text-texto-2">
        Fonte: IBGE (Censo Demográfico 2022, Estimativas da População e PIB dos Municípios), código {m.cod_ibge}.
        {m.indicadores_em && <> Copiado do IBGE em {new Date(m.indicadores_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</>}
        {" "}O PIB por habitante usa o PIB e a população do mesmo ano.
      </p>
    </Secao>
  );
}
