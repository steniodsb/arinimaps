import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

// Upload de camada de cartografia urbana (GeoTIFF/imagem georreferenciada).
// O worker (job tile_raster) processa em tiles; até lá fica 'enviado'.
export async function POST(request: Request) {
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Restrito à Arini." }, { status: 403 });

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const municipality_id = String(form.get("municipality_id") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!(arquivo instanceof File) || !municipality_id || !nome) {
    return NextResponse.json({ error: "Informe nome, município e o arquivo." }, { status: 400 });
  }
  if (arquivo.size > 300 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo acima de 300 MB — fale com o dev." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const ext = (arquivo.name.split(".").pop() || "tif").toLowerCase();
  const path = `cartografia/${municipality_id}/${crypto.randomUUID()}.${ext}`;
  const { error: upError } = await admin.storage.from("media")
    .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type || "application/octet-stream" });
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  const { data: layer, error } = await admin.from("cartography_layers")
    .insert({ municipality_id, nome, source_path: path })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("jobs").insert({ tipo: "tile_raster", payload: { layer_id: layer.id, source_path: path } });
  await logAudit({ user_id: a.userId, acao: "cartografia_enviada", entidade: "cartography_layers", entidade_id: layer.id, dados_depois: { nome, path } });
  return NextResponse.json({ ok: true });
}
