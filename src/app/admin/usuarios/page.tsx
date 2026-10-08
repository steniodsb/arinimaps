import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import GestaoUsuarios from "./GestaoUsuarios";
import PlanoConta, { type PlanoOpcao } from "./PlanoConta";
import { exigirSetor } from "@/lib/setores-servidor";
import { PAPEL_LABEL, PAPEIS_EQUIPE } from "@/lib/perfis";
import { CabecalhoPagina, Secao, Vazio } from "@/components/ui/Pagina";
import { UserRound } from "lucide-react";

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
    <div className="mx-auto max-w-[1280px] space-y-12">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Central · Diretoria"
        titulo="Usuários e acessos"
        subtitulo="A equipe da Arini opera o sistema por setor; proprietários, parceiros e compradores usam os portais."
      />

      <GestaoUsuarios
        equipe={equipe.map((p) => ({
          user_id: p.user_id, nome: p.nome, role: p.role, ativo: p.ativo,
          setores: (p.setores ?? []) as string[],
          email: emailPorId.get(p.user_id) ?? "",
        }))}
        souEu={user?.id ?? ""}
        ehDiretoria={ehDiretoria}
      />

      <Secao
        eyebrow="Portais"
        titulo={`Contas externas (${externos.length})`}
        subtitulo={<>
          Aprovação de proprietários e parceiros acontece em <strong className="text-texto">Cadastros</strong>. O nicho e o plano de
          cada conta são editados aqui; o que cada plano libera, em <strong className="text-texto">Planos e nichos</strong>.
        </>}
      >
        {externos.length ? (
        <div className="cartao divide-y divide-linha max-h-[36rem] overflow-y-auto">
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
        </div>
        ) : (
          <Vazio icone={UserRound} titulo="Nenhuma conta externa ainda." />
        )}
      </Secao>
    </div>
  );
}
