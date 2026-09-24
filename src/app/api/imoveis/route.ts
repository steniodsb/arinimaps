import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { lerConfiguracoes, numero } from "@/lib/settings";
import { assinatura, ipDe } from "@/lib/juridico";

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
    // Proprietário pode enviar o imóvel com a conta ainda em análise (fluxo do
    // Carlos, 24/09/2026: clica na área, cadastra, manda os documentos). O
    // imóvel só publica depois que a Arini confere a matrícula — é ali que a
    // propriedade é comprovada. Conta recusada ou suspensa não anuncia.
    const { data } = await admin.from("owners").select("id, status").eq("profile_id", user.id).single();
    if (!data || !["solicitado", "em_analise", "pendente", "aprovado", "ativo"].includes(data.status)) {
      return NextResponse.json(
        { error: "Seu cadastro de proprietário não está liberado para anunciar. Fale com a Arini." },
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
  const TIPOS_DOC = ["matricula", "ccir_itr", "autorizacao", "outro"] as const;
  const docs = TIPOS_DOC.flatMap((tipo) =>
    form.getAll(`doc_${tipo}`).filter((f): f is File => f instanceof File && f.size > 0).map((arquivo) => ({ tipo, arquivo }))
  );

  if (!dados.titulo?.trim() || !dados.tipo || !geometria) {
    return NextResponse.json(
      { error: "Título, tipo e localização no mapa são obrigatórios." },
      { status: 400 }
    );
  }

  // condição de comercialização (spec item 8): parceiro é sempre "parceiro";
  // proprietário escolhe autorização simples ou exclusividade e aceita o termo.
  // A equipe Arini cadastra sem aceite eletrônico (contrato assinado vai em Documentos).
  const equipe = !owner_id && !partner_id;
  const condicao: "autorizacao" | "exclusividade" | "parceiro" = partner_id
    ? "parceiro"
    : dados.condicao === "exclusividade" ? "exclusividade" : "autorizacao";
  // comprovação de propriedade: sem matrícula não entra (a equipe Arini anexa depois)
  if (!equipe && !docs.some((d) => d.tipo === "matricula")) {
    return NextResponse.json(
      { error: "Envie a matrícula do imóvel (ou escritura/contrato registrado) para comprovar a propriedade." },
      { status: 400 }
    );
  }
  if (partner_id && !docs.some((d) => d.tipo === "autorizacao")) {
    return NextResponse.json(
      { error: "Imóvel de parceiro: envie a autorização de venda assinada pelo proprietário." },
      { status: 400 }
    );
  }
  const docGrande = docs.find((d) => d.arquivo.size > 25 * 1024 * 1024);
  if (docGrande) {
    return NextResponse.json({ error: `O arquivo ${docGrande.arquivo.name} passa de 25 MB.` }, { status: 400 });
  }

  // área do CAR: a divisa vem do NOSSO banco, não do navegador — quem manda o
  // código não consegue trocar a geometria no caminho
  let carCodigo: string | null = null;
  let geometriaFinal = geometria;
  if (geometria?.fonte === "car" && dados.car_codigo) {
    const { data: car } = await admin.rpc("fn_car_imovel", { p_cod: String(dados.car_codigo) });
    if (!car?.geometry) {
      return NextResponse.json({ error: "Área do CAR não encontrada. Clique de novo na área no mapa." }, { status: 400 });
    }
    carCodigo = String(dados.car_codigo);
    geometriaFinal = { geometry: car.geometry, fonte: "car" };
  } else if (geometria?.fonte === "car") {
    // "car" sem código não tem como ser conferido: vale como desenho comum
    geometriaFinal = { ...geometria, fonte: "desenho" };
  }

  if (!equipe && dados.aceite_termos !== true) {
    return NextResponse.json(
      { error: "Para anunciar é preciso aceitar o termo da condição de comercialização e a Regra de Remuneração." },
      { status: 400 }
    );
  }

  // unidade de empreendimento (bloco/loteamento): o anunciante informa o código do imóvel pai
  let parent_property_id: string | null = null;
  if (dados.parent_codigo?.trim()) {
    const { data: pai } = await admin
      .from("properties")
      .select("id, owner_id, partner_id")
      .eq("codigo", dados.parent_codigo.trim().toUpperCase())
      .maybeSingle();
    if (!pai) {
      return NextResponse.json({ error: "Código do empreendimento não encontrado." }, { status: 400 });
    }
    const mesmoDono =
      ["admin_central", "analista_arini"].includes(profile.role) ||
      (owner_id && pai.owner_id === owner_id) ||
      (partner_id && pai.partner_id === partner_id);
    if (!mesmoDono) {
      return NextResponse.json({ error: "O empreendimento informado não pertence a você." }, { status: 403 });
    }
    parent_property_id = pai.id;
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
      exclusividade: condicao === "exclusividade",
      parent_property_id,
      car_codigo: carCodigo,
      created_by: user.id,
    })
    .select("id, codigo")
    .single();
  if (propError) return NextResponse.json({ error: propError.message }, { status: 500 });

  // aceite versionado: versão do termo, data/hora, usuário e IP
  const cfg = await lerConfiguracoes();
  const validade = new Date(Date.now() + numero(cfg, "juridico_prazo_autorizacao_dias", 180) * 86_400_000);
  const versao = condicao === "parceiro"
    ? assinatura("parceiros", "remuneracao")
    : condicao === "exclusividade"
      ? assinatura("autorizacao", "exclusividade", "remuneracao")
      : assinatura("autorizacao", "remuneracao");
  await admin.from("property_authorizations").insert({
    property_id: property.id,
    tipo: condicao,
    validade: validade.toISOString().slice(0, 10),
    aceite_at: equipe ? null : new Date().toISOString(),
    versao: equipe ? null : versao,
    aceite_por: equipe ? null : user.id,
    aceite_ip: equipe ? null : ipDe(request),
  });

  // geometria (fonte: desenho | kml | kmz | ponto)
  const { error: geoError } = await admin.rpc("fn_upsert_geometry", {
    p_property_id: property.id,
    p_geojson: geometriaFinal.geometry ?? geometriaFinal,
    p_fonte: geometriaFinal.fonte ?? "desenho",
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

  // documentos de comprovação → bucket PRIVADO (docs), conferidos pela Arini
  const docsFalharam: string[] = [];
  for (const { tipo, arquivo } of docs.slice(0, 30)) {
    const ext = (arquivo.name.split(".").pop() || "pdf").toLowerCase();
    const path = `imoveis/${property.id}/${tipo}-${crypto.randomUUID()}.${ext}`;
    const { error: upErro } = await admin.storage.from("docs")
      .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type || "application/octet-stream" });
    if (upErro) { docsFalharam.push(arquivo.name); continue; }
    await admin.from("property_documents").insert({
      property_id: property.id, tipo, storage_path: path, nome_arquivo: arquivo.name,
    });
  }
  if (!equipe && docsFalharam.length === docs.length) {
    // nenhum documento subiu: sem comprovação o imóvel não pode ir para análise
    await admin.from("properties").delete().eq("id", property.id);
    return NextResponse.json(
      { error: "Os documentos não puderam ser salvos. Tente de novo em instantes." },
      { status: 502 }
    );
  }

  // envia direto para análise
  await admin.from("properties").update({ status: "pendente" }).eq("id", property.id);

  await logAudit({
    user_id: user.id,
    acao: "imovel_cadastrado",
    entidade: "properties",
    entidade_id: property.id,
    property_id: property.id,
    dados_depois: {
      codigo: property.codigo, titulo: dados.titulo, condicao, aceite: equipe ? null : versao,
      car: carCodigo, documentos: docs.length - docsFalharam.length, documentos_falharam: docsFalharam,
    },
  });

  return NextResponse.json({ ok: true, codigo: property.codigo, documentos_falharam: docsFalharam });
}
