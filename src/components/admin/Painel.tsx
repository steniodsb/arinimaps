import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setorPorId, type SetorId } from "@/lib/setores";
import Tarefas, { type Membro, type Tarefa } from "./Tarefas";

/** Peças comuns aos painéis de setor da Matriz. */

export type Indicador = { rotulo: string; valor: string | number; href?: string; destaque?: boolean; nota?: string };

export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {itens.map((i) => {
        const corpo = (
          <>
            <p className="text-2xl font-semibold text-texto tabular-nums">{i.valor}</p>
            <p className="text-xs text-texto-2 mt-0.5">{i.rotulo}</p>
            {i.nota && <p className="text-[11px] text-texto-2 mt-1">{i.nota}</p>}
          </>
        );
        const classe = `rounded-xl border p-4 transition block ${i.destaque ? "border-ouro bg-ouro/10" : "border-linha bg-superficie"}`;
        return i.href
          ? <Link key={i.rotulo} href={i.href} className={classe + " hover:border-verde"}>{corpo}</Link>
          : <div key={i.rotulo} className={classe}>{corpo}</div>;
      })}
    </div>
  );
}

export function CabecalhoSetor({ setor, children }: { setor: SetorId; children?: React.ReactNode }) {
  const s = setorPorId(setor)!;
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[10px] tracking-[0.22em] uppercase text-ouro">Setor</p>
        <h1 className="text-2xl font-semibold text-texto">{s.nome}</h1>
        <p className="text-sm text-texto-2 max-w-2xl">{s.descricao}</p>
      </div>
      {children}
    </div>
  );
}

export function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-texto">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Conta linhas de uma tabela com um filtro opcional — só o número, sem baixar
 * as linhas. `monta` recebe a consulta do Supabase e devolve ela filtrada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function contar(tabela: string, monta: (q: any) => any = (q) => q): Promise<number> {
  const { count } = await monta(supabaseAdmin().from(tabela).select("*", { count: "exact", head: true }));
  return count ?? 0;
}

/** Equipe ativa (para atribuir tarefa e chamado). */
export async function equipeAtiva(): Promise<Membro[]> {
  const { data } = await supabaseAdmin()
    .from("profiles").select("user_id, nome")
    .in("role", ["admin_central", "analista_arini"]).eq("ativo", true).order("nome");
  return data ?? [];
}

/** Bloco de tarefas de um setor, já com os dados carregados. */
export async function TarefasDoSetor({ setor, souEu }: { setor: SetorId; souEu: string }) {
  const admin = supabaseAdmin();
  const [{ data: tarefas }, equipe] = await Promise.all([
    admin.from("tasks")
      .select("id, titulo, descricao, setor, status, prioridade, prazo, responsavel")
      .eq("setor", setor).neq("status", "cancelada")
      .order("status").order("prazo", { ascending: true, nullsFirst: false }).limit(60),
    equipeAtiva(),
  ]);
  const nome = new Map(equipe.map((m) => [m.user_id, m.nome]));
  const lista: Tarefa[] = (tarefas ?? []).map((t) => ({ ...t, responsavel_nome: t.responsavel ? nome.get(t.responsavel) ?? null : null }));
  return (
    <Secao titulo="Tarefas do setor">
      <Tarefas setor={setor} tarefas={lista} equipe={equipe} souEu={souEu} />
    </Secao>
  );
}

export const dataBR = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
export const dataHoraBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
