import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirEquipe } from "@/lib/setores-servidor";
import { SETORES, type SetorId } from "@/lib/setores";
import Tarefas, { type Tarefa } from "@/components/admin/Tarefas";
import { equipeAtiva } from "@/components/admin/Painel";
import { CabecalhoPagina } from "@/components/ui/Pagina";
import { aba } from "@/components/admin/estilos";

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
  const link = (setor: string | null, minhas: boolean) =>
    "/admin/tarefas" + (setor || minhas ? "?" : "") + [setor && `setor=${setor}`, minhas && "minhas=1"].filter(Boolean).join("&");

  return (
    <div className="space-y-6 max-w-5xl">
      <CabecalhoPagina eyebrow="Geral" titulo="Tarefas"
        subtitulo="O que cada setor tem para fazer, com responsável e prazo. Escolha um setor para criar uma tarefa nele." />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={link(null, soMinhas)} className={aba(!filtro)}>Todos os meus setores</Link>
        {SETORES.filter((s) => user.setores.includes(s.id)).map((s) => (
          <Link key={s.id} href={link(s.id, soMinhas)} className={aba(filtro === s.id)}>{s.nome}</Link>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-linha sm:block" aria-hidden />
        <Link href={link(filtro, !soMinhas)} className={aba(soMinhas)}>Só as minhas</Link>
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
        <p className="text-sm text-texto-2">
          Para criar uma tarefa, escolha o setor acima.
        </p>
      )}
    </div>
  );
}
