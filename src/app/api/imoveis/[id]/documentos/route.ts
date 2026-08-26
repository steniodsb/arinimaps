import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

async function podeEditarImovel(a: NonNullable<Awaited<ReturnType<typeof ator>>>, propertyId: string) {
  if (a.ehArini) return true;
  const { data: p } = await supabaseAdmin()
    .from("properties").select("owner_id, partner_id").eq("id", propertyId).single();
  if (!p) return false;
  return (a.ownerId && p.owner_id === a.ownerId) || (a.partnerId && p.partner_id === a.partnerId);
}

// Upload de documento do imóvel (matrícula, CAR, ITR, DWG, autorização) — bucket privado.
export async function POST(request: Request, ctx: RouteContext<"/api/imoveis/[id]/documentos">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!(await podeEditarImovel(a, id))) return NextResponse.json({ error: "Sem acesso a este imóvel." }, { status: 403 });

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("tipo") ?? "outro");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
  if (arquivo.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Arquivo acima de 25 MB." }, { status: 400 });

  const admin = supabaseAdmin();
  const ext = (arquivo.name.split(".").pop() || "pdf").toLowerCase();
  const path = `imoveis/${id}/${tipo}-${crypto.randomUUID()}.${ext}`;
  const { error: upError } = await admin.storage.from("docs")
    .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type || "application/octet-stream" });
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  const { data: doc, error } = await admin.from("property_documents")
    .insert({ property_id: id, tipo, storage_path: path }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ user_id: a.userId, acao: "documento_anexado", entidade: "property_documents", entidade_id: doc.id, property_id: id, dados_depois: { tipo, nome: arquivo.name } });
  return NextResponse.json({ ok: true });
}

// Lista documentos com URL assinada (1 h).
export async function GET(_request: Request, ctx: RouteContext<"/api/imoveis/[id]/documentos">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!(await podeEditarImovel(a, id))) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: docs } = await admin.from("property_documents")
    .select("id, tipo, storage_path, verificado, created_at").eq("property_id", id).order("created_at");
  const out = [];
  for (const d of docs ?? []) {
    const { data: signed } = await admin.storage.from("docs").createSignedUrl(d.storage_path, 3600);
    out.push({ ...d, url: signed?.signedUrl ?? null });
  }
  return NextResponse.json({ documentos: out });
}
