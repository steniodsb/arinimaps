import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea } from "@/lib/format";
import { lerConfiguracoes, texto } from "@/lib/settings";
import BotoesRelatorio from "./BotoesRelatorio";
import { currentUser } from "@/lib/supabase/server";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

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
  const pois = ((tour as { pois?: { nome: string | null; categoria: string; distancia_m: number }[] } | null)?.pois ?? []);
  const consultadoEm = fontes.map((f) => f.consulta?.consultado_em).filter(Boolean).sort().at(-1);
  const benfeitorias = (imovel.caracteristicas as { benfeitorias?: string[] } | null)?.benfeitorias ?? [];

  const resumo = [
    { rotulo: "Área total", valor: formatArea(geo?.area_m2 ?? null, imovel.tipo as "urbano" | "rural") },
    { rotulo: "Perímetro", valor: geo?.perimeter_m ? `${(geo.perimeter_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km` : "—" },
    { rotulo: "Município", valor: municipio ? `${municipio.nome} / ${municipio.uf}` : "—" },
    { rotulo: "Valor anunciado", valor: formatBRL(imovel.valor) },
  ];

  const ativas = fontes.filter((f) => f.ativa);
  const pendentes = fontes.filter((f) => !f.ativa);

  return (
    <div className="min-h-screen bg-fundo text-texto print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14 print:px-0 print:py-0">
        {/* ---------- cabeçalho ---------- */}
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-linha pb-7 print:mb-6 print:flex-nowrap print:border-gray-300 print:pb-5">
          <div>
            <p className="lp-eyebrow !text-xs print:!text-[10px] print:text-gray-500">
              {texto(cfg, "nome_sistema", "Arini Imóveis Brasil")}
            </p>
            <h1 className="lp-display mt-2 text-3xl md:text-[2.5rem] print:text-2xl">Relatório Territorial</h1>
            <p className="mt-2 text-lg text-texto-2 print:mt-1 print:text-base print:text-gray-600">{imovel.titulo}</p>
          </div>
          <div className="shrink-0 space-y-0.5 text-sm text-texto-2 sm:text-right print:text-right print:text-xs print:text-gray-600">
            <p className="font-mono font-semibold text-texto print:text-black">{imovel.codigo}</p>
            <p>Gerado em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
            {consultadoEm && (
              <p>Dados consultados em {new Date(consultadoEm).toLocaleDateString("pt-BR")}</p>
            )}
          </div>
        </header>

        <BotoesRelatorio codigo={imovel.codigo} />

        {/* ---------- resumo ---------- */}
        <section className="mb-10 print:mb-7">
          <h2 className="lp-display mb-4 text-xl text-texto md:text-2xl print:mb-3 print:text-xs print:font-semibold print:uppercase print:tracking-[0.18em] print:text-gray-700">
            Resumo geral
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:gap-3">
            {resumo.map((r) => (
              <div key={r.rotulo} className="cartao !border-l-4 !border-l-verde p-5 print:border print:border-gray-300 print:bg-white print:p-3.5">
                <p className="text-xs font-bold uppercase tracking-wider text-texto-2 print:text-[10px] print:font-normal print:text-gray-500">{r.rotulo}</p>
                <p className="lp-display mt-2 break-words text-xl leading-tight print:mt-0.5 print:text-base">{r.valor}</p>
              </div>
            ))}
          </div>
          {imovel.area_declarada != null && (
            <p className="mt-3 text-sm text-texto-2 print:mt-2 print:text-xs print:text-gray-600">
              Área declarada pelo anunciante: {Number(imovel.area_declarada).toLocaleString("pt-BR")}{" "}
              {imovel.tipo === "rural" ? "ha" : "m²"}. A área acima é calculada sobre a geometria
              cadastrada ({geo?.fonte ?? "—"}).
            </p>
          )}
        </section>

        {/* ---------- incidências ---------- */}
        <section className="mb-10 print:mb-7">
          <h2 className="lp-display mb-4 text-xl text-texto md:text-2xl print:mb-3 print:text-xs print:font-semibold print:uppercase print:tracking-[0.18em] print:text-gray-700">
            Incidências por fonte oficial
          </h2>

          {!ativas.some((f) => f.consulta) ? (
            <p className="cartao p-6 text-base text-texto-2 print:p-4 print:text-sm print:border print:border-gray-300 print:bg-white print:text-gray-600">
              Nenhuma consulta territorial foi executada para este imóvel até o momento.
            </p>
          ) : (
            <div className="space-y-4 print:space-y-3">
              {ativas.map((f) => {
                const c = f.consulta;
                const itens = c?.resultado?.itens ?? [];
                const estado = !c ? "sem consulta"
                  : c.erro ? "fonte indisponível"
                  : c.quantidade > 0 ? `${c.quantidade} registro(s)`
                  : "nenhuma incidência";
                return (
                  <div key={f.id} className="cartao p-5 md:p-6 print:border print:border-gray-300 print:bg-white print:p-4 break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="text-base font-semibold">{f.nome} <span className="text-sm font-normal text-texto-2 print:text-xs print:text-gray-500">· {f.orgao}</span></p>
                      <span className={
                        "rounded-md border border-current/25 px-2.5 py-1 text-xs font-bold print:border-0 print:p-0 print:font-medium " +
                        // verde só quando a fonte respondeu e não achou nada; "sem consulta"
                        // fica neutro para não ser lido como "nada encontrado".
                        (c?.erro ? "text-alerta" : !c ? "text-texto-2" : c.quantidade > 0 ? "text-ouro" : "text-verde") +
                        " print:text-gray-700"
                      }>
                        {estado}
                      </span>
                    </div>

                    {c?.erro && (
                      <p className="text-xs text-alerta print:text-gray-600 mt-1">
                        O serviço não respondeu ({c.erro}). Ausência de dados aqui não significa ausência
                        de registro no órgão.
                      </p>
                    )}

                    {itens.length > 0 && (
                      <ul className="mt-3 space-y-2 text-[15px] print:mt-2.5 print:space-y-1.5 print:text-sm">
                        {itens.slice(0, 12).map((i, n) => (
                          <li key={n} className="border-b border-linha print:border-gray-200 last:border-0 pb-1.5">
                            <p>{i.titulo}</p>
                            {i.detalhe && <p className="text-xs text-texto-2 print:text-gray-600">{i.detalhe}</p>}
                            {i.extra && (
                              <p className="text-[11px] text-texto-2 print:text-gray-500">
                                {Object.entries(i.extra)
                                  .filter(([, v]) => v !== "" && v != null)
                                  .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                                  .join(" · ")}
                              </p>
                            )}
                          </li>
                        ))}
                        {itens.length > 12 && (
                          <li className="text-xs text-texto-2 print:text-gray-600">
                            … e mais {itens.length - 12} registro(s) no sistema.
                          </li>
                        )}
                      </ul>
                    )}

                    {c && !c.erro && (
                      <p className="text-[11px] text-texto-2 print:text-gray-500 mt-2">
                        Consultado em {new Date(c.consultado_em).toLocaleString("pt-BR")}
                        {c.raio_m ? ` · raio de ${c.raio_m / 1000} km ao redor do imóvel` : " · sobre o imóvel"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- entorno ---------- */}
        {pois.length > 0 && (
          <section className="mb-10 print:mb-7 break-inside-avoid">
            <h2 className="lp-display mb-4 text-xl text-texto md:text-2xl print:mb-3 print:text-xs print:font-semibold print:uppercase print:tracking-[0.18em] print:text-gray-700">
              Entorno e acessos
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 print:gap-2">
              {pois.slice(0, 12).map((p, i) => (
                <div key={i} className="cartao flex justify-between gap-3 px-5 py-3.5 text-[15px] print:border print:border-gray-300 print:bg-white print:px-3.5 print:py-2 print:text-sm">
                  <span>{p.nome ?? CATEGORIA_LABEL[p.categoria] ?? p.categoria}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-texto-2 print:font-normal print:text-gray-600">
                    {(p.distancia_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-texto-2 print:mt-2 print:text-[11px] print:text-gray-500">
              Distâncias em linha reta, a partir do centro do imóvel.
            </p>
          </section>
        )}

        {/* ---------- imóvel ---------- */}
        <section className="mb-10 print:mb-7 break-inside-avoid">
          <h2 className="lp-display mb-4 text-xl text-texto md:text-2xl print:mb-3 print:text-xs print:font-semibold print:uppercase print:tracking-[0.18em] print:text-gray-700">
            Sobre o imóvel
          </h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-texto-3 print:text-sm print:text-black">{imovel.descricao || "Sem descrição cadastrada."}</p>
          {benfeitorias.length > 0 && (
            <p className="mt-3 text-[15px] text-texto-2 print:mt-2 print:text-sm print:text-gray-600">
              Benfeitorias declaradas: {benfeitorias.join(", ")}.
            </p>
          )}
        </section>

        {/* ---------- pendentes ---------- */}
        {pendentes.length > 0 && (
          <section className="mb-10 print:mb-7 break-inside-avoid">
            <h2 className="lp-display mb-4 text-xl text-texto md:text-2xl print:mb-3 print:text-xs print:font-semibold print:uppercase print:tracking-[0.18em] print:text-gray-700">
              Fontes não incluídas nesta análise
            </h2>
            <ul className="space-y-2 text-[15px] print:space-y-1.5 print:text-sm">
              {pendentes.map((f) => (
                <li key={f.id} className="text-texto-2 print:text-gray-600">
                  <strong className="text-texto print:text-black">{f.nome}</strong> ({f.orgao}) — {f.observacao}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- nota ---------- */}
        <footer className="space-y-1.5 border-t border-linha pt-6 text-xs leading-relaxed text-texto-2 print:space-y-1 print:border-gray-300 print:pt-4 print:text-[11px] print:text-gray-600">
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
        </footer>
      </div>
    </div>
  );
}
