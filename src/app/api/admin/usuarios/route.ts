import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

const PAPEIS_EQUIPE = ["admin_central", "analista_arini"];

/** Cria membro da equipe Arini (login pronto para usar). */
export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") {
    return NextResponse.json({ error: "Só a diretoria cria acessos da equipe." }, { status: 403 });
  }
  const { email, senha, nome, role } = await request.json().catch(() => ({}));
  if (!email?.trim() || !senha || senha.length < 8 || !nome?.trim()) {
    return NextResponse.json({ error: "Preencha nome, e-mail e senha de 8+ caracteres." }, { status: 400 });
  }
  if (!PAPEIS_EQUIPE.includes(role)) {
    return NextResponse.json({ error: "Papel inválido para a equipe." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(), password: senha, email_confirm: true,
    user_metadata: { nome: nome.trim(), role },
  });
  if (error) {
    const msg = /already/i.test(error.message) ? "Já existe conta com este e-mail." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  await admin.from("profiles").update({ role, nome: nome.trim() }).eq("user_id", data.user.id);
  await logAudit({
    user_id: a.userId, acao: "usuario_equipe_criado", entidade: "profiles",
    entidade_id: data.user.id, dados_depois: { email, role },
  });
  return NextResponse.json({ ok: true });
}

/** Muda papel ou ativa/desativa um membro. */
export async function PATCH(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") {
    return NextResponse.json({ error: "Só a diretoria altera acessos." }, { status: 403 });
  }
  const { user_id, role, ativo } = await request.json().catch(() => ({}));
  if (user_id === a.userId && (role === "analista_arini" || ativo === false)) {
    return NextResponse.json({ error: "Você não pode remover o próprio acesso de diretoria." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (role) {
    if (!PAPEIS_EQUIPE.includes(role)) return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
    patch.role = role;
  }
  if (typeof ativo === "boolean") patch.ativo = ativo;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("profiles").update(patch).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({
    user_id: a.userId, acao: "usuario_equipe_alterado", entidade: "profiles",
    entidade_id: user_id, dados_depois: patch,
  });
  return NextResponse.json({ ok: true });
}
