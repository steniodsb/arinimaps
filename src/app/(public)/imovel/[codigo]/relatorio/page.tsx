import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea } from "@/lib/format";
import { lerConfiguracoes, texto } from "@/lib/settings";
import BotoesRelatorio from "./BotoesRelatorio";

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

  const [{ data: geo }, { data: relatorio }, { data: tour }, cfg] = await Promise.all([
    admin.from("property_geometries").select("area_m2, perimeter_m, fonte").eq("property_id", imovel.id).maybeSingle(),
    admin.rpc("fn_consulta_rural", { p_property_id: imovel.id }),
    admin.rpc("fn_property_tour", { p_codigo: codigo }),
    lerConfiguracoes(),
  ]);

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
      <div className="mx-auto max-w-4xl px-5 py-8 print:px-0 print:py-0">
        {/* ---------- cabeçalho ---------- */}
        <header className="flex items-start justify-between gap-4 border-b border-linha print:border-gray-300 pb-5 mb-6">
          <div>
            <p className="text-[10px] tracking-[0.28em] uppercase text-ouro print:text-gray-500">
              {texto(cfg, "nome_sistema", "Arini Imóveis Brasil")}
            </p>
            <h1 className="text-2xl font-semibold mt-1">Relatório Territorial</h1>
            <p className="text-texto-2 print:text-gray-600">{imovel.titulo}</p>
          </div>
          <div className="text-right text-xs text-texto-2 print:text-gray-600 shrink-0">
            <p className="font-mono">{imovel.codigo}</p>
            <p>Gerado em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
            {consultadoEm && (
              <p>Dados consultados em {new Date(consultadoEm).toLocaleDateString("pt-BR")}</p>
            )}
          </div>
        </header>

        <BotoesRelatorio codigo={imovel.codigo} />

        {/* ---------- resumo ---------- */}
        <section className="mb-7">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-verde print:text-gray-700 mb-3">
            Resumo geral
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {resumo.map((r) => (
              <div key={r.rotulo} className="cartao p-3.5 print:border print:border-gray-300 print:bg-white">
                <p className="text-[10px] uppercase tracking-wide text-texto-2 print:text-gray-500">{r.rotulo}</p>
                <p className="font-semibold mt-0.5">{r.valor}</p>
              </div>
            ))}
          </div>
          {imovel.area_declarada != null && (
            <p className="text-xs text-texto-2 print:text-gray-600 mt-2">
              Área declarada pelo anunciante: {Number(imovel.area_declarada).toLocaleString("pt-BR")}{" "}
              {imovel.tipo === "rural" ? "ha" : "m²"}. A área acima é calculada sobre a geometria
              cadastrada ({geo?.fonte ?? "—"}).
            </p>
          )}
        </section>

        {/* ---------- incidências ---------- */}
        <section className="mb-7">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-verde print:text-gray-700 mb-3">
            Incidências por fonte oficial
          </h2>

          {!ativas.some((f) => f.consulta) ? (
            <p className="cartao p-4 text-sm text-texto-2 print:border print:border-gray-300 print:bg-white print:text-gray-600">
              Nenhuma consulta territorial foi executada para este imóvel até o momento.
            </p>
          ) : (
            <div className="space-y-3">
              {ativas.map((f) => {
                const c = f.consulta;
                const itens = c?.resultado?.itens ?? [];
                const estado = !c ? "sem consulta"
                  : c.erro ? "fonte indisponível"
                  : c.quantidade > 0 ? `${c.quantidade} registro(s)`
                  : "nenhuma incidência";
                return (
                  <div key={f.id} className="cartao p-4 print:border print:border-gray-300 print:bg-white break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-medium">{f.nome} <span className="text-texto-2 print:text-gray-500 text-xs">· {f.orgao}</span></p>
                      <span className={
                        "text-xs font-medium " +
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
                      <ul className="mt-2.5 space-y-1.5 text-sm">
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
          <section className="mb-7 break-inside-avoid">
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-verde print:text-gray-700 mb-3">
              Entorno e acessos
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {pois.slice(0, 12).map((p, i) => (
                <div key={i} className="cartao px-3.5 py-2 text-sm flex justify-between gap-3 print:border print:border-gray-300 print:bg-white">
                  <span>{p.nome ?? CATEGORIA_LABEL[p.categoria] ?? p.categoria}</span>
                  <span className="text-texto-2 print:text-gray-600 tabular-nums shrink-0">
                    {(p.distancia_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-texto-2 print:text-gray-500 mt-2">
              Distâncias em linha reta, a partir do centro do imóvel.
            </p>
          </section>
        )}

        {/* ---------- imóvel ---------- */}
        <section className="mb-7 break-inside-avoid">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-verde print:text-gray-700 mb-3">
            Sobre o imóvel
          </h2>
          <p className="text-sm whitespace-pre-line leading-relaxed">{imovel.descricao || "Sem descrição cadastrada."}</p>
          {benfeitorias.length > 0 && (
            <p className="text-sm text-texto-2 print:text-gray-600 mt-2">
              Benfeitorias declaradas: {benfeitorias.join(", ")}.
            </p>
          )}
        </section>

        {/* ---------- pendentes ---------- */}
        {pendentes.length > 0 && (
          <section className="mb-7 break-inside-avoid">
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-verde print:text-gray-700 mb-3">
              Fontes não incluídas nesta análise
            </h2>
            <ul className="text-sm space-y-1.5">
              {pendentes.map((f) => (
                <li key={f.id} className="text-texto-2 print:text-gray-600">
                  <strong className="text-texto print:text-black">{f.nome}</strong> ({f.orgao}) — {f.observacao}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- nota ---------- */}
        <footer className="border-t border-linha print:border-gray-300 pt-4 text-[11px] text-texto-2 print:text-gray-600 space-y-1">
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
