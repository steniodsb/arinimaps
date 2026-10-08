import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, MapPin, Ruler, ShieldCheck } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import MiniMapa from "@/components/map/MiniMapa";
import SecaoFontesOficiais from "@/components/map/SecaoFontesOficiais";
import { BotaoLink, CabecalhoPagina, Conteudo, Estatistica } from "@/components/ui/Pagina";
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

  const area = p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "—";
  const situacao = STATUS[p.status ?? ""] ?? p.status ?? "—";
  const atualizado = p.atualizado_sicar ? new Date(p.atualizado_sicar).toLocaleDateString("pt-BR") : "—";
  const dados = [
    ["Área declarada", area],
    ["Município", p.municipio ?? "—"],
    ["Tipo", TIPO[p.tipo ?? ""] ?? p.tipo ?? "—"],
    ["Situação do cadastro", situacao],
    ["Análise do órgão", p.condicao ?? "—"],
    ["Atualizado no SICAR", atualizado],
  ];

  return (
    <AppShell usuario={consulta.usuario} semPadding>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Consulta territorial"
        titulo={p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "Área rural"}
        destaque={p.municipio ? `em ${p.municipio}` : undefined}
        subtitulo="Cadastro Ambiental Rural · consulta de área"
        acoes={anuncio ? (
          <BotaoLink href={`/imovel/${anuncio.codigo}`}>Esta área está à venda — ver o anúncio</BotaoLink>
        ) : (
          <BotaoLink href={`/painel/novo?car=${encodeURIComponent(p.cod)}`} variante="ouro">Esta área é minha — anunciar</BotaoLink>
        )}
      >
        <p className="font-mono text-xs text-texto-2 break-all">{p.cod}</p>
      </CabecalhoPagina>

      <Conteudo className="py-12 md:py-16 space-y-12 md:space-y-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Estatistica icone={Ruler} valor={area} rotulo="Área declarada" />
          <Estatistica icone={MapPin} valor={p.municipio ?? "—"} rotulo="Município" />
          <Estatistica icone={ShieldCheck} valor={situacao} rotulo="Situação do cadastro" />
          <Estatistica icone={CalendarDays} valor={atualizado} rotulo="Atualizado no SICAR" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={car.geometry} status="publicado"
            className="h-80 lg:h-full lg:min-h-96 w-full rounded-[20px] overflow-hidden border border-linha" />
          <div className="cartao p-6 space-y-5">
            <h2 className="lp-display text-xl text-texto">Dados do cadastro</h2>
            <dl className="text-[0.95rem] divide-y divide-linha">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-4 py-3">
                  <dt className="text-texto-2 shrink-0">{r}</dt><dd className="text-texto font-medium text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-texto-2 leading-relaxed border-t border-linha pt-4">
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
      </Conteudo>
    </AppShell>
  );
}
