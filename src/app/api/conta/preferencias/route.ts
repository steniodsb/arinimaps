import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { falha } from "@/lib/erros";
import { limitar, respostaLimite } from "@/lib/seguranca/limite";
import { normalizar, parcialValido } from "@/lib/preferencias";

/**
 * Preferências da conta (5.10). GET devolve também nome e foto, porque o
 * cabeçalho do site e o botão de tema leem as duas coisas no mesmo pedido.
 */
async function usuarioId() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const id = await usuarioId();
  if (!id) return falha(401, "sem_sessao", "Entre na sua conta para ver as preferências.");
  const { data } = await supabaseAdmin().from("profiles")
    .select("nome, avatar_url, preferencias").eq("user_id", id).maybeSingle();
  if (!data) return falha(404, "sem_perfil", "Conta não encontrada.");
  return NextResponse.json(
    { preferencias: normalizar(data.preferencias), nome: data.nome ?? null, avatar_url: data.avatar_url ?? null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(request: Request) {
  const id = await usuarioId();
  if (!id) return falha(401, "sem_sessao", "Entre na sua conta para salvar as preferências.");
  const limite = await limitar(`preferencias:${id}`, 60, 60);
  if (!limite.permitido) return respostaLimite(limite, "gravação");

  const parcial = parcialValido(await request.json().catch(() => ({})));
  if (!Object.keys(parcial).length) {
    return falha(400, "nada_valido", "Nenhuma preferência válida enviada.", {
      solucao: "Use tema (claro/escuro/sistema), mapa_base (satelite/mapa), camada_car ou emails_novidades (true/false).",
    });
  }
  const admin = supabaseAdmin();
  const { data: atual } = await admin.from("profiles").select("preferencias").eq("user_id", id).maybeSingle();
  const prefs = normalizar({ ...normalizar(atual?.preferencias), ...parcial });
  const { error } = await admin.from("profiles").update({ preferencias: prefs }).eq("user_id", id);
  if (error) return falha(500, "erro_banco", "Não foi possível salvar.", { motivo: error.message });
  return NextResponse.json({ ok: true, preferencias: prefs });
}
