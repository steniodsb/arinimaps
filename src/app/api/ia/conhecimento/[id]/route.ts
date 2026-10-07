import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { validarArtigo } from "@/lib/ia/conhecimento";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function equipe() {
  const a = await ator();
  return a && temSetor(a, "marketing", "diretoria") ? a : null;
}

/** Artigo + todas as versões (a trilha é gravada pelo banco, gatilho tg_kb_depois_gravar). */
export async function GET(_request: Request, ctx: RouteContext<"/api/ia/conhecimento/[id]">) {
  const { id } = await ctx.params;
  if (!(await equipe())) return falha(403, "sem_permissao", "A base de conhecimento é dos setores de Marketing e Diretoria.");
  if (!UUID.test(id)) return falha(400, "id_invalido", "Artigo inválido.");
  const admin = supabaseAdmin();
  const [{ data: artigo }, { data: versoes }] = await Promise.all([
    admin.from("kb_artigos").select("*").eq("id", id).maybeSingle(),
    admin.from("kb_artigos_versoes").select("versao, titulo, conteudo, fonte, data_referencia, status, editado_por, created_at")
      .eq("artigo_id", id).order("versao", { ascending: false }),
  ]);
  if (!artigo) return falha(404, "nao_encontrado", "Artigo não encontrado.");
  const autores = [...new Set((versoes ?? []).map((v) => v.editado_por).filter(Boolean))] as string[];
  const { data: perfis } = autores.length
    ? await admin.from("profiles").select("user_id, nome").in("user_id", autores)
    : { data: [] as { user_id: string; nome: string }[] };
  const nome = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]));
  const { busca: _b, ...semBusca } = artigo as Record<string, unknown>;
  void _b;
  return NextResponse.json({
    artigo: semBusca,
    versoes: (versoes ?? []).map((v) => ({ ...v, editado_por_nome: v.editado_por ? nome.get(v.editado_por) ?? "—" : "Sistema (migração)" })),
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/ia/conhecimento/[id]">) {
  const { id } = await ctx.params;
  const a = await equipe();
  if (!a) return falha(403, "sem_permissao", "A base de conhecimento é dos setores de Marketing e Diretoria.");
  if (!UUID.test(id)) return falha(400, "id_invalido", "Artigo inválido.");
  const v = validarArtigo((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if ("erro" in v) return falha(400, "artigo_invalido", v.erro);
  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("kb_artigos").select("versao, status, titulo").eq("id", id).maybeSingle();
  if (!antes) return falha(404, "nao_encontrado", "Artigo não encontrado.");
  const { data, error } = await admin.from("kb_artigos")
    .update({ ...v.dados, atualizado_por: a.userId }).eq("id", id).select("versao").single();
  if (error) return falhaBanco("artigo_falhou", error);
  await logAudit({
    user_id: a.userId, acao: "kb_artigo_alterado", entidade: "kb_artigos", entidade_id: id,
    dados_antes: { versao: antes.versao, status: antes.status, titulo: antes.titulo },
    dados_depois: { versao: data.versao, status: v.dados.status, titulo: v.dados.titulo },
  });
  return NextResponse.json({ ok: true, versao: data.versao });
}
