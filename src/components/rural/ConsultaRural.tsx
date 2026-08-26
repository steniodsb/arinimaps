"use client";

/**
 * Relatório territorial do imóvel: o que cada fonte oficial devolveu, com
 * data da consulta e a origem sempre visível. Fonte indisponível aparece
 * como indisponível — nunca como "nada encontrado".
 */

import { useCallback, useEffect, useState } from "react";

type Item = { titulo: string; detalhe?: string; extra?: Record<string, string | number | null> };
type Consulta = {
  quantidade: number; incide: boolean; raio_m: number;
  resultado: { itens?: Item[] }; erro: string | null; consultado_em: string;
} | null;
type Fonte = {
  id: string; nome: string; orgao: string; prioridade: number;
  ativa: boolean; observacao: string | null; consulta: Consulta;
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

  useEffect(() => { carregar(); }, [carregar]);

  async function consultar() {
    setRodando(true);
    setMsg("Consultando ANM, FUNAI, INPE e OpenStreetMap…");
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-foreground/60 mb-1">Raio de análise no entorno</label>
          <select value={raio} onChange={(e) => setRaio(Number(e.target.value))}
            className="rounded-lg border border-linha bg-white px-3 py-2 text-sm">
            {RAIOS.map((r) => (
              <option key={r} value={r}>{r === 0 ? "Só o imóvel" : `${r / 1000} km ao redor`}</option>
            ))}
          </select>
        </div>
        <button onClick={consultar} disabled={rodando} className="btn-ouro px-6 py-2.5 disabled:opacity-60">
          {rodando ? "Consultando…" : "Executar consulta territorial"}
        </button>
        {msg && <span className="text-sm text-foreground/70">{msg}</span>}
      </div>

      {dados?.imovel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Área", dados.imovel.area_ha ? `${dados.imovel.area_ha.toLocaleString("pt-BR")} ha` : "—"],
            ["Perímetro", dados.imovel.perimetro_km ? `${dados.imovel.perimetro_km.toLocaleString("pt-BR")} km` : "—"],
            ["Município", dados.imovel.municipio ?? "—"],
            ["Tipo", dados.imovel.tipo],
          ].map(([r, v]) => (
            <div key={r} className="rounded-xl border border-linha bg-white p-3">
              <p className="text-[11px] uppercase tracking-wide text-foreground/50">{r}</p>
              <p className="font-semibold text-verde-escuro">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {ativas.map((f) => {
          const c = f.consulta;
          const estado = !c ? "sem consulta" : c.erro ? "indisponível" : c.quantidade > 0 ? `${c.quantidade} registro(s)` : "nada encontrado";
          const cor = !c ? "bg-areia text-foreground/60"
            : c.erro ? "bg-amber-100 text-amber-900"
            : c.quantidade > 0 ? "bg-ouro/20 text-ouro-escuro" : "bg-verde/10 text-verde";
          const itens = c?.resultado?.itens ?? [];
          return (
            <div key={f.id} className="rounded-xl border border-linha bg-white overflow-hidden">
              <button onClick={() => setAberta(aberta === f.id ? null : f.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-areia/50 transition">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{f.nome}</p>
                  <p className="text-xs text-foreground/50">
                    {f.orgao}
                    {c && !c.erro && ` · consultado em ${new Date(c.consultado_em).toLocaleString("pt-BR")}`}
                    {c?.raio_m ? ` · raio ${c.raio_m / 1000} km` : null}
                  </p>
                </div>
                <span className={`text-xs rounded-full px-3 py-1 font-medium shrink-0 ${cor}`}>{estado}</span>
                {!!itens.length && <span className="text-foreground/40 text-xs">{aberta === f.id ? "▲" : "▼"}</span>}
              </button>

              {aberta === f.id && (
                <div className="px-4 pb-3 space-y-1.5 border-t border-linha pt-3">
                  {c?.erro && (
                    <p className="text-sm text-amber-800">
                      Fonte indisponível: {c.erro}. Nada aqui significa ausência de registro — só que o serviço não respondeu.
                    </p>
                  )}
                  {itens.map((i, n) => (
                    <div key={n} className="text-sm border-b border-linha/60 last:border-0 pb-1.5">
                      <p className="font-medium">{i.titulo}</p>
                      {i.detalhe && <p className="text-foreground/70 text-xs">{i.detalhe}</p>}
                      {i.extra && (
                        <p className="text-[11px] text-foreground/45">
                          {Object.entries(i.extra).filter(([, v]) => v !== "" && v != null)
                            .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                  {!itens.length && !c?.erro && (
                    <p className="text-sm text-foreground/55">Nenhuma incidência encontrada nesta fonte para o raio consultado.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!!pendentes.length && (
        <div className="rounded-xl border border-linha bg-areia/50 p-4 space-y-2">
          <p className="text-sm font-semibold text-verde-escuro">Fontes que dependem de importação de arquivo</p>
          <p className="text-xs text-foreground/60">
            Não têm consulta pública por polígono. Os dados precisam ser baixados do órgão e importados —
            enquanto isso, não entram no relatório.
          </p>
          <ul className="text-sm space-y-1">
            {pendentes.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="text-foreground/40">•</span>
                <span><strong>{f.nome}</strong> ({f.orgao}) — {f.observacao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-foreground/45">
        Dados oficiais dos órgãos citados, consultados na data indicada. Distâncias e interseções são
        cálculos do Arini Imóveis Brasil sobre a geometria do imóvel — não substituem certidão oficial.
      </p>
    </div>
  );
}
