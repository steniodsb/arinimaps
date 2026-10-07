import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { validarArtigo } from "@/lib/ia/conhecimento";

/**
 * Base de conhecimento — lista/busca (GET) e criação (POST).
 * Só a equipe de Marketing e a Diretoria (trava aqui, não no menu).
 */
async function equipe() {
  const a = await ator();
  return a && temSetor(a, "marketing", "diretoria") ? a : null;
}

export async function GET(request: Request) {
  if (!(await equipe())) return falha(403, "sem_permissao", "A base de conhecimento é dos setores de Marketing e Diretoria.");
  const q = new URL(request.url).searchParams.get("q")?.trim();
  const admin = supabaseAdmin();
  if (q) {
    // a mesma busca que o assistente usa (só publicados) — para testar
    const { data, error } = await admin.rpc("fn_kb_buscar", { p_q: q.slice(0, 300), p_limite: 5 });
    if (error) return falhaBanco("busca_falhou", error);
    return NextResponse.json({ resultados: data ?? [] });
  }
  const { data, error } = await admin.from("kb_artigos")
    .select("id, slug, titulo, conteudo, fonte, data_referencia, status, versao, updated_at")
    .order("status").order("updated_at", { ascending: false });
  if (error) return falhaBanco("lista_falhou", error);
  return NextResponse.json({ artigos: data ?? [] });
}

export async function POST(request: Request) {
  const a = await equipe();
  if (!a) return falha(403, "sem_permissao", "A base de conhecimento é dos setores de Marketing e Diretoria.");
  const v = validarArtigo((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if ("erro" in v) return falha(400, "artigo_invalido", v.erro);
  const { data, error } = await supabaseAdmin().from("kb_artigos")
    .insert({ ...v.dados, atualizado_por: a.userId }).select("id, versao").single();
  if (error) return falhaBanco("artigo_falhou", error);
  await logAudit({
    user_id: a.userId, acao: "kb_artigo_criado", entidade: "kb_artigos", entidade_id: data.id,
    dados_depois: { slug: v.dados.slug, titulo: v.dados.titulo, status: v.dados.status, versao: data.versao },
  });
  return NextResponse.json({ ok: true, id: data.id });
}
