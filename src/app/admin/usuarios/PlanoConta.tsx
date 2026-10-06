"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { NICHOS, NICHO_LABEL, PLAN_ORIGEM_LABEL } from "@/lib/planos";

export type ContaExterna = {
  user_id: string; nome: string; email: string; role: string; ativo: boolean;
  nicho: string | null; plan_id: string | null; plan_origem: string; plan_valido_ate: string | null;
  /** plan_valido_ate no passado (calculado no servidor) */
  vencido: boolean;
};
export type PlanoOpcao = { id: string; nome: string; ativo: boolean };

const input = "rounded-lg border border-linha bg-superficie px-2.5 py-1.5 text-xs text-texto focus:outline-none focus:ring-2 focus:ring-verde transition";

/** Linha de uma conta externa: nicho, plano e origem, editáveis pela Diretoria. */
export default function PlanoConta({
  conta, planos, ehDiretoria, papelLabel,
}: { conta: ContaExterna; planos: PlanoOpcao[]; ehDiretoria: boolean; papelLabel: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [form, setForm] = useState({
    nicho: conta.nicho ?? "",
    plan_origem: conta.plan_origem,
    plan_id: conta.plan_id ?? "",
    plan_valido_ate: conta.plan_valido_ate ? conta.plan_valido_ate.slice(0, 10) : "",
  });

  const planoNome = planos.find((p) => p.id === conta.plan_id)?.nome ?? conta.plan_id ?? "—";
  const vencido = conta.vencido;

  async function salvar() {
    setOcupado(true); setErro(null);
    const corpo: Record<string, unknown> = { user_id: conta.user_id, nicho: form.nicho || null, plan_origem: form.plan_origem };
    if (form.plan_origem !== "padrao") {
      corpo.plan_id = form.plan_id || null;
      corpo.plan_valido_ate = form.plan_valido_ate || null;
    }
    const r = await enviarJson("/api/admin/usuarios", "PATCH", corpo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setEditando(false);
    router.refresh();
  }

  return (
    <div className="px-4 py-2.5 text-sm space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-40">
          {conta.nome || "—"}
          {!conta.ativo && <span className="ml-2 text-[10px] uppercase text-critico">desativada</span>}
        </span>
        <span className="text-xs text-texto-2 flex-1 min-w-40 truncate">{conta.email}</span>
        <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">{papelLabel}</span>
        <span className="text-xs rounded-full bg-superficie-2 px-3 py-1" title="nicho">
          {conta.nicho ? NICHO_LABEL[conta.nicho] ?? conta.nicho : "sem nicho"}
        </span>
        <span className={"text-xs rounded-full px-3 py-1 " + (vencido ? "bg-alerta/10 text-alerta" : "bg-verde/10 text-verde")}
          title={PLAN_ORIGEM_LABEL[conta.plan_origem] ?? conta.plan_origem}>
          {planoNome}{vencido ? " · vencido" : ""}
          <span className="opacity-70"> · {PLAN_ORIGEM_LABEL[conta.plan_origem] ?? conta.plan_origem}</span>
        </span>
        {ehDiretoria && (
          <button type="button" disabled={ocupado} onClick={() => { setEditando(!editando); setErro(null); }}
            className="rounded-lg btn-contorno px-3 py-1.5 text-xs hover:bg-superficie-2 transition">
            {editando ? "Fechar" : "Plano"}
          </button>
        )}
      </div>

      {editando && (
        <div className="rounded-lg bg-superficie-2 p-3 space-y-2">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs text-texto-2">
              Nicho
              <select className={input + " block mt-1"} value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })}>
                <option value="">— padrão do papel —</option>
                {NICHOS.map((n) => <option key={n.id} value={n.id}>{n.nome}{n.reservado ? " (reservado)" : ""}</option>)}
              </select>
            </label>
            <label className="text-xs text-texto-2">
              Origem do plano
              <select className={input + " block mt-1"} value={form.plan_origem} onChange={(e) => setForm({ ...form, plan_origem: e.target.value })}>
                <option value="padrao">Padrão do nicho</option>
                <option value="manual">Definido pela Matriz</option>
                <option value="assinatura">Assinatura</option>
              </select>
            </label>
            {form.plan_origem !== "padrao" && (
              <>
                <label className="text-xs text-texto-2">
                  Plano
                  <select className={input + " block mt-1"} value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
                    <option value="">— escolha —</option>
                    {planos.filter((p) => p.ativo || p.id === conta.plan_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativo)"}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-texto-2">
                  Válido até (opcional)
                  <input type="date" className={input + " block mt-1"} value={form.plan_valido_ate}
                    onChange={(e) => setForm({ ...form, plan_valido_ate: e.target.value })} />
                </label>
              </>
            )}
            <button type="button" disabled={ocupado} onClick={salvar} className="btn-ouro px-4 py-2 text-xs disabled:opacity-50">
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
          </div>
          <p className="text-[11px] text-texto-2">
            “Padrão do nicho” volta a conta para o plano do nicho e acompanha mudanças futuras. Plano vencido vale como acesso básico.
          </p>
          {erro && (
            <div className="text-xs space-y-0.5">
              <p className="text-critico font-medium">{erro.mensagem}</p>
              {erro.motivo && <p className="text-texto-2">{erro.motivo}</p>}
              {erro.solucao && <p className="text-texto">{erro.solucao}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
