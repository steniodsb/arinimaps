import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { registrarEvento } from "@/lib/seguranca/eventos";
import { validarSenha } from "@/lib/seguranca/senha";

/**
 * Grava a senha nova. Vale para duas situações, e nas duas exige sessão:
 *  · recuperação — a sessão veio do link de uso único (/redefinir-senha);
 *  · troca voluntária — o usuário logado informa também a senha atual.
 * Ao trocar, as OUTRAS sessões da conta são encerradas: quem tinha a senha
 * antiga aberta em outro aparelho cai fora.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const senha = String(body?.senha ?? "");
  const senhaAtual = body?.senha_atual ? String(body.senha_atual) : null;

  const erroSenha = validarSenha(senha);
  if (erroSenha) return NextResponse.json({ error: erroSenha }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "O link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”." },
      { status: 401 }
    );
  }

  if (senhaAtual !== null) {
    const { error: reauth } = await supabase.auth.signInWithPassword({ email: user.email!, password: senhaAtual });
    if (reauth) return NextResponse.json({ error: "A senha atual não confere." }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    const msg = /different from the old/i.test(error.message)
      ? "A senha nova precisa ser diferente da atual."
      : /aal2/i.test(error.message)
        ? "Confirme o segundo fator antes de trocar a senha."
        : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  await supabase.auth.signOut({ scope: "others" });

  await registrarEvento(request, senhaAtual !== null ? "senha_alterada" : "senha_redefinida", { userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
