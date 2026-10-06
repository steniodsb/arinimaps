"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import {
  COTAS, GRUPO_RECURSO_LABEL, NICHOS, RECURSOS, type Plano, type Recurso,
} from "@/lib/planos";

const GRUPOS = Object.keys(GRUPO_RECURSO_LABEL) as Recurso["grupo"][];
const input = "w-full rounded-lg cartao px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verde transition disabled:opacity-60";
const rotulo = "block text-xs font-medium text-texto mb-1";

type Form = {
  id: string; nome: string; descricao: string; preco_mensal: string; periodicidade: string; escopo: string;
  destaque: boolean; ativo: boolean; ordem: string; nichos_padrao: string[]; recursos: string[];
  cotas: Record<string, string>;
};

const NOVO: Form = {
  id: "", nome: "", descricao: "", preco_mensal: "0", periodicidade: "mensal", escopo: "conta",
  destaque: false, ativo: true, ordem: "100", nichos_padrao: [], recursos: [], cotas: {},
};

function formDe(p: Plano): Form {
  return {
    id: p.id, nome: p.nome, descricao: p.descricao, preco_mensal: String(p.preco_mensal ?? 0),
    periodicidade: p.periodicidade, escopo: p.escopo, destaque: p.destaque, ativo: p.ativo, ordem: String(p.ordem ?? 100),
    nichos_padrao: [...(p.nichos_padrao ?? [])], recursos: [...(p.recursos ?? [])],
    cotas: Object.fromEntries(COTAS.map((c) => [c.id, p.cotas?.[c.id] != null ? String(p.cotas[c.id]) : ""])),
  };
}

function corpoDe(f: Form) {
  const cotas: Record<string, number> = {};
  for (const c of COTAS) if (f.cotas[c.id]?.trim() !== "" && f.cotas[c.id] != null) cotas[c.id] = Number(f.cotas[c.id]);
  return {
    id: f.id.trim(), nome: f.nome.trim(), descricao: f.descricao.trim(),
    preco_mensal: Number(String(f.preco_mensal).replace(",", ".")), periodicidade: f.periodicidade, escopo: f.escopo,
    destaque: f.destaque, ativo: f.ativo, ordem: Number(f.ordem), nichos_padrao: f.nichos_padrao, recursos: f.recursos, cotas,
  };
}

function Erro({ erro }: { erro: ErroApi }) {
  return (
    <div className="rounded-lg border border-critico/40 bg-critico/10 p-3 text-sm space-y-0.5">
      <p className="text-critico font-medium">{erro.mensagem}</p>
      {erro.motivo && <p className="text-xs text-texto-2">{erro.motivo}</p>}
      {erro.solucao && <p className="text-xs text-texto">{erro.solucao}</p>}
    </div>
  );
}

/** Formulário de um plano (existente ou novo). */
function FormPlano({
  inicial, novo, contas, ehDiretoria, aoSalvar, aoCancelar,
}: {
  inicial: Form; novo: boolean; contas: number; ehDiretoria: boolean;
  aoSalvar: (f: Form) => Promise<void>; aoCancelar?: () => void;
}) {
  const [f, setF] = useState<Form>(inicial);
  const [aberto, setAberto] = useState(novo);
  const [sujo, setSujo] = useState(novo);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState<ErroApi | null>(null);

  const mudar = (patch: Partial<Form>) => { setF((s) => ({ ...s, ...patch })); setSujo(true); setMsg(""); setErro(null); };
  const alternar = (campo: "nichos_padrao" | "recursos", id: string) =>
    mudar({ [campo]: f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id] });

  async function salvar() {
    setSalvando(true); setMsg(""); setErro(null);
    try {
      await aoSalvar(f);
      setMsg(novo ? "Plano criado." : "Plano salvo. As mudanças já valem para as contas.");
      setSujo(false);
    } catch (e) {
      setErro(e as ErroApi);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={"cartao " + (f.ativo ? "" : "opacity-80")}>
      <button type="button" onClick={() => setAberto(!aberto)}
        className="w-full px-5 py-4 flex items-center gap-3 flex-wrap text-left">
        <div className="flex-1 min-w-48">
          <p className="font-medium text-texto">
            {novo ? "Novo plano" : f.nome || f.id}
            {!novo && <span className="ml-2 font-mono text-[11px] text-texto-2">{f.id}</span>}
          </p>
          {!novo && <p className="text-xs text-texto-2">{f.recursos.length} recurso(s) · ordem {f.ordem}</p>}
        </div>
        {!novo && (
          <>
            {f.destaque && <span className="text-[10px] uppercase tracking-wide rounded-full bg-ouro/15 text-ouro-escuro px-2.5 py-1">destaque</span>}
            <span className={"text-xs rounded-full px-3 py-1 " + (f.ativo ? "bg-verde/10 text-verde" : "bg-superficie-2 text-texto-2")}>
              {f.ativo ? "ativo" : "inativo"}
            </span>
            <span className="text-xs rounded-full bg-superficie-2 px-3 py-1 tabular-nums">{contas} conta(s)</span>
          </>
        )}
        <span className="text-texto-2">{aberto ? "▴" : "▾"}</span>
      </button>

      {aberto && (
        <div className="px-5 pb-5 space-y-5 border-t border-linha pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {novo && (
              <div>
                <label className={rotulo} htmlFor={`id-${f.id || "novo"}`}>Identificador (slug) *</label>
                <input id={`id-${f.id || "novo"}`} className={input + " font-mono"} placeholder="ex.: consulta_avancada"
                  value={f.id} onChange={(e) => mudar({ id: e.target.value.toLowerCase() })} />
                <p className="text-xs text-texto-2 mt-1">Letras minúsculas, números e _; não muda depois.</p>
              </div>
            )}
            <div>
              <label className={rotulo} htmlFor={`nome-${f.id}`}>Nome *</label>
              <input id={`nome-${f.id}`} className={input} disabled={!ehDiretoria}
                value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={rotulo} htmlFor={`desc-${f.id}`}>Descrição (aparece na página de planos)</label>
              <textarea id={`desc-${f.id}`} rows={2} className={input} disabled={!ehDiretoria}
                value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
            </div>
            <div>
              <label className={rotulo} htmlFor={`preco-${f.id}`}>Preço (R$)</label>
              <input id={`preco-${f.id}`} className={input} inputMode="decimal" disabled={!ehDiretoria}
                value={f.preco_mensal} onChange={(e) => mudar({ preco_mensal: e.target.value })} />
              <p className="text-xs text-texto-2 mt-1">Zero com periodicidade paga = “sob consulta” na página pública.</p>
            </div>
            <div>
              <label className={rotulo} htmlFor={`per-${f.id}`}>Periodicidade</label>
              <select id={`per-${f.id}`} className={input} disabled={!ehDiretoria}
                value={f.periodicidade} onChange={(e) => mudar({ periodicidade: e.target.value })}>
                <option value="gratis">Gratuito</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor={`esc-${f.id}`}>Escopo</label>
              <select id={`esc-${f.id}`} className={input} disabled={!ehDiretoria}
                value={f.escopo} onChange={(e) => mudar({ escopo: e.target.value })}>
                <option value="conta">Por conta</option>
                <option value="organizacao">Por organização</option>
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor={`ordem-${f.id}`}>Ordem na página</label>
              <input id={`ordem-${f.id}`} className={input} inputMode="numeric" disabled={!ehDiretoria}
                value={f.ordem} onChange={(e) => mudar({ ordem: e.target.value })} />
            </div>
            <div className="flex items-center gap-5 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.destaque} disabled={!ehDiretoria} onChange={(e) => mudar({ destaque: e.target.checked })} />
                Em destaque
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.ativo} disabled={!ehDiretoria} onChange={(e) => mudar({ ativo: e.target.checked })} />
                Ativo (aparece na página e pode ser atribuído)
              </label>
            </div>
          </div>

          <div>
            <p className={rotulo}>Nichos que nascem com este plano</p>
            <div className="flex flex-wrap gap-2">
              {NICHOS.map((n) => {
                const marcado = f.nichos_padrao.includes(n.id);
                return (
                  <label key={n.id} title={n.descricao}
                    className={"rounded-full border px-3 py-1 text-xs cursor-pointer transition " +
                      (marcado ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2")}>
                    <input type="checkbox" className="hidden" checked={marcado} disabled={!ehDiretoria}
                      onChange={() => alternar("nichos_padrao", n.id)} />
                    {n.nome}{n.reservado ? " ·" : ""}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-texto-2 mt-1">Se dois planos ativos marcam o mesmo nicho, vale o de menor ordem.</p>
          </div>

          <div className="space-y-3">
            <p className={rotulo}>Recursos liberados</p>
            {GRUPOS.map((g) => (
              <div key={g}>
                <p className="text-[10px] uppercase tracking-wide text-texto-2 font-semibold mb-1">{GRUPO_RECURSO_LABEL[g]}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {RECURSOS.filter((r) => r.grupo === g).map((r) => (
                    <label key={r.id} className="flex items-start gap-2 text-sm cursor-pointer" title={r.descricao}>
                      <input type="checkbox" className="mt-1" checked={f.recursos.includes(r.id)} disabled={!ehDiretoria}
                        onChange={() => alternar("recursos", r.id)} />
                      <span>
                        {r.nome}
                        {r.reservado && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ouro-escuro">reservado</span>}
                        <span className="block text-xs text-texto-2">{r.descricao}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className={rotulo}>Limites (vazio = sem limite)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {COTAS.map((c) => (
                <div key={c.id}>
                  <label className="block text-xs text-texto-2 mb-1" htmlFor={`cota-${f.id}-${c.id}`}>{c.nome}</label>
                  <input id={`cota-${f.id}-${c.id}`} className={input} inputMode="numeric" placeholder="sem limite" disabled={!ehDiretoria}
                    value={f.cotas[c.id] ?? ""} onChange={(e) => mudar({ cotas: { ...f.cotas, [c.id]: e.target.value } })} />
                  <p className="text-[11px] text-texto-2 mt-1">{c.ajuda}</p>
                </div>
              ))}
            </div>
          </div>

          {erro && <Erro erro={erro} />}
          {msg && <p className="text-sm text-verde">{msg}</p>}

          {ehDiretoria && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={salvar} disabled={salvando || !sujo} className="btn-ouro px-6 py-2.5 disabled:opacity-45">
                {salvando ? "Salvando…" : novo ? "Criar plano" : sujo ? "Salvar alterações" : "Nada alterado"}
              </button>
              {aoCancelar && (
                <button type="button" onClick={aoCancelar} className="rounded-lg btn-contorno px-4 py-2 text-sm">Cancelar</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanosAdmin({
  planos, contasPorPlano, ehDiretoria,
}: { planos: Plano[]; contasPorPlano: Record<string, number>; ehDiretoria: boolean }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);

  async function salvar(metodo: "POST" | "PATCH", f: Form) {
    const r = await enviarJson("/api/admin/planos", metodo, corpoDe(f));
    if (!r.ok) throw r.erro;
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-texto">Planos ({planos.length})</h2>
        {ehDiretoria && (
          <button onClick={() => setCriando(!criando)}
            className="rounded-lg btn-contorno px-4 py-2 text-sm font-medium hover:bg-superficie-2 transition">
            {criando ? "Cancelar" : "+ Novo plano"}
          </button>
        )}
      </div>
      {!ehDiretoria && <p className="text-xs text-texto-2">Só a diretoria altera planos; aqui você consulta.</p>}

      <div className="space-y-3">
        {criando && (
          <FormPlano key="novo" inicial={NOVO} novo contas={0} ehDiretoria={ehDiretoria}
            aoSalvar={async (f) => { await salvar("POST", f); setCriando(false); }}
            aoCancelar={() => setCriando(false)} />
        )}
        {planos.map((p) => (
          <FormPlano key={p.id + ":" + p.ordem + ":" + p.ativo} inicial={formDe(p)} novo={false}
            contas={contasPorPlano[p.id] ?? 0} ehDiretoria={ehDiretoria}
            aoSalvar={(f) => salvar("PATCH", f)} />
        ))}
        {!planos.length && !criando && (
          <p className="cartao px-4 py-6 text-center text-sm text-texto-2">Nenhum plano cadastrado.</p>
        )}
      </div>
    </section>
  );
}
