"use client";

/**
 * Pré-avaliação de valor + aptidão territorial (PENDÊNCIAS 5.3 e 5.4).
 * Mesma peça na ficha da Central (modo "admin": mostra os comparáveis um a um)
 * e na ficha pública (modo "publico": só o agregado + "falar com um avaliador").
 */

import { useState } from "react";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";
import { formatBRL } from "@/lib/format";
import {
  AVISO_OBRIGATORIO, INDICACAO_LABEL,
  type ResultadoAptidao, type ResultadoPreAvaliacao,
} from "@/lib/avaliacao/metodologia";

type Resposta = {
  pre_avaliacao?: ResultadoPreAvaliacao & { id: string };
  aptidao?: (ResultadoAptidao & { id: string }) | { indisponivel: string };
};

const CONFIANCA: Record<string, { label: string; cor: string }> = {
  alta: { label: "Confiança alta", cor: "bg-verde/15 text-verde" },
  media: { label: "Confiança média", cor: "bg-alerta/15 text-alerta" },
  baixa: { label: "Confiança baixa", cor: "bg-critico/15 text-critico" },
};
const EFEITO: Record<string, string> = {
  favorece_lavoura: "favorece lavoura", favorece_pecuaria: "favorece pecuária", restringe: "restringe", neutro: "informativo",
};
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const unit = (v: number, u: "ha" | "m2") =>
  `${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: u === "ha" ? 0 : 2 })}/${u === "ha" ? "ha" : "m²"}`;

export default function PainelAvaliacao({
  propertyId, tipoImovel, modo, mostrarPre = true, mostrarAptidao = true, podeContatar = false,
}: {
  propertyId: string;
  tipoImovel: "rural" | "urbano";
  modo: "admin" | "publico";
  mostrarPre?: boolean;
  mostrarAptidao?: boolean;
  podeContatar?: boolean;
}) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [r, setR] = useState<Resposta | null>(null);
  const [contato, setContato] = useState<{ aberto: boolean; telefone: string; mensagem: string; aceite: boolean; enviado: string | null; erro: ErroApi | null }>(
    { aberto: false, telefone: "", mensagem: "", aceite: false, enviado: null, erro: null });

  const aptidaoPossivel = mostrarAptidao && tipoImovel === "rural";
  const tipo = mostrarPre && aptidaoPossivel ? "ambos" : mostrarPre ? "pre_avaliacao" : "aptidao";

  async function calcular() {
    setCarregando(true); setErro(null);
    const res = await enviarJson<Resposta>(`/api/avaliacao/${propertyId}`, "POST", { tipo });
    setCarregando(false);
    if (!res.ok) return setErro(res.erro);
    setR(res.dados);
  }

  async function pedirAvaliador() {
    const res = await enviarJson<{ oportunidade: string }>(`/api/avaliacao/${propertyId}/avaliador`, "POST", {
      telefone: contato.telefone, mensagem: contato.mensagem, consentimento: contato.aceite,
      avaliacaoId: r?.pre_avaliacao?.id,
    });
    if (!res.ok) return setContato((c) => ({ ...c, erro: res.erro }));
    setContato((c) => ({ ...c, enviado: res.dados.oportunidade, erro: null }));
  }

  const pre = r?.pre_avaliacao;
  const apt = r?.aptidao;

  return (
    <div className="space-y-4">
      {!r && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={calcular} disabled={carregando} className="btn-verde px-5 py-2.5 text-sm">
            {carregando ? "Calculando…" : mostrarPre ? "Calcular estimativa" : "Ver aptidão da área"}
          </button>
          <p className="text-xs text-texto-2 max-w-md">
            {mostrarPre && "Compara com imóveis do mesmo tipo na região. "}
            {aptidaoPossivel && "Lê o relevo no modelo de elevação e as consultas territoriais já feitas. "}
            Leva alguns segundos.
          </p>
        </div>
      )}
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}

      {/* ---------------- pré-avaliação ---------------- */}
      {pre && pre.situacao === "dados_insuficientes" && (
        <div className="rounded-xl bg-superficie-2 p-4 text-sm space-y-1">
          <p className="font-semibold text-texto">Dados insuficientes para estimar o valor</p>
          <p className="text-texto-2">{pre.motivo}</p>
          <p className="text-xs text-texto-2">Em vez de inventar um número, a pré-avaliação só estima quando há comparáveis suficientes.</p>
        </div>
      )}
      {pre && pre.situacao === "estimado" && (
        <div className="rounded-xl border border-linha p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-texto-2">Faixa estimada</p>
              <p className="text-2xl font-semibold text-texto tabular-nums">
                {formatBRL(Math.round(pre.valor_min))} – {formatBRL(Math.round(pre.valor_max))}
              </p>
              <p className="text-sm text-texto-2">
                Mediana {formatBRL(Math.round(pre.valor_mediana))} · {unit(pre.unitario_mediana, pre.unidade)} ·{" "}
                {pre.area_avaliada.toLocaleString("pt-BR")} {pre.unidade === "ha" ? "ha" : "m²"} ({pre.area_origem === "medida" ? "área medida" : "área declarada"})
              </p>
            </div>
            <span className={"text-xs rounded-full px-3 py-1 " + CONFIANCA[pre.confianca].cor} title={pre.confianca_motivo}>
              {CONFIANCA[pre.confianca].label}
            </span>
          </div>
          <p className="text-xs text-texto-2">
            {pre.comparaveis} comparáveis {pre.escopo === "mesmo_municipio" ? "do mesmo município" : "do município e vizinhos"} ·
            faixa por {pre.faixa_criterio === "quartis" ? "1º e 3º quartis" : "mínimo e máximo"} · {pre.confianca_motivo}.
          </p>
          <div>
            <p className="text-xs font-semibold text-texto mb-1">Fatores aplicados</p>
            <ul className="text-xs text-texto-2 space-y-1">
              {pre.fatores.map((f) => (
                <li key={f.id}><span className="text-texto">{f.nome}</span> — efeito médio {pct(f.efeito_medio_pct)} em {f.aplicado_em} comparável(is). {f.explicacao}</li>
              ))}
            </ul>
          </div>
          {modo === "admin" && pre.detalhe.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-texto-2">Comparáveis um a um (só a equipe vê)</summary>
              <table className="w-full mt-2">
                <thead className="text-texto-2 text-left">
                  <tr><th className="py-1">Código</th><th>Base</th><th className="text-right">Bruto</th><th className="text-right">Fatores</th><th className="text-right">Homogeneizado</th></tr>
                </thead>
                <tbody>
                  {pre.detalhe.map((d) => (
                    <tr key={d.codigo} className="border-t border-linha">
                      <td className="py-1 font-mono">{d.codigo}</td>
                      <td>{d.base}</td>
                      <td className="text-right tabular-nums">{unit(d.unitario_bruto, pre.unidade)}</td>
                      <td className="text-right tabular-nums">{Object.entries(d.fatores).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(" · ")}</td>
                      <td className="text-right tabular-nums">{unit(d.unitario, pre.unidade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
      {pre && pre.alertas.length > 0 && (
        <ul className="text-xs space-y-1">
          {pre.alertas.map((a, i) => (
            <li key={i} className={a.gravidade === "restricao" ? "text-critico" : a.gravidade === "atencao" ? "text-alerta" : "text-texto-2"}>
              {a.gravidade === "restricao" ? "⚠ " : "• "}{a.texto}
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- aptidão ---------------- */}
      {apt && "indisponivel" in apt && <p className="text-sm text-texto-2">{apt.indisponivel}</p>}
      {apt && "indicacao" in apt && (
        <div className="rounded-xl border border-linha p-4 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-texto-2">Aptidão territorial (qualitativa)</p>
            <p className={"text-lg font-semibold " + (apt.indicacao === "restricoes" ? "text-critico" : apt.indicacao === "indeterminado" ? "text-texto-2" : "text-verde")}>
              {INDICACAO_LABEL[apt.indicacao]}
            </p>
            <p className="text-sm text-texto-2">{apt.resumo}</p>
          </div>
          {apt.fatores.length > 0 && (
            <ul className="text-xs space-y-1">
              {apt.fatores.map((f, i) => (
                <li key={i} className="text-texto-2">
                  <span className="text-texto">{f.fator}:</span> {f.valor} <span className="opacity-70">({EFEITO[f.efeito]} · {f.fonte})</span>
                </li>
              ))}
            </ul>
          )}
          {apt.limitacoes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-texto mb-1">Limitações</p>
              <ul className="text-xs text-texto-2 list-disc pl-4 space-y-0.5">{apt.limitacoes.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-texto mb-1">Dados que faltam</p>
            <ul className="text-xs text-texto-2 list-disc pl-4 space-y-0.5">{apt.dados_faltantes.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        </div>
      )}

      {r && (
        <div className="rounded-xl bg-ouro/10 border border-ouro/30 p-4 text-sm space-y-2">
          <p className="font-semibold text-texto">{AVISO_OBRIGATORIO}</p>
          <p className="text-xs text-texto-2">
            Metodologia {pre?.metodologia_versao ?? (apt && "metodologia_versao" in apt ? apt.metodologia_versao : "")}: comparáveis do próprio sistema,
            fatores documentados e nenhuma rentabilidade sem dado que a sustente. Para negociar, financiar ou partilhar, peça um laudo a um avaliador habilitado.
          </p>
          {modo === "publico" && podeContatar && !contato.enviado && (
            contato.aberto ? (
              <div className="space-y-2 pt-1">
                <input value={contato.telefone} onChange={(e) => setContato({ ...contato, telefone: e.target.value })}
                  placeholder="Telefone (opcional)" maxLength={30}
                  className="w-full rounded-xl border border-linha bg-superficie px-3 py-2 text-sm" />
                <textarea value={contato.mensagem} onChange={(e) => setContato({ ...contato, mensagem: e.target.value })}
                  placeholder="Algo que o avaliador deva saber? (opcional)" rows={2} maxLength={1000}
                  className="w-full rounded-xl border border-linha bg-superficie px-3 py-2 text-sm" />
                <label className="flex items-start gap-2 text-xs text-texto-2">
                  <input type="checkbox" checked={contato.aceite} onChange={(e) => setContato({ ...contato, aceite: e.target.checked })} className="mt-0.5" />
                  Autorizo a Arini a me contatar sobre a avaliação deste imóvel, conforme a Política de Privacidade.
                </label>
                {contato.erro && <AvisoErro erro={contato.erro} aoFechar={() => setContato({ ...contato, erro: null })} />}
                <button type="button" onClick={pedirAvaliador} disabled={!contato.aceite} className="btn-ouro px-5 py-2.5 text-sm disabled:opacity-50">
                  Enviar pedido
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setContato({ ...contato, aberto: true })} className="btn-ouro px-5 py-2.5 text-sm">
                Falar com um avaliador
              </button>
            )
          )}
          {contato.enviado && <p className="text-sm text-verde">Pedido registrado ({contato.enviado}). A equipe da Arini vai entrar em contato.</p>}
          {modo === "admin" && (
            <button type="button" onClick={calcular} disabled={carregando} className="btn-contorno px-4 py-2 text-xs">
              {carregando ? "Calculando…" : "Calcular de novo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
