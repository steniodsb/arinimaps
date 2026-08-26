import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const ROLES_PERMITIDOS = ["comprador", "proprietario", "corretor", "imobiliaria", "engenheiro"];

// Cria a conta (e-mail já confirmado, sem depender de SMTP) + registro de
// proprietário/parceiro com status 'solicitado' para análise da Arini.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { email, senha, nome, telefone, role, razao_social, registro_profissional } = body ?? {};

  if (!email?.trim() || !senha || senha.length < 8 || !nome?.trim()) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e uma senha com pelo menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (!ROLES_PERMITIDOS.includes(role)) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome.trim(), role },
  });
  if (error) {
    const msg = /already/i.test(error.message) ? "Este e-mail já tem cadastro. Faça login." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const userId = created.user.id;

  await admin.from("profiles").update({ telefone: telefone?.trim() || null }).eq("user_id", userId);

  if (role === "proprietario") {
    await admin.from("owners").insert({ profile_id: userId, aceite_termos_at: new Date().toISOString() });
  } else if (["corretor", "imobiliaria", "engenheiro"].includes(role)) {
    await admin.from("partners").insert({
      profile_id: userId,
      tipo: role,
      razao_social: razao_social?.trim() || nome.trim(),
      registro_profissional: registro_profissional?.trim() || null,
      aceite_termos_at: new Date().toISOString(),
    });
  }

  await logAudit({
    user_id: userId,
    acao: "cadastro_criado",
    entidade: "profiles",
    entidade_id: userId,
    dados_depois: { role, email },
  });

  return NextResponse.json({ ok: true });
}
