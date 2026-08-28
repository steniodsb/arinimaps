import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import GestaoUsuarios from "./GestaoUsuarios";

const PAPEL_LABEL: Record<string, string> = {
  admin_central: "Diretoria", analista_arini: "Analista",
  imobiliaria: "Imobiliária", corretor: "Corretor",
  engenheiro: "Engenheiro", proprietario: "Proprietário", comprador: "Comprador",
};

export default async function AdminUsuarios() {
  const admin = supabaseAdmin();
  const [{ data: perfis }, { data: usuarios }, user] = await Promise.all([
    admin.from("profiles").select("user_id, nome, role, telefone, ativo, created_at").order("created_at"),
    admin.auth.admin.listUsers({ perPage: 200 }),
    currentUser(),
  ]);

  const emailPorId = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const equipe = (perfis ?? []).filter((p) => ["admin_central", "analista_arini"].includes(p.role));
  const externos = (perfis ?? []).filter((p) => !["admin_central", "analista_arini"].includes(p.role));

  return (
    <div className="space-y-7 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Usuários e acessos</h1>
        <p className="text-sm text-texto-2">
          Equipe da Arini opera o sistema; proprietários, parceiros e compradores usam os portais.
        </p>
      </div>

      <GestaoUsuarios
        equipe={equipe.map((p) => ({
          user_id: p.user_id, nome: p.nome, role: p.role, ativo: p.ativo,
          email: emailPorId.get(p.user_id) ?? "",
        }))}
        souEu={user?.id ?? ""}
        ehDiretoria={user?.role === "admin_central"}
      />

      <section className="space-y-2">
        <h2 className="font-semibold text-texto">Contas externas ({externos.length})</h2>
        <p className="text-sm text-texto-2">
          Aprovação de proprietários e parceiros acontece em <strong>Cadastros</strong>.
        </p>
        <div className="cartao divide-y divide-linha max-h-96 overflow-y-auto">
          {externos.map((p) => (
            <div key={p.user_id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-40">{p.nome || "—"}</span>
              <span className="text-xs text-texto-2 flex-1 min-w-40 truncate">{emailPorId.get(p.user_id)}</span>
              <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">{PAPEL_LABEL[p.role] ?? p.role}</span>
            </div>
          ))}
          {!externos.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma conta externa ainda.</p>}
        </div>
      </section>
    </div>
  );
}
