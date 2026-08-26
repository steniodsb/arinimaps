import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, podeOperarOportunidade } from "@/lib/authz";

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

  const admin = supabaseAdmin();
  const ext = (arquivo.name.split(".").pop() || "pdf").toLowerCase();
  const path = `contratos/${id}/${crypto.randomUUID()}.${ext}`;
  const { error: upError } = await admin.storage.from("docs")
    .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type || "application/pdf" });
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  await admin.from("contracts").upsert({ opportunity_id: id, documento_path: path }, { onConflict: "opportunity_id" });
  await logAudit({ user_id: a.userId, acao: "contrato_documento", entidade: "contracts", opportunity_id: id, dados_depois: { path } });
  return NextResponse.json({ ok: true });
}

// URL assinada para baixar o contrato.
export async function GET(_request: Request, ctx: RouteContext<"/api/oportunidades/[id]/contrato">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a || !(await podeOperarOportunidade(a, id))) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("contracts").select("documento_path").eq("opportunity_id", id).maybeSingle();
  if (!c?.documento_path) return NextResponse.json({ error: "Sem documento." }, { status: 404 });
  const { data: signed } = await admin.storage.from("docs").createSignedUrl(c.documento_path, 3600);
  return NextResponse.json({ url: signed?.signedUrl });
}
