import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";

/**
 * Validação da divisa pela Matriz (requisitos cartográficos §3): a versão
 * atual da geometria passa de "informada pelo usuário" a "validada". Só
 * Operações e Cartografia validam; a aprovação do anúncio também chama isto.
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "operacoes", "cartografia")) {
    return falha(403, "sem_setor", "A validação da divisa é dos setores de Operações e Cartografia.");
  }

  const b = await request.json().catch(() => ({}));
  const propertyId = String(b.property_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return falha(400, "dados_invalidos", "Informe o imóvel.");
  const motivo = typeof b.motivo === "string" && b.motivo.trim() ? b.motivo.trim().slice(0, 500) : null;

  const { data: versaoId, error } = await supabaseAdmin().rpc("fn_validar_geometria", {
    p_property_id: propertyId, p_user_id: a.userId, p_motivo: motivo,
  });
  if (error) return falha(400, "validacao_falhou", "Não foi possível validar a divisa.", { motivo: error.message });

  await logAudit({
    user_id: a.userId, acao: "geometria_validada", entidade: "property_geometry_versions",
    entidade_id: (versaoId as string | null) ?? null, property_id: propertyId, dados_depois: { motivo },
  });
  return NextResponse.json({ ok: true, versao_id: versaoId });
}
