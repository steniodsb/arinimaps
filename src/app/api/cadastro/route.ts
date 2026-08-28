import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { validarDocumento } from "@/lib/br/documentos";

const ROLES_PERMITIDOS = ["comprador", "proprietario", "corretor", "imobiliaria", "engenheiro"];

/**
 * Cria a conta. CPF (ou CNPJ, para imobiliária) é obrigatório e único:
 * é o que amarra a conta a uma pessoa real. O e-mail fica como canal de
 * contato e trilha de auditoria.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { email, senha, nome, telefone, role, cpf, razao_social, registro_profissional } = body ?? {};

  if (!email?.trim() || !senha || senha.length < 8 || !nome?.trim()) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e uma senha com pelo menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (!ROLES_PERMITIDOS.includes(role)) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }

  const doc = validarDocumento(cpf ?? "");
  if (!doc.ok) return NextResponse.json({ error: doc.erro }, { status: 400 });
  if (doc.tipo === "cnpj" && role !== "imobiliaria") {
    return NextResponse.json(
      { error: "CNPJ só para imobiliária. Pessoa física cadastra com CPF." },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // documento já usado? erro claro antes de criar o usuário no Auth
  const { data: jaExiste } = await admin
    .from("profiles").select("user_id").eq("cpf_cnpj", doc.valor).maybeSingle();
  if (jaExiste) {
    return NextResponse.json(
      { error: "Já existe uma conta com este CPF. Faça login ou recupere a senha." },
      { status: 400 }
    );
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome.trim(), role, cpf_cnpj: doc.valor },
  });
  if (error) {
    const msg = /already/i.test(error.message) ? "Este e-mail já tem cadastro. Faça login." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const userId = created.user.id;

  const { error: perfilErro } = await admin.from("profiles").update({
    telefone: telefone?.trim() || null,
    cpf_cnpj: doc.valor,
  }).eq("user_id", userId);
  if (perfilErro) {
    // corrida no índice único: desfaz o usuário para não deixar conta órfã
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: "Este CPF acabou de ser cadastrado em outra conta." },
      { status: 400 }
    );
  }

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
    dados_depois: { role, email, documento: doc.tipo },
  });

  return NextResponse.json({ ok: true });
}
