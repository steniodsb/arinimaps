"use client";

/**
 * Relatório territorial do imóvel: o que cada fonte oficial devolveu, com
 * data da consulta e a origem sempre visível. Fonte indisponível aparece
 * como indisponível — nunca como "nada encontrado".
 */

import { useCallback, useEffect, useState } from "react";
import { LinhaOrigem, SeloClassificacao, SeloSituacao, type OrigemItem } from "./Selos";
import { CAMPO, ROTULO } from "@/components/ui/Pagina";
import { ChevronDown, FileText, LoaderCircle, Radar } from "lucide-react";

type Item = { titulo: string; detalhe?: string; extra?: Record<string, string | number | null>; origem?: OrigemItem };
type Consulta = {
  quantidade: number; incide: boolean; raio_m: number;
  resultado: { itens?: Item[]; origem?: OrigemItem }; erro: string | null; consultado_em: string;
} | null;
type Fonte = {
  id: string; nome: string; orgao: string; prioridade: number;
  ativa: boolean; observacao: string | null; consulta: Consulta;
  /** 3.15/3.16 — vêm de fontes_externas pela fn_consulta_rural */
  classificacao?: string | null; situacao?: string | null; atualizacao?: string | null;
};
type Relatorio = {
  imovel: { codigo: string; titulo: string; tipo: string; area_ha: number | null; perimetro_km: number | null; municipio: string | null } | null;
  fontes: Fonte[];
};

const RAIOS = [0, 1000, 5000, 10000, 25000, 50000];

export default function ConsultaRural({ propertyId }: { propertyId: string }) {
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [raio, setRaio] = useState(5000);
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/imoveis/${propertyId}/consulta-rural`);
    if (r.ok) setDados(await r.json());
  }, [propertyId]);

  // primeira carga: o setState fica no retorno do fetch, não no corpo do efeito
  useEffect(() => {
    let vivo = true;
    fetch(`/api/imoveis/${propertyId}/consulta-rural`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setDados(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [propertyId]);

  async function consultar() {
    setRodando(true);
    setMsg("Consultando SICAR, INCRA, IBAMA, ANM, FUNAI, INPE, IPHAN, ANA, ANEEL, DNIT e OpenStreetMap…");
    const r = await fetch(`/api/imoveis/${propertyId}/consulta-rural`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raio_m: raio }),
    });
    const data = await r.json().catch(() => ({}));
    setRodando(false);
    if (!r.ok) { setMsg(data.error ?? "Falha na consulta."); return; }
    const comErro = (data.fontes ?? []).filter((f: { erro?: string }) => f.erro).length;
    setMsg(comErro ? `Consulta concluída — ${comErro} fonte(s) indisponível(is) no momento.` : "Consulta concluída.");
    carregar();
  }

  const ativas = dados?.fontes.filter((f) => f.ativa) ?? [];
  const pendentes = dados?.fontes.filter((f) => !f.ativa) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-64">
          <label className={ROTULO}>Raio de análise no entorno</label>
          <select value={raio} onChange={(e) => setRaio(Number(e.target.value))} className={CAMPO}>
            {RAIOS.map((r) => (
              <option key={r} value={r}>{r === 0 ? "Só o imóvel" : `${r / 1000} km ao redor`}</option>
            ))}
          </select>
        </div>
        <button onClick={consultar} disabled={rodando} className="btn-ouro inline-flex items-center gap-2 px-6 py-3 disabled:opacity-60">
          {rodando ? <LoaderCircle className="size-4 animate-spin" /> : <Radar className="size-4" />}
          {rodando ? "Consultando…" : "Executar consulta territorial"}
        </button>
        {msg && <span className="text-sm text-texto-2 leading-relaxed">{msg}</span>}
      </div>

      {dados?.imovel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ["Área", dados.imovel.area_ha ? `${dados.imovel.area_ha.toLocaleString("pt-BR")} ha` : "—"],
            ["Perímetro", dados.imovel.perimetro_km ? `${dados.imovel.perimetro_km.toLocaleString("pt-BR")} km` : "—"],
            ["Município", dados.imovel.municipio ?? "—"],
            ["Tipo", dados.imovel.tipo],
          ].map(([r, v]) => (
            <div key={r} className="cartao border-l-4 border-l-verde p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-texto-2">{r}</p>
              <p className="lp-display mt-2 text-xl leading-tight text-texto capitalize">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {ativas.map((f) => {
          const c = f.consulta;
          // fonte instável nunca vira "nada encontrado" (3.16)
          const instavel = f.situacao === "instavel";
          const estado = !c ? "sem consulta"
            : c.erro ? (instavel ? "fonte com instabilidade" : "indisponível")
            : c.quantidade > 0 ? `${c.quantidade} registro(s)`
            : instavel ? "fonte com instabilidade" : "nada encontrado";
          const cor = !c ? "bg-superficie-2 text-texto-2 border-linha"
            : c.erro || (instavel && !c.quantidade) ? "bg-alerta/14 text-alerta border-alerta/30"
            : c.quantidade > 0 ? "bg-ouro/14 text-ouro border-ouro/30" : "bg-verde/14 text-verde border-verde/25";
          const itens = c?.resultado?.itens ?? [];
          const origem = c?.resultado?.origem ?? itens.find((i) => i.origem)?.origem ?? null;
          return (
            <div key={f.id} className="cartao overflow-hidden">
              <button onClick={() => setAberta(aberta === f.id ? null : f.id)}
                className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-superficie-2 transition">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-base text-texto flex flex-wrap items-center gap-1.5">
                    {f.nome}
                    <SeloClassificacao valor={origem?.tipo ?? f.classificacao} />
                    <SeloSituacao valor={f.situacao} soProblema />
                  </p>
                  <p className="mt-0.5 text-xs text-texto-2">
                    {f.orgao}
                    {c && !c.erro && ` · consultado em ${new Date(c.consultado_em).toLocaleString("pt-BR")}`}
                    {c?.raio_m ? ` · raio ${c.raio_m / 1000} km` : null}
                  </p>
                </div>
                <span className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${cor}`}>{estado}</span>
                {!!c && <ChevronDown aria-hidden className={`size-4 shrink-0 text-texto-2 transition-transform ${aberta === f.id ? "rotate-180" : ""}`} />}
              </button>

              {aberta === f.id && (
                <div className="px-5 pb-4 space-y-2 border-t border-linha pt-4">
                  {c?.erro && (
                    <p className="text-sm text-alerta">
                      Fonte indisponível: {c.erro}. Nada aqui significa ausência de registro — só que o serviço não respondeu.
                    </p>
                  )}
                  {itens.map((i, n) => (
                    <div key={n} className="text-sm border-b border-linha/60 last:border-0 pb-2">
                      <p className="font-medium text-texto">{i.titulo}</p>
                      {i.detalhe && <p className="text-texto-2 text-xs">{i.detalhe}</p>}
                      {i.extra && (
                        <p className="text-[11px] text-texto-2">
                          {Object.entries(i.extra).filter(([, v]) => v !== "" && v != null)
                            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                  {!itens.length && !c?.erro && !instavel && (
                    <p className="text-sm text-texto-2">Nenhuma incidência encontrada nesta fonte para o raio consultado.</p>
                  )}
                  {instavel && !c?.erro && (
                    <p className="text-sm text-alerta">
                      Esta fonte falhou nas últimas verificações automáticas — refaça a consulta antes de concluir.
                    </p>
                  )}
                  {c && (
                    <LinhaOrigem origem={origem} orgao={f.orgao} classificacao={f.classificacao}
                      consultadoEm={c.consultado_em} atualizacao={f.atualizacao} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!!pendentes.length && (
        <div className="rounded-2xl border border-linha bg-superficie-2 p-5 space-y-2.5">
          <p className="flex items-center gap-2 font-display text-base font-bold text-texto">
            <FileText className="size-4 text-ouro" /> Fontes que dependem de importação de arquivo
          </p>
          <p className="text-xs text-texto-2">
            Não têm consulta pública por polígono. Os dados precisam ser baixados do órgão e importados —
            enquanto isso, não entram no relatório.
          </p>
          <ul className="text-sm space-y-1.5">
            {pendentes.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ouro" aria-hidden />
                <span><strong>{f.nome}</strong> ({f.orgao}) — {f.observacao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-texto-2">
        Dados oficiais dos órgãos citados, consultados na data indicada. Distâncias e interseções são
        cálculos do Arini Imóveis Brasil sobre a geometria do imóvel — não substituem certidão oficial.
      </p>
    </div>
  );
}
