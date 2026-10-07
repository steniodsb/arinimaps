import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { carregarConsultaArea } from "@/lib/geo/consultaArea";
import { formatArea } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consulta de área rural" };

const TIPO: Record<string, string> = { IRU: "Imóvel rural", AST: "Assentamento", PCT: "Povos e comunidades tradicionais" };
const STATUS: Record<string, string> = { AT: "Ativo", PE: "Pendente", SU: "Suspenso", CA: "Cancelado" };

type Car = {
  geometry: GeoJSON.Geometry;
  properties: {
    cod: string; area_ha: number | null; condicao: string | null; status: string | null; tipo: string | null;
    municipio: string | null; atualizado_sicar: string | null; importado_em: string | null;
  };
};

/**
 * "Consultar informações" de uma área do CAR: os dados do cadastro e o
 * cruzamento com as fontes oficiais. Os dados do CAR são públicos e aparecem
 * para qualquer visitante; o cruzamento exige conta e fica registrado.
 */
export default async function ConsultaCar({ params }: PageProps<"/consulta/car/[cod]">) {
  const cod = decodeURIComponent((await params).cod);
  const admin = supabaseAdmin();
  const [{ data: carRaw }, { data: anuncio }, consulta] = await Promise.all([
    admin.rpc("fn_car_imovel", { p_cod: cod }),
    admin.from("properties").select("codigo, titulo, status").eq("car_codigo", cod)
      .in("status", ["publicado", "em_negociacao"]).limit(1).maybeSingle(),
    // o próprio CAR fica fora da lista: ele já é o assunto da página
    carregarConsultaArea(`car:${cod}`, { excluir: ["car"] }),
  ]);
  const car = carRaw as Car | null;
  if (!car?.geometry) notFound();
  const p = car.properties;

  const dados = [
    ["Área declarada", p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "—"],
    ["Município", p.municipio ?? "—"],
    ["Tipo", TIPO[p.tipo ?? ""] ?? p.tipo ?? "—"],
    ["Situação do cadastro", STATUS[p.status ?? ""] ?? p.status ?? "—"],
    ["Análise do órgão", p.condicao ?? "—"],
    ["Atualizado no SICAR", p.atualizado_sicar ? new Date(p.atualizado_sicar).toLocaleDateString("pt-BR") : "—"],
  ];

  return (
    <AppShell usuario={consulta.usuario}>
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs text-texto-2">Cadastro Ambiental Rural · consulta de área</p>
          <h1 className="text-2xl font-semibold text-texto">
            {p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "Área rural"}
            {p.municipio && <span className="text-texto-2 font-normal"> em {p.municipio}</span>}
          </h1>
          <p className="font-mono text-xs text-texto-2 break-all mt-1">{p.cod}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={car.geometry} status="publicado"
            className="h-80 w-full rounded-xl overflow-hidden border border-linha" />
          <div className="cartao p-5 space-y-3">
            <dl className="text-sm space-y-2">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-3 border-b border-linha last:border-0 pb-2">
                  <dt className="text-texto-2">{r}</dt><dd className="text-texto text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {anuncio ? (
              <Link href={`/imovel/${anuncio.codigo}`} className="btn-verde w-full text-center py-2.5 text-sm">
                Esta área está à venda — ver o anúncio
              </Link>
            ) : (
              <Link href={`/painel/novo?car=${encodeURIComponent(p.cod)}`} className="btn-ouro w-full text-center py-2.5 text-sm">
                Esta área é minha — anunciar
              </Link>
            )}
            <p className="text-[11px] text-texto-2 leading-snug">
              Dados públicos do SICAR, copiados em{" "}
              {p.importado_em ? new Date(p.importado_em).toLocaleDateString("pt-BR") : "—"}. O CAR é
              autodeclarado: não comprova propriedade nem substitui a matrícula.
            </p>
          </div>
        </div>

        <SecaoFontesOficiais
          url={`/api/consulta/car/${encodeURIComponent(p.cod)}`}
          descricao="Cruzamento da área (com 2 km ao redor) com mineração, terras indígenas, desmatamento, queimadas, unidades de conservação, água e energia. Cada resultado mostra o órgão e a data."
          logado={!!consulta.user} podeConsultar={consulta.podeConsultar} acesso={consulta.acesso}
          cotaRestante={consulta.cotaRestante} lista={consulta.lista} pendentes={consulta.pendentes}
          jaConsultou={consulta.jaConsultou} />
      </div>
    </AppShell>
  );
}
