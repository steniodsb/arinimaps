"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ListChecks, Plus, UserRound } from "lucide-react";
import { PRIORIDADE_LABEL } from "@/lib/setores";
import { Etiqueta } from "@/components/ui/Pagina";
import { CAMPO_COMPACTO } from "./estilos";

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

  const input = CAMPO_COMPACTO;
  const abertas = tarefas.filter((t) => ["aberta", "andamento"].includes(t.status));
  const feitas = tarefas.filter((t) => t.status === "concluida").slice(0, 5);

  return (
    <div className="space-y-4">
      {setor && (
        <form className="cartao flex flex-wrap items-center gap-2.5 p-3"
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
          <button disabled={ocupado} className="btn-verde inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-60">
            <Plus className="size-4" /> Adicionar
          </button>
        </form>
      )}
      {erro && <p className="text-sm text-critico">{erro}</p>}

      <div className="cartao overflow-hidden divide-y divide-linha">
        {abertas.map((t) => {
          const atrasada = !!t.prazo && t.prazo < hoje();
          return (
            <div key={t.id} className="px-5 py-3.5 flex items-start gap-3.5 flex-wrap transition-colors hover:bg-superficie-2/70">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--verde)] cursor-pointer" disabled={ocupado} aria-label="Concluir tarefa"
                onChange={() => chamar("PATCH", { id: t.id, status: "concluida" })} />
              <div className="flex-1 min-w-52">
                <p className="text-[0.95rem] font-medium text-texto leading-snug">
                  {t.titulo}
                  {t.prioridade === "alta" && <Etiqueta tom="critico" className="ml-2 align-middle !py-0.5">Alta</Etiqueta>}
                  {t.status === "andamento" && <Etiqueta tom="verde" className="ml-2 align-middle !py-0.5">Em andamento</Etiqueta>}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-2">
                  {mostrarSetor && <span className="font-semibold uppercase tracking-[0.1em] text-ouro">{setoresNome[t.setor] ?? t.setor}</span>}
                  <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{t.responsavel_nome ?? "sem responsável"}</span>
                  {t.prazo && (
                    <span className={"inline-flex items-center gap-1 " + (atrasada ? "font-semibold text-critico" : "")}>
                      <CalendarClock className="size-3.5" />
                      {atrasada ? "atrasada desde " : "até "}
                      {new Date(t.prazo + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </p>
              </div>
              <select value={t.status} disabled={ocupado} aria-label="Situação"
                onChange={(e) => chamar("PATCH", { id: t.id, status: e.target.value })}
                className="rounded-lg border border-linha-forte bg-superficie-2 px-2.5 py-1.5 text-xs font-medium text-texto focus:border-verde focus:outline-none">
                <option value="aberta">Aberta</option>
                <option value="andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          );
        })}
        {!abertas.length && (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <ListChecks className="size-6 text-verde" />
            <p className="text-[0.95rem] text-texto-2">Nenhuma tarefa aberta.</p>
          </div>
        )}
      </div>

      {feitas.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-texto-2">
          <CheckCircle2 className="size-3.5 shrink-0 mt-px text-verde" />
          <span>Concluídas recentemente: {feitas.map((t) => t.titulo).join(" · ")}</span>
        </p>
      )}
    </div>
  );
}
