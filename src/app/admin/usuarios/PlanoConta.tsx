"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { NICHOS, NICHO_LABEL, PLAN_ORIGEM_LABEL } from "@/lib/planos";
import { AvisoErro } from "@/components/ui/Aviso";
import { Etiqueta } from "@/components/ui/Pagina";
import { ChevronDown, ChevronUp } from "lucide-react";

export type ContaExterna = {
  user_id: string; nome: string; email: string; role: string; ativo: boolean;
  nicho: string | null; plan_id: string | null; plan_origem: string; plan_valido_ate: string | null;
  /** plan_valido_ate no passado (calculado no servidor) */
  vencido: boolean;
};
export type PlanoOpcao = { id: string; nome: string; ativo: boolean };

const input = "rounded-xl border border-linha-forte bg-superficie px-3 py-2.5 text-sm font-normal text-texto focus:border-verde focus:outline-none focus:ring-2 focus:ring-verde/30 transition";

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
    <div className="px-5 py-3.5 text-[0.95rem] space-y-3 transition-colors hover:bg-superficie-2/50">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-40 font-semibold text-texto">
          {conta.nome || "—"}
          {!conta.ativo && <Etiqueta tom="critico" className="ml-2 align-middle">desativada</Etiqueta>}
        </span>
        <span className="text-sm text-texto-2 flex-1 min-w-40 truncate">{conta.email}</span>
        <Etiqueta tom="neutro">{papelLabel}</Etiqueta>
        <span title="nicho">
          <Etiqueta tom="neutro">{conta.nicho ? NICHO_LABEL[conta.nicho] ?? conta.nicho : "sem nicho"}</Etiqueta>
        </span>
        <span title={PLAN_ORIGEM_LABEL[conta.plan_origem] ?? conta.plan_origem}>
          <Etiqueta tom={vencido ? "alerta" : "verde"}>
            {planoNome}{vencido ? " · vencido" : ""}
            <span className="font-normal opacity-75"> · {PLAN_ORIGEM_LABEL[conta.plan_origem] ?? conta.plan_origem}</span>
          </Etiqueta>
        </span>
        {ehDiretoria && (
          <button type="button" disabled={ocupado} onClick={() => { setEditando(!editando); setErro(null); }}
            className="btn-contorno inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
            {editando ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {editando ? "Fechar" : "Plano"}
          </button>
        )}
      </div>

      {editando && (
        <div className="rounded-xl border border-linha bg-superficie-2 p-4 space-y-3">
          <div className="flex items-end gap-4 flex-wrap">
            <label className="text-sm font-semibold text-texto">
              Nicho
              <select className={input + " block mt-1"} value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })}>
                <option value="">— padrão do papel —</option>
                {NICHOS.map((n) => <option key={n.id} value={n.id}>{n.nome}{n.reservado ? " (reservado)" : ""}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-texto">
              Origem do plano
              <select className={input + " block mt-1"} value={form.plan_origem} onChange={(e) => setForm({ ...form, plan_origem: e.target.value })}>
                <option value="padrao">Padrão do nicho</option>
                <option value="manual">Definido pela Matriz</option>
                <option value="assinatura">Assinatura</option>
              </select>
            </label>
            {form.plan_origem !== "padrao" && (
              <>
                <label className="text-sm font-semibold text-texto">
                  Plano
                  <select className={input + " block mt-1"} value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
                    <option value="">— escolha —</option>
                    {planos.filter((p) => p.ativo || p.id === conta.plan_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativo)"}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-texto">
                  Válido até (opcional)
                  <input type="date" className={input + " block mt-1"} value={form.plan_valido_ate}
                    onChange={(e) => setForm({ ...form, plan_valido_ate: e.target.value })} />
                </label>
              </>
            )}
            <button type="button" disabled={ocupado} onClick={salvar} className="btn-ouro px-5 py-2.5 text-sm disabled:opacity-50">
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
          </div>
          <p className="text-sm text-texto-2">
            “Padrão do nicho” volta a conta para o plano do nicho e acompanha mudanças futuras. Plano vencido vale como acesso básico.
          </p>
          {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
        </div>
      )}
    </div>
  );
}
