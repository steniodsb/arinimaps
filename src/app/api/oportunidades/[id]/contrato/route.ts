import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, podeOperarOportunidade } from "@/lib/authz";
import { ACEITA, conferirArquivo } from "@/lib/seguranca/arquivos";
import { urlArquivo } from "@/lib/seguranca/link-arquivo";

// Upload do documento do contrato (bucket privado 'docs').
export async function POST(request: Request, ctx: RouteContext<"/api/oportunidades/[id]/contrato">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!a.ehArini || !(await podeOperarOportunidade(a, id))) {
    return NextResponse.json({ error: "Contrato é conduzido pela Arini." }, { status: 403 });
  }

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Envie o arquivo do contrato." }, { status: 400 });

  // tamanho e conteúdo conferidos (item 6.2): o tipo gravado é o real, não o declarado
  const conferido = await conferirArquivo(arquivo, ACEITA.documento, 25 * 1024 * 1024);
  if (!conferido.ok) return NextResponse.json({ error: conferido.erro }, { status: 400 });

  const admin = supabaseAdmin();
  const path = `contratos/${id}/${crypto.randomUUID()}.${conferido.arquivo.ext}`;
  const { error: upError } = await admin.storage.from("docs")
    .upload(path, conferido.arquivo.bytes, { contentType: conferido.arquivo.contentType });
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  await admin.from("contracts").upsert({ opportunity_id: id, documento_path: path }, { onConflict: "opportunity_id" });
  await logAudit({ user_id: a.userId, acao: "contrato_documento", entidade: "contracts", opportunity_id: id, dados_depois: { path } });
  return NextResponse.json({ ok: true });
}

// Endereço para baixar o contrato. Passa por /api/arquivos, que confere a
// permissão de novo, registra quem abriu e só então assina por 60 s (item 6.3).
export async function GET(_request: Request, ctx: RouteContext<"/api/oportunidades/[id]/contrato">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a || !(await podeOperarOportunidade(a, id))) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("contracts").select("documento_path").eq("opportunity_id", id).maybeSingle();
  if (!c?.documento_path) return NextResponse.json({ error: "Sem documento." }, { status: 404 });
  return NextResponse.json({ url: urlArquivo(c.documento_path, "baixar") });
}
