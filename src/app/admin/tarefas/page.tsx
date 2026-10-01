import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirEquipe } from "@/lib/setores-servidor";
import { SETORES, type SetorId } from "@/lib/setores";
import Tarefas, { type Tarefa } from "@/components/admin/Tarefas";
import { equipeAtiva } from "@/components/admin/Painel";

/** Tarefas internas de todos os setores em que o membro atua. */
export default async function AdminTarefas({ searchParams }: PageProps<"/admin/tarefas">) {
  const user = await exigirEquipe();
  const sp = await searchParams;
  const filtro = typeof sp.setor === "string" && user.setores.includes(sp.setor as SetorId) ? (sp.setor as SetorId) : null;
  const soMinhas = sp.minhas === "1";

  let q = supabaseAdmin().from("tasks")
    .select("id, titulo, descricao, setor, status, prioridade, prazo, responsavel")
    .in("setor", filtro ? [filtro] : user.setores)
    .neq("status", "cancelada")
    .order("status").order("prazo", { ascending: true, nullsFirst: false }).limit(200);
  if (soMinhas) q = q.eq("responsavel", user.id);
  const [{ data: tarefas }, equipe] = await Promise.all([q, equipeAtiva()]);

  const nome = new Map(equipe.map((m) => [m.user_id, m.nome]));
  const lista: Tarefa[] = (tarefas ?? []).map((t) => ({ ...t, responsavel_nome: t.responsavel ? nome.get(t.responsavel) ?? null : null }));
  const chip = "rounded-full border px-3 py-1 text-xs transition ";
  const ativo = "border-verde bg-verde/10 text-verde";
  const inativo = "border-linha text-texto-2 hover:text-texto";
  const link = (setor: string | null, minhas: boolean) =>
    "/admin/tarefas" + (setor || minhas ? "?" : "") + [setor && `setor=${setor}`, minhas && "minhas=1"].filter(Boolean).join("&");

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Tarefas</h1>
        <p className="text-sm text-texto-2">
          O que cada setor tem para fazer, com responsável e prazo. Escolha um setor para criar uma tarefa nele.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={link(null, soMinhas)} className={chip + (!filtro ? ativo : inativo)}>Todos os meus setores</Link>
        {SETORES.filter((s) => user.setores.includes(s.id)).map((s) => (
          <Link key={s.id} href={link(s.id, soMinhas)} className={chip + (filtro === s.id ? ativo : inativo)}>{s.nome}</Link>
        ))}
        <Link href={link(filtro, !soMinhas)} className={chip + (soMinhas ? ativo : inativo)}>Só as minhas</Link>
      </div>

      <Tarefas
        setor={filtro}
        tarefas={lista}
        equipe={equipe}
        souEu={user.id}
        mostrarSetor={!filtro}
        setoresNome={Object.fromEntries(SETORES.map((s) => [s.id, s.nome]))}
      />
      {!filtro && (
        <p className="text-xs text-texto-2">
          Para criar uma tarefa, escolha o setor acima.
        </p>
      )}
    </div>
  );
}
