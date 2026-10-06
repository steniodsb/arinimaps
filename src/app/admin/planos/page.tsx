import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { exigirSetor } from "@/lib/setores-servidor";
import { NICHOS, PAPEIS_EQUIPE_IDS, type Plano } from "@/lib/planos";
import { PAPEL_LABEL } from "@/lib/perfis";
import PlanosAdmin from "./PlanosAdmin";

/**
 * Planos e nichos (pedido do Carlos, 05/10/2026). O que cada plano libera é
 * editado aqui e vale na hora; o significado de cada recurso está no código
 * (src/lib/planos.ts) — recurso novo exige o desenvolvedor.
 */
export default async function AdminPlanos() {
  await exigirSetor("diretoria");
  const admin = supabaseAdmin();
  const [{ data: planosRaw }, { data: perfis }, user] = await Promise.all([
    admin.from("plans").select("*").order("ordem").order("id"),
    admin.from("profiles").select("role, nicho, plan_id").eq("ativo", true),
    currentUser(),
  ]);
  const planos = (planosRaw ?? []) as Plano[];

  // contagem de contas por nicho e por plano (a equipe fica de fora: não tem plano)
  const porNicho: Record<string, number> = {};
  const porPlano: Record<string, number> = {};
  for (const p of perfis ?? []) {
    if (PAPEIS_EQUIPE_IDS.includes(p.role)) continue;
    if (p.nicho) porNicho[p.nicho] = (porNicho[p.nicho] ?? 0) + 1;
    if (p.plan_id) porPlano[p.plan_id] = (porPlano[p.plan_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-7 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Planos e nichos</h1>
        <p className="text-sm text-texto-2">
          Cada conta externa tem um nicho (o segmento comercial) e um plano (o que ela pode usar). O que você
          mudar aqui vale imediatamente para todas as contas do plano. A equipe da Arini não usa plano: o papel libera tudo.
        </p>
      </div>

      <PlanosAdmin planos={planos} contasPorPlano={porPlano} ehDiretoria={user?.role === "admin_central"} />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-texto">Nichos</h2>
          <p className="text-sm text-texto-2">
            Personas do Fluxograma Mestre. A lista é fixa no código; o plano padrão de cada nicho é definido
            marcando o nicho no plano, acima.
          </p>
        </div>
        <div className="cartao divide-y divide-linha">
          {NICHOS.map((n) => {
            const padrao = planos.find((p) => p.ativo && p.nichos_padrao.includes(n.id));
            return (
              <div key={n.id} className="px-4 py-3 flex items-start gap-3 flex-wrap text-sm">
                <div className="flex-1 min-w-56">
                  <p className="font-medium text-texto">
                    {n.nome} <span className="font-mono text-[11px] text-texto-2">{n.id}</span>
                    {n.reservado && <span className="ml-2 text-[10px] uppercase tracking-wide text-ouro-escuro">reservado</span>}
                    {!n.escolhivel && <span className="ml-2 text-[10px] uppercase tracking-wide text-texto-2">definido pela Matriz</span>}
                  </p>
                  <p className="text-xs text-texto-2">{n.descricao}</p>
                  <p className="text-xs text-texto-2 mt-1">
                    Papéis: {n.papeis.map((r) => PAPEL_LABEL[r] ?? r).join(", ")} · plano padrão:{" "}
                    <span className="text-texto">{padrao?.nome ?? "nenhum"}</span>
                  </p>
                </div>
                <span className="text-xs rounded-full bg-superficie-2 px-3 py-1 tabular-nums">
                  {porNicho[n.id] ?? 0} conta(s)
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
