"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRIORIDADE_LABEL } from "@/lib/setores";

export type Tarefa = {
  id: string; titulo: string; descricao: string | null; setor: string; status: string;
  prioridade: string; prazo: string | null; responsavel: string | null; responsavel_nome?: string | null;
};
export type Membro = { user_id: string; nome: string };

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Lista de tarefas de um setor, com criação rápida. As tarefas são o "o que
 * falta fazer" de cada setor — o que não é fila automática do sistema (imóvel
 * em análise, lead novo) e depende de alguém lembrar.
 */
export default function Tarefas({
  setor, tarefas, equipe, souEu, mostrarSetor = false, setoresNome = {},
}: {
  setor: string | null;
  tarefas: Tarefa[];
  equipe: Membro[];
  souEu: string;
  mostrarSetor?: boolean;
  setoresNome?: Record<string, string>;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [nova, setNova] = useState({ titulo: "", prazo: "", prioridade: "normal", responsavel: souEu });

  async function chamar(method: "POST" | "PATCH", body: unknown) {
    setOcupado(true); setErro("");
    const res = await fetch("/api/admin/tarefas", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setOcupado(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar."); return false; }
    router.refresh();
    return true;
  }

  const input = "rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde";
  const abertas = tarefas.filter((t) => ["aberta", "andamento"].includes(t.status));
  const feitas = tarefas.filter((t) => t.status === "concluida").slice(0, 5);

  return (
    <div className="space-y-3">
      {setor && (
        <form className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await chamar("POST", { ...nova, setor })) setNova({ ...nova, titulo: "", prazo: "" });
          }}>
          <input required className={input + " flex-1 min-w-56"} placeholder="Nova tarefa do setor…"
            value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          <select className={input} value={nova.responsavel} aria-label="Responsável"
            onChange={(e) => setNova({ ...nova, responsavel: e.target.value })}>
            <option value="">Sem responsável</option>
            {equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome || "—"}</option>)}
          </select>
          <input type="date" className={input} value={nova.prazo} aria-label="Prazo"
            onChange={(e) => setNova({ ...nova, prazo: e.target.value })} />
          <select className={input} value={nova.prioridade} aria-label="Prioridade"
            onChange={(e) => setNova({ ...nova, prioridade: e.target.value })}>
            {Object.entries(PRIORIDADE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button disabled={ocupado} className="btn-verde px-4 py-2 text-sm disabled:opacity-60">Adicionar</button>
        </form>
      )}
      {erro && <p className="text-sm text-critico">{erro}</p>}

      <div className="cartao divide-y divide-linha">
        {abertas.map((t) => {
          const atrasada = !!t.prazo && t.prazo < hoje();
          return (
            <div key={t.id} className="px-4 py-3 flex items-start gap-3 flex-wrap text-sm">
              <input type="checkbox" className="mt-1" disabled={ocupado} aria-label="Concluir tarefa"
                onChange={() => chamar("PATCH", { id: t.id, status: "concluida" })} />
              <div className="flex-1 min-w-52">
                <p className="text-texto">
                  {t.prioridade === "alta" && <span className="text-critico font-medium">● </span>}
                  {t.titulo}
                </p>
                <p className="text-xs text-texto-2">
                  {mostrarSetor && <>{setoresNome[t.setor] ?? t.setor} · </>}
                  {t.responsavel_nome ?? "sem responsável"}
                  {t.prazo && (
                    <span className={atrasada ? "text-critico" : ""}>
                      {" · "}{atrasada ? "atrasada desde " : "até "}
                      {new Date(t.prazo + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </p>
              </div>
              <select value={t.status} disabled={ocupado} aria-label="Situação"
                onChange={(e) => chamar("PATCH", { id: t.id, status: e.target.value })}
                className="rounded-lg border border-linha bg-superficie-2 px-2 py-1 text-xs">
                <option value="aberta">Aberta</option>
                <option value="andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          );
        })}
        {!abertas.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma tarefa aberta.</p>}
      </div>

      {feitas.length > 0 && (
        <p className="text-xs text-texto-2">
          Concluídas recentemente: {feitas.map((t) => t.titulo).join(" · ")}
        </p>
      )}
    </div>
  );
}
