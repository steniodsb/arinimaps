import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = "id, pergunta, motivo, ocorrencias, primeira_em, ultima_em, status, artigo_id";

/** Mesma trava da base de conhecimento: Marketing e Diretoria. */
async function equipe() {
  const a = await ator();
  return a && temSetor(a, "marketing", "diretoria") ? a : null;
}

/**
 * Curadoria das perguntas sem resposta (ia_lacunas, migration 0040).
 *
 *   { acao: "vincular", artigo_id }  liga o artigo escrito para responder; se o
 *                                    artigo já está PUBLICADO a pergunta vira
 *                                    "respondida", senão segue pendente ligada
 *                                    ao rascunho (o assistente só lê publicados)
 *   { acao: "descartar" }            fora do escopo, repetida, sem sentido
 *   { acao: "reabrir" }              volta para a fila
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/ia/lacunas/[id]">) {
  const { id } = await ctx.params;
  const a = await equipe();
  if (!a) return falha(403, "sem_permissao", "As perguntas sem resposta são dos setores de Marketing e Diretoria.");
  if (!UUID.test(id)) return falha(400, "id_invalido", "Pergunta inválida.");
  const corpo = (await request.json().catch(() => ({}))) as { acao?: unknown; artigo_id?: unknown };
  const admin = supabaseAdmin();

  const { data: antes } = await admin.from("ia_lacunas").select("status, artigo_id").eq("id", id).maybeSingle();
  if (!antes) return falha(404, "nao_encontrado", "Pergunta não encontrada.");

  let mudanca: Record<string, unknown>;
  if (corpo.acao === "vincular") {
    const artigoId = typeof corpo.artigo_id === "string" && UUID.test(corpo.artigo_id) ? corpo.artigo_id : null;
    if (!artigoId) return falha(400, "artigo_invalido", "Artigo inválido.");
    const { data: artigo } = await admin.from("kb_artigos").select("status").eq("id", artigoId).maybeSingle();
    if (!artigo) return falha(404, "artigo_nao_encontrado", "Artigo não encontrado.");
    const respondida = artigo.status === "publicado";
    mudanca = {
      artigo_id: artigoId,
      status: respondida ? "respondida" : "pendente",
      resolvido_por: respondida ? a.userId : null,
      resolvido_em: respondida ? new Date().toISOString() : null,
    };
  } else if (corpo.acao === "descartar") {
    mudanca = { status: "descartada", resolvido_por: a.userId, resolvido_em: new Date().toISOString() };
  } else if (corpo.acao === "reabrir") {
    mudanca = { status: "pendente", resolvido_por: null, resolvido_em: null };
  } else {
    return falha(400, "acao_invalida", "Ação inválida.");
  }

  const { data, error } = await admin.from("ia_lacunas").update(mudanca).eq("id", id).select(CAMPOS).single();
  if (error) return falhaBanco("lacuna_falhou", error);
  await logAudit({
    user_id: a.userId, acao: `ia_lacuna_${String(corpo.acao)}`, entidade: "ia_lacunas", entidade_id: id,
    dados_antes: { status: antes.status, artigo_id: antes.artigo_id },
    dados_depois: { status: data.status, artigo_id: data.artigo_id },
  });
  return NextResponse.json({ ok: true, lacuna: data });
}
