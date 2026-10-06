import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import GestaoUsuarios from "./GestaoUsuarios";
import PlanoConta, { type PlanoOpcao } from "./PlanoConta";
import { exigirSetor } from "@/lib/setores-servidor";
import { PAPEL_LABEL, PAPEIS_EQUIPE } from "@/lib/perfis";

/** plan_valido_ate já passou? (fora do componente: o linter do React não quer Date.now() em render) */
const estaVencido = (d: string | null) => !!d && new Date(d).getTime() < Date.now();

export default async function AdminUsuarios() {
  await exigirSetor("diretoria");
  const admin = supabaseAdmin();
  const [{ data: perfis }, { data: usuarios }, { data: planos }, user] = await Promise.all([
    admin.from("profiles")
      .select("user_id, nome, role, telefone, ativo, setores, nicho, plan_id, plan_origem, plan_valido_ate, created_at")
      .order("created_at"),
    admin.auth.admin.listUsers({ perPage: 200 }),
    admin.from("plans").select("id, nome, ativo").order("ordem").order("id"),
    currentUser(),
  ]);

  const emailPorId = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const equipe = (perfis ?? []).filter((p) => (PAPEIS_EQUIPE as readonly string[]).includes(p.role));
  const externos = (perfis ?? []).filter((p) => !(PAPEIS_EQUIPE as readonly string[]).includes(p.role));
  const ehDiretoria = user?.role === "admin_central";

  return (
    <div className="space-y-7 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Usuários e acessos</h1>
        <p className="text-sm text-texto-2">
          A equipe da Arini opera o sistema por setor; proprietários, parceiros e compradores usam os portais.
        </p>
      </div>

      <GestaoUsuarios
        equipe={equipe.map((p) => ({
          user_id: p.user_id, nome: p.nome, role: p.role, ativo: p.ativo,
          setores: (p.setores ?? []) as string[],
          email: emailPorId.get(p.user_id) ?? "",
        }))}
        souEu={user?.id ?? ""}
        ehDiretoria={ehDiretoria}
      />

      <section className="space-y-2">
        <h2 className="font-semibold text-texto">Contas externas ({externos.length})</h2>
        <p className="text-sm text-texto-2">
          Aprovação de proprietários e parceiros acontece em <strong>Cadastros</strong>. O nicho e o plano de
          cada conta são editados aqui; o que cada plano libera, em <strong>Planos e nichos</strong>.
        </p>
        <div className="cartao divide-y divide-linha max-h-[32rem] overflow-y-auto">
          {externos.map((p) => (
            <PlanoConta key={p.user_id}
              conta={{
                user_id: p.user_id, nome: p.nome, email: emailPorId.get(p.user_id) ?? "", role: p.role, ativo: p.ativo,
                nicho: (p.nicho as string | null) ?? null, plan_id: (p.plan_id as string | null) ?? null,
                plan_origem: (p.plan_origem as string) ?? "padrao", plan_valido_ate: (p.plan_valido_ate as string | null) ?? null,
                vencido: estaVencido(p.plan_valido_ate as string | null),
              }}
              planos={(planos ?? []) as PlanoOpcao[]}
              ehDiretoria={ehDiretoria}
              papelLabel={PAPEL_LABEL[p.role] ?? p.role}
            />
          ))}
          {!externos.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma conta externa ainda.</p>}
        </div>
      </section>
    </div>
  );
}
