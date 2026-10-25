import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea, plural } from "@/lib/format";
import { lerConfiguracoes, texto } from "@/lib/settings";
import BotoesRelatorio from "./BotoesRelatorio";
import { currentUser } from "@/lib/supabase/server";
import { registrarEventoImovel } from "@/lib/imovel/eventos";
import { formatDistancia, formatPerimetro, nomePoi, poisOrdenados } from "@/lib/geo/distancia";
import { detalhesRegistro } from "@/lib/rural/detalhes";
import MarcaArini from "@/components/marca/MarcaArini";
import { Etiqueta } from "@/components/ui/Pagina";

export const metadata: Metadata = { title: "Relatório Territorial" };

const CATEGORIA_LABEL: Record<string, string> = {
  combustivel: "Posto de combustível", farmacia: "Farmácia", supermercado: "Supermercado",
  hospital: "Hospital", escola: "Escola", centro: "Centro da cidade", acesso_rodovia: "Acesso à rodovia",
};

type Item = { titulo: string; detalhe?: string; extra?: Record<string, string | number | null> };
type Fonte = {
  id: string; nome: string; orgao: string; ativa: boolean; observacao: string | null;
  consulta: { quantidade: number; incide: boolean; raio_m: number; resultado: { itens?: Item[] }; erro: string | null; consultado_em: string } | null;
};

export default async function RelatorioTerritorial({ params }: PageProps<"/imovel/[codigo]/relatorio">) {
  const { codigo } = await params;
  const admin = supabaseAdmin();

  const { data: imovel } = await admin
    .from("properties")
    .select(`
      id, codigo, titulo, tipo, status, valor, descricao, area_declarada, caracteristicas,
      municipality:municipalities(nome, uf)
    `)
    .eq("codigo", codigo)
    .in("status", ["publicado", "em_negociacao", "vendido"])
    .maybeSingle();
  if (!imovel) notFound();

  const [{ data: geo }, { data: relatorio }, { data: tour }, cfg, user] = await Promise.all([
    admin.from("property_geometries").select("area_m2, perimeter_m, fonte").eq("property_id", imovel.id).maybeSingle(),
    admin.rpc("fn_consulta_rural", { p_property_id: imovel.id }),
    admin.rpc("fn_property_tour", { p_codigo: codigo }),
    lerConfiguracoes(),
    currentUser(),
  ]);
  // §1.1: relatório territorial aberto vira evento do imóvel
  void registrarEventoImovel({ propertyId: imovel.id, tipo: "relatorio", userId: user?.id, detalhe: { codigo } });

  const municipio = imovel.municipality as unknown as { nome: string; uf: string } | null;
  const fontes = ((relatorio as { fontes?: Fonte[] } | null)?.fontes ?? []);
  const pois = poisOrdenados((tour as { pois?: { nome: string | null; categoria: string; distancia_m: number }[] } | null)?.pois ?? []);
  const consultadoEm = fontes.map((f) => f.consulta?.consultado_em).filter(Boolean).sort().at(-1);
  const benfeitorias = (imovel.caracteristicas as { benfeitorias?: string[] } | null)?.benfeitorias ?? [];

  const resumo = [
    { rotulo: "Área total", valor: formatArea(geo?.area_m2 ?? null, imovel.tipo as "urbano" | "rural") },
    { rotulo: "Perímetro", valor: formatPerimetro(geo?.perimeter_m) },
    { rotulo: "Município", valor: municipio ? `${municipio.nome} / ${municipio.uf}` : "—" },
    { rotulo: "Valor anunciado", valor: formatBRL(imovel.valor) },
  ];

  const ativas = fontes.filter((f) => f.ativa);
  const pendentes = fontes.filter((f) => !f.ativa);

  const dataRodape = new Date().toLocaleDateString("pt-BR");
  // título de seção da prancha: "01 · RESUMO" com fio dourado + título condensado
  const secao = (n: string, rotulo: string, titulo: string) => (
    <div className="mb-5 print:mb-3">
      <p className="lp-eyebrow !text-[0.7rem] print:!text-[9px]">{n} · {rotulo}</p>
      <h2 className="lp-display mt-2.5 text-3xl text-texto md:text-[2.4rem] print:mt-1.5 print:text-2xl print:text-black">{titulo}</h2>
    </div>
  );
  const linha = "flex items-baseline justify-between gap-4 border-b border-linha px-5 py-3.5 last:border-b-0 print:border-gray-300 print:px-3 print:py-2";
  const rotuloLinha = "text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-texto-2 print:text-[9px] print:text-gray-600";

  return (
    <div className="min-h-screen bg-fundo text-texto print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14 print:px-0 print:py-0">
        {/* ---------- capa da prancha: rótulo, radar no canto, título grande ---------- */}
        <header className="relative mb-10 border-b border-linha pb-8 print:mb-6 print:border-gray-300 print:pb-5">
          <MarcaArini variante="radar" titulo=""
            className="absolute right-0 top-0 w-9 print:w-7" />
          <p className="lp-eyebrow !text-[0.7rem] print:!text-[9px]">
            {texto(cfg, "nome_sistema", "Arini Imóveis Brasil")} · {imovel.codigo}
          </p>
          <h1 className="lp-display mt-4 max-w-[90%] text-5xl text-verde md:text-[5rem] print:mt-2 print:text-5xl print:text-black">
            Relatório territorial
          </h1>
          <p className="lp-display mt-3 text-2xl text-texto-2 md:text-3xl print:mt-2 print:text-xl print:text-gray-700">{imovel.titulo}</p>
          <dl className="mt-6 grid gap-x-8 sm:grid-cols-2 print:mt-4 print:grid-cols-2">
            <div className="flex justify-between gap-4 border-t border-linha py-2.5 print:border-gray-300 print:py-1.5">
              <dt className={rotuloLinha}>Gerado em</dt>
              <dd className="text-sm font-semibold print:text-xs">{new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-linha py-2.5 print:border-gray-300 print:py-1.5">
              <dt className={rotuloLinha}>Dados consultados em</dt>
              <dd className="text-sm font-semibold print:text-xs">{consultadoEm ? new Date(consultadoEm).toLocaleDateString("pt-BR") : "—"}</dd>
            </div>
          </dl>
        </header>

        <BotoesRelatorio codigo={imovel.codigo} />

        {/* ---------- 01 resumo: tabela de especificações ---------- */}
        <section className="mb-12 print:mb-7 break-inside-avoid">
          {secao("01", "Localização", "Resumo geral")}
          <dl className="cartao !p-0 overflow-hidden print:rounded-none print:border-gray-300 print:shadow-none">
            {resumo.map((r) => (
              <div key={r.rotulo} className={linha}>
                <dt className={rotuloLinha}>{r.rotulo}</dt>
                <dd className="lp-display break-words text-right text-2xl leading-none md:text-3xl print:text-lg">{r.valor}</dd>
              </div>
            ))}
          </dl>
          {imovel.area_declarada != null && (
            <p className="mt-3 text-sm text-texto-2 print:mt-2 print:text-xs print:text-gray-600">
              Área declarada pelo anunciante: {Number(imovel.area_declarada).toLocaleString("pt-BR")}{" "}
              {imovel.tipo === "rural" ? "ha" : "m²"}. A área acima é calculada sobre a geometria
              cadastrada ({geo?.fonte ?? "—"}).
            </p>
          )}
        </section>

        {/* ---------- 02 incidências ---------- */}
        <section className="mb-12 print:mb-7">
          {secao("02", "Fontes oficiais", "Incidências por fonte")}

          {!ativas.some((f) => f.consulta) ? (
            <p className="cartao p-6 text-base text-texto-2 print:p-4 print:text-sm print:border print:border-gray-300 print:bg-white print:text-gray-600">
              Nenhuma consulta territorial foi executada para este imóvel até o momento.
            </p>
          ) : (
            <div className="space-y-4 print:space-y-3">
              {ativas.map((f, idx) => {
                const c = f.consulta;
                const itens = c?.resultado?.itens ?? [];
                const estado = !c ? "sem consulta"
                  : c.erro ? "fonte indisponível"
                  : c.quantidade > 0 ? plural(c.quantidade, "registro")
                  : "nenhuma incidência";
                // verde só quando a fonte respondeu e não achou nada; "sem consulta"
                // fica neutro para não ser lido como "nada encontrado".
                const tom = c?.erro ? "alerta" : !c ? "neutro" : c.quantidade > 0 ? "ouro" : "verde";
                return (
                  <div key={f.id} className="cartao p-5 md:p-6 print:rounded-none print:border print:border-gray-300 print:bg-white print:p-4 print:shadow-none break-inside-avoid">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-semibold tabular-nums tracking-[0.1em] text-ouro print:text-gray-500">{String(idx + 1).padStart(2, "0")}</p>
                        <p className="lp-display mt-1 text-2xl leading-none print:text-lg">{f.nome}</p>
                        <p className="mt-1 text-sm text-texto-2 print:text-xs print:text-gray-500">{f.orgao}</p>
                      </div>
                      <Etiqueta tom={tom} className="print:!border-gray-400 print:!bg-white print:!text-gray-700">{estado}</Etiqueta>
                    </div>

                    {c?.erro && (
                      <p className="mt-2 text-xs text-alerta print:text-gray-600">
                        O serviço do órgão estava indisponível no momento da consulta. Ausência de dados aqui não significa ausência
                        de registro no órgão.
                      </p>
                    )}

                    {itens.length > 0 && (
                      <ul className="mt-4 border-t border-linha text-[15px] print:mt-3 print:border-gray-300 print:text-sm">
                        {itens.slice(0, 12).map((i, n) => (
                          <li key={n} className="border-b border-linha py-2.5 last:border-0 print:border-gray-200 print:py-1.5">
                            <p>{i.titulo}</p>
                            {i.extra?.matricula ? <p className="mt-1 inline-flex items-center rounded-full border border-[#D9BD6F]/70 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-texto print:border-gray-400 print:bg-white print:text-black">Matrícula nº {String(i.extra.matricula)}</p> : null}
                            {i.detalhe && <p className="text-xs text-texto-2 print:text-gray-600">{i.detalhe}</p>}
                            {i.extra && (
                              <p className="text-[11px] text-texto-2 print:text-gray-500">
                                {detalhesRegistro(i.extra)}
                              </p>
                            )}
                          </li>
                        ))}
                        {itens.length > 12 && (
                          <li className="pt-2 text-xs text-texto-2 print:text-gray-600">
                            … e mais {plural(itens.length - 12, "registro")} no sistema.
                          </li>
                        )}
                      </ul>
                    )}

                    {c && !c.erro && (
                      <p className="mt-3 text-[11px] text-texto-2 print:text-gray-500">
                        Consultado em {new Date(c.consultado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        {c.raio_m ? ` · raio de ${c.raio_m / 1000} km ao redor do imóvel` : " · sobre o imóvel"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- 03 entorno ---------- */}
        {pois.length > 0 && (
          <section className="mb-12 print:mb-7 break-inside-avoid">
            {secao("03", "Arredores", "Entorno e acessos")}
            <dl className="cartao !p-0 overflow-hidden print:rounded-none print:border-gray-300 print:shadow-none">
              {pois.slice(0, 12).map((p, i) => (
                <div key={i} className={linha + " !py-3 text-[15px] print:text-sm"}>
                  <dt className="min-w-0 text-texto print:text-black">{nomePoi(p.nome) ?? CATEGORIA_LABEL[p.categoria] ?? p.categoria}</dt>
                  <dd className="lp-display shrink-0 text-xl tabular-nums text-verde print:text-base print:text-gray-800">
                    {formatDistancia(p.distancia_m)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-texto-2 print:mt-2 print:text-[11px] print:text-gray-500">
              Distâncias em linha reta, a partir do centro do imóvel.
            </p>
          </section>
        )}

        {/* ---------- 04 imóvel ---------- */}
        <section className="mb-12 print:mb-7 break-inside-avoid">
          {secao("04", "Descrição", "Sobre o imóvel")}
          <p className="max-w-[68ch] whitespace-pre-line text-base leading-relaxed text-texto-3 print:text-sm print:text-black">{imovel.descricao || "Sem descrição cadastrada."}</p>
          {benfeitorias.length > 0 && (
            <p className="mt-3 text-[15px] text-texto-2 print:mt-2 print:text-sm print:text-gray-600">
              Benfeitorias declaradas: {benfeitorias.join(", ")}.
            </p>
          )}
        </section>

        {/* ---------- 05 pendentes ---------- */}
        {pendentes.length > 0 && (
          <section className="mb-12 print:mb-7 break-inside-avoid">
            {secao("05", "Cobertura", "Fontes não incluídas")}
            {/* a `observacao` da fonte é anotação da equipe (reCAPTCHA, "definir com o Carlos"…):
                no relatório do cliente vai só o nome e o órgão */}
            <p className="mb-3 text-[15px] text-texto-2 print:mb-2 print:text-sm print:text-gray-600">
              Estas bases ainda não estão integradas ao sistema e não foram consultadas para este imóvel.
            </p>
            <ul className="text-[15px] print:text-sm">
              {pendentes.map((f) => (
                <li key={f.id} className="flex justify-between gap-4 border-t border-linha py-2.5 text-texto-2 print:border-gray-300 print:py-1.5 print:text-gray-600">
                  <strong className="font-semibold text-texto print:text-black">{f.nome}</strong><span>{f.orgao}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- nota + rodapé de prancha ---------- */}
        <footer className="print:break-inside-avoid">
          <div className="space-y-1.5 pb-6 text-xs leading-relaxed text-texto-2 print:space-y-1 print:pb-4 print:text-[11px] print:text-gray-600">
            <p>
              <strong className="text-texto print:text-black">Origem dos dados.</strong> As incidências vêm dos
              órgãos citados, consultadas na data indicada em cada bloco. Área, perímetro e distâncias são
              cálculos do {texto(cfg, "nome_sistema", "Arini Imóveis Brasil")} sobre a geometria cadastrada do imóvel.
            </p>
            <p>
              Este documento é um apoio à decisão e <strong className="text-texto print:text-black">não substitui
              certidão oficial</strong>, matrícula, CAR ou levantamento topográfico.
            </p>
            <p>Intermediação: Arini Negócios Imobiliários.</p>
          </div>
          <div className="rodape-prancha print:border-gray-300 print:text-gray-600">
            <span>Arini · Relatório territorial / {dataRodape}</span>
            <span>{imovel.codigo}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
