import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// Cria imóvel (multipart): dados + geometria GeoJSON + fotos.
// Proprietário/parceiro precisa estar aprovado/ativo; Arini também pode cadastrar.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login para anunciar." }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });

  // resolve o responsável pelo imóvel
  let owner_id: string | null = null;
  let partner_id: string | null = null;
  if (profile.role === "proprietario") {
    const { data } = await admin.from("owners").select("id, status").eq("profile_id", user.id).single();
    if (!data || !["aprovado", "ativo"].includes(data.status)) {
      return NextResponse.json(
        { error: "Seu cadastro de proprietário ainda está em análise pela Arini." },
        { status: 403 }
      );
    }
    owner_id = data.id;
  } else if (["corretor", "imobiliaria", "engenheiro"].includes(profile.role)) {
    const { data } = await admin.from("partners").select("id, status").eq("profile_id", user.id).single();
    if (!data || !["aprovado", "ativo"].includes(data.status)) {
      return NextResponse.json(
        { error: "Seu cadastro de parceiro ainda está em análise pela Arini." },
        { status: 403 }
      );
    }
    partner_id = data.id;
  } else if (!["admin_central", "analista_arini"].includes(profile.role)) {
    return NextResponse.json({ error: "Este perfil não cadastra imóveis." }, { status: 403 });
  }

  const form = await request.formData();
  const dados = JSON.parse(String(form.get("dados") ?? "{}"));
  const geometria = JSON.parse(String(form.get("geometria") ?? "null"));
  const fotos = form.getAll("fotos").filter((f): f is File => f instanceof File);

  if (!dados.titulo?.trim() || !dados.tipo || !geometria) {
    return NextResponse.json(
      { error: "Título, tipo e localização no mapa são obrigatórios." },
      { status: 400 }
    );
  }

  // Arini cadastrando em nome de alguém (F0: fica sem vínculo, ajusta no admin)
  if (!owner_id && !partner_id) {
    const { data: anyOwner } = await admin.from("owners").select("id").limit(1).single();
    owner_id = anyOwner?.id ?? null;
  }

  const { data: property, error: propError } = await admin
    .from("properties")
    .insert({
      tipo: dados.tipo,
      owner_id,
      partner_id,
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() || "",
      valor: dados.valor || null,
      area_declarada: dados.area_declarada || null,
      caracteristicas: dados.caracteristicas ?? {},
      condicoes_venda: dados.condicoes_venda?.trim() || null,
      aceita_permuta: !!dados.aceita_permuta,
      aceita_financiamento: !!dados.aceita_financiamento,
      exclusividade: !!dados.exclusividade,
      created_by: user.id,
    })
    .select("id, codigo")
    .single();
  if (propError) return NextResponse.json({ error: propError.message }, { status: 500 });

  // geometria (fonte: desenho | kml | kmz | ponto)
  const { error: geoError } = await admin.rpc("fn_upsert_geometry", {
    p_property_id: property.id,
    p_geojson: geometria.geometry ?? geometria,
    p_fonte: geometria.fonte ?? "desenho",
  });
  if (geoError) {
    await admin.from("properties").delete().eq("id", property.id);
    return NextResponse.json({ error: `Geometria inválida: ${geoError.message}` }, { status: 400 });
  }

  // município por contenção espacial do centroide; select manual do usuário prevalece
  if (dados.municipality_id) {
    await admin.from("properties").update({ municipality_id: dados.municipality_id }).eq("id", property.id);
  } else {
    await admin.rpc("fn_set_property_municipality", { p_property_id: property.id });
  }

  // fotos → storage público
  let ordem = 0;
  for (const foto of fotos.slice(0, 20)) {
    const ext = (foto.name.split(".").pop() || "jpg").toLowerCase();
    const path = `properties/${property.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upError } = await admin.storage
      .from("media")
      .upload(path, await foto.arrayBuffer(), { contentType: foto.type || "image/jpeg" });
    if (!upError) {
      await admin.from("property_media").insert({
        property_id: property.id,
        tipo: "foto",
        storage_path: path,
        ordem,
        capa: ordem === 0,
      });
      ordem++;
    }
  }

  // envia direto para análise
  await admin.from("properties").update({ status: "pendente" }).eq("id", property.id);

  await logAudit({
    user_id: user.id,
    acao: "imovel_cadastrado",
    entidade: "properties",
    entidade_id: property.id,
    property_id: property.id,
    dados_depois: { codigo: property.codigo, titulo: dados.titulo },
  });

  return NextResponse.json({ ok: true, codigo: property.codigo });
}
