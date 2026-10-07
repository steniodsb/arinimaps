import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { lerConfiguracoes, numero } from "@/lib/settings";
import { assinatura, ipDe } from "@/lib/juridico";
import { ehParceiro } from "@/lib/perfis";
import { registrarOrigemDado } from "@/lib/imovel/eventos";
import { ACEITA, conferirArquivo, type ArquivoConferido } from "@/lib/seguranca/arquivos";

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
  } else if (ehParceiro(profile.role)) {
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
  const TIPOS_DOC = ["matricula", "edital", "ccir_itr", "autorizacao", "outro"] as const;
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
  // Leilão: só leiloeiro ou a equipe cadastram; o documento que sustenta o
  // anúncio é o edital, não a autorização do proprietário.
  const modalidade: "venda" | "leilao" =
    profile.role === "leiloeiro" || (equipe && dados.modalidade === "leilao") ? "leilao" : "venda";
  const txt = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const dinheiro = (v: unknown) => {
    const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const leilao = modalidade === "leilao" ? {
    praca1_data: txt(dados.leilao?.praca1_data, 40), praca1_lance: dinheiro(dados.leilao?.praca1_lance),
    praca2_data: txt(dados.leilao?.praca2_data, 40), praca2_lance: dinheiro(dados.leilao?.praca2_lance),
    processo: txt(dados.leilao?.processo), comitente: txt(dados.leilao?.comitente),
    site: /^https?:\/\//i.test(String(dados.leilao?.site ?? "")) ? txt(dados.leilao?.site, 500) : null,
    condicoes: txt(dados.leilao?.condicoes, 2000),
  } : {};
  if (modalidade === "leilao" && !equipe) {
    if (!docs.some((d) => d.tipo === "edital")) {
      return NextResponse.json({ error: "Envie o edital do leilão." }, { status: 400 });
    }
    if (!(leilao as { praca1_data?: string | null }).praca1_data) {
      return NextResponse.json({ error: "Informe a data da 1ª praça do leilão." }, { status: 400 });
    }
  }

  // comprovação de propriedade: sem matrícula não entra (a equipe Arini anexa depois)
  if (!equipe && modalidade === "venda" && !docs.some((d) => d.tipo === "matricula")) {
    return NextResponse.json(
      { error: "Envie a matrícula do imóvel (ou escritura/contrato registrado) para comprovar a propriedade." },
      { status: 400 }
    );
  }
  if (partner_id && modalidade === "venda" && !docs.some((d) => d.tipo === "autorizacao")) {
    return NextResponse.json(
      { error: "Imóvel de parceiro: envie a autorização de venda assinada pelo proprietário." },
      { status: 400 }
    );
  }
  const docGrande = docs.find((d) => d.arquivo.size > 25 * 1024 * 1024);
  if (docGrande) {
    return NextResponse.json({ error: `O arquivo ${docGrande.arquivo.name} passa de 25 MB.` }, { status: 400 });
  }
  // conteúdo conferido pelos primeiros bytes (item 6.2): página ou script
  // renomeado para .jpg/.pdf não entra, e o tipo gravado é o real
  const fotosOk: ArquivoConferido[] = [];
  for (const foto of fotos.slice(0, 20)) {
    const c = await conferirArquivo(foto, ACEITA.imagem, 20 * 1024 * 1024);
    if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });
    fotosOk.push(c.arquivo);
  }
  const docsOk: { tipo: string; nome: string; arquivo: ArquivoConferido }[] = [];
  for (const { tipo, arquivo } of docs.slice(0, 30)) {
    const c = await conferirArquivo(arquivo, ACEITA.documento, 25 * 1024 * 1024);
    if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });
    docsOk.push({ tipo, nome: arquivo.name, arquivo: c.arquivo });
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
  } else if (geometria?.fonte === "lote" && /^[0-9a-f-]{36}$/i.test(String(dados.lote_id ?? ""))) {
    // lote urbano: mesma regra do CAR — a divisa é a do nosso banco
    const { data: lote } = await admin.rpc("fn_lote", { p_id: String(dados.lote_id) });
    if (!lote?.geometry) {
      return NextResponse.json({ error: "Lote não encontrado. Clique de novo no lote no mapa." }, { status: 400 });
    }
    geometriaFinal = { geometry: lote.geometry, fonte: "lote" };
  } else if (geometria?.fonte === "car" || geometria?.fonte === "lote") {
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
      modalidade,
      leilao,
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
  // Selfie no aceite da exclusividade (pedido do Carlos, 01/10/2026): foto de
  // identificação de quem aceitou, no cofre privado. Não há reconhecimento
  // facial — é evidência para conferência humana.
  let selfiePath: string | null = null;
  const selfie = form.get("selfie");
  const exigeSelfie = condicao === "exclusividade" && !equipe && cfg.juridico_selfie_exclusividade !== false;
  if (exigeSelfie) {
    const selfieOk = selfie instanceof File ? await conferirArquivo(selfie, ACEITA.imagem, 15 * 1024 * 1024) : null;
    if (!selfieOk?.ok) {
      await admin.from("properties").delete().eq("id", property.id);
      return NextResponse.json(
        { error: "Para a exclusividade, envie uma selfie (foto de até 15 MB) de quem está aceitando o termo." },
        { status: 400 }
      );
    }
    selfiePath = `imoveis/${property.id}/selfie-${crypto.randomUUID()}.${selfieOk.arquivo.ext}`;
    const { error: sErro } = await admin.storage.from("docs")
      .upload(selfiePath, selfieOk.arquivo.bytes, { contentType: selfieOk.arquivo.contentType });
    if (sErro) {
      await admin.from("properties").delete().eq("id", property.id);
      return NextResponse.json({ error: "A selfie não pôde ser salva. Tente de novo." }, { status: 502 });
    }
  }

  await admin.from("property_authorizations").insert({
    property_id: property.id,
    selfie_path: selfiePath,
    tipo: condicao,
    validade: validade.toISOString().slice(0, 10),
    aceite_at: equipe ? null : new Date().toISOString(),
    versao: equipe ? null : versao,
    aceite_por: equipe ? null : user.id,
    aceite_ip: equipe ? null : ipDe(request),
  });

  // geometria (fonte: desenho | kml | kmz | ponto | car | lote)
  // §1.5 origem do dado: CAR e lote vêm do nosso banco (fonte oficial); o
  // resto é geometria informada pelo usuário até a Matriz validar (§3).
  const fonteGeometria: string = geometriaFinal.fonte ?? "desenho";
  const origemGeometria = ["car", "lote"].includes(fonteGeometria) ? "fonte_oficial" : "geometria_usuario";
  const { error: geoError } = await admin.rpc("fn_upsert_geometry", {
    p_property_id: property.id,
    p_geojson: geometriaFinal.geometry ?? geometriaFinal,
    p_fonte: fonteGeometria,
    p_origem: origemGeometria,
    p_motivo: "Cadastro do imóvel",
    p_user_id: user.id,
  });
  if (geoError) {
    await admin.from("properties").delete().eq("id", property.id);
    return NextResponse.json({ error: `Geometria inválida: ${geoError.message}` }, { status: 400 });
  }
  await Promise.all([
    registrarOrigemDado({
      propertyId: property.id, campo: "cadastro", userId: user.id,
      origem: partner_id ? "corretor_franquia" : "proprietario",
      detalhe: equipe ? "Cadastrado pela equipe da Arini em nome do anunciante" : "Cadastro informado pelo anunciante",
    }),
    registrarOrigemDado({
      propertyId: property.id, campo: "geometria", userId: user.id, origem: origemGeometria,
      detalhe: fonteGeometria === "car"
        ? `Divisa trazida do CAR ${carCodigo ?? ""}`.trim()
        : fonteGeometria === "lote" ? "Divisa do lote da base cartográfica" : `Divisa informada pelo anunciante (${fonteGeometria})`,
    }),
  ]);

  // município por contenção espacial do centroide; select manual do usuário prevalece
  if (dados.municipality_id) {
    await admin.from("properties").update({ municipality_id: dados.municipality_id }).eq("id", property.id);
  } else {
    await admin.rpc("fn_set_property_municipality", { p_property_id: property.id });
  }

  // fotos → storage público
  let ordem = 0;
  for (const foto of fotosOk) {
    const path = `properties/${property.id}/${crypto.randomUUID()}.${foto.ext}`;
    const { error: upError } = await admin.storage
      .from("media")
      .upload(path, foto.bytes, { contentType: foto.contentType });
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
  for (const { tipo, nome, arquivo } of docsOk) {
    const path = `imoveis/${property.id}/${tipo}-${crypto.randomUUID()}.${arquivo.ext}`;
    const { error: upErro } = await admin.storage.from("docs")
      .upload(path, arquivo.bytes, { contentType: arquivo.contentType });
    if (upErro) { docsFalharam.push(nome); continue; }
    await admin.from("property_documents").insert({
      property_id: property.id, tipo, storage_path: path, nome_arquivo: nome,
    });
  }
  if (!equipe && docsFalharam.length === docsOk.length) {
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
      modalidade, selfie: !!selfiePath,
    },
  });

  return NextResponse.json({ ok: true, id: property.id, codigo: property.codigo, documentos_falharam: docsFalharam });
}
