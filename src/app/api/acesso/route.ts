import { NextResponse } from "next/server";
import { BLOQUEIO_DIAS, COOKIE_BLOQUEIO, destinoSeguro, fichaDeAcesso, senhaConfere } from "@/lib/seguranca/bloqueio";
import { ipDoPedido, limitar, respostaLimite } from "@/lib/seguranca/limite";

// Confere a senha de bloqueio do site e libera o navegador por 30 dias.
export async function POST(request: Request) {
  const limite = await limitar(`acesso:${ipDoPedido(request)}`, 10, 15 * 60);
  if (!limite.permitido) return respostaLimite(limite, "senha");

  const body = await request.json().catch(() => null);
  const senha = typeof body?.senha === "string" ? body.senha : "";
  if (!(await senhaConfere(senha))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, volta: destinoSeguro(body?.volta) });
  res.cookies.set(COOKIE_BLOQUEIO, await fichaDeAcesso(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BLOQUEIO_DIAS * 24 * 60 * 60,
  });
  return res;
}
