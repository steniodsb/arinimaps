import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { registrarTentativa } from "@/lib/planos-servidor";

/**
 * Marca alertas de segurança como vistos (item 6.8). O conteúdo do alerta
 * não muda — o banco recusa qualquer outra alteração (fn_alerta_so_visto).
 *   PATCH { id }          → um alerta
 *   PATCH { todos: true } → todos os abertos
 */
export async function PATCH(request: Request) {
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "seguranca")) {
    await registrarTentativa({ request, userId: a.userId, role: a.role, recurso: "setor:seguranca", motivo: "sem_setor" });
    return falha(403, "sem_setor", "Alertas de segurança são do setor de Segurança.");
  }
  const b = await request.json().catch(() => ({}));
  const marca = { visto_por: a.userId, visto_em: new Date().toISOString() };
  const admin = supabaseAdmin();
  if (b?.todos === true) {
    const { error } = await admin.from("alertas_seguranca").update(marca).is("visto_em", null);
    if (error) return falha(500, "falha_banco", "Não foi possível marcar os alertas.", { motivo: error.message });
    return NextResponse.json({ ok: true });
  }
  const id = typeof b?.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return falha(400, "id_invalido", "Informe o alerta.");
  const { error } = await admin.from("alertas_seguranca").update(marca).eq("id", id).is("visto_em", null);
  if (error) return falha(500, "falha_banco", "Não foi possível marcar o alerta.", { motivo: error.message });
  return NextResponse.json({ ok: true });
}
