import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { registrarEvento, type EventoAuth } from "@/lib/seguranca/eventos";
import { ipDoPedido, limitar, respostaLimite } from "@/lib/seguranca/limite";

// Eventos que acontecem no navegador (verificação do segundo fator, logout)
// e precisam ficar no histórico. Só aceita a lista abaixo e só com sessão.
const PERMITIDOS: EventoAuth[] = ["mfa_ok", "mfa_falhou", "mfa_ativado", "mfa_desativado", "logout", "sessoes_encerradas"];

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sem sessão." }, { status: 401 });

  const { evento } = await request.json().catch(() => ({}));
  if (!PERMITIDOS.includes(evento)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });

  // código do autenticador tem 1 milhão de combinações: 6 erros a cada 15 min
  // tornam a força bruta inviável
  if (evento === "mfa_falhou") {
    const l = await limitar(`mfa:${user.id}`, 6, 900);
    if (!l.permitido) {
      await supabase.auth.signOut();
      await registrarEvento(request, "login_bloqueado", { userId: user.id, email: user.email, detalhe: { motivo: "mfa" } });
      return respostaLimite(l, "verificação");
    }
  } else {
    const l = await limitar(`evento:${ipDoPedido(request)}`, 60, 600);
    if (!l.permitido) return respostaLimite(l, "registro");
  }

  await registrarEvento(request, evento, { userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
