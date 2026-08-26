import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { converterDxf } from "@/lib/geo/dxf";

// Uploads grandes de planta (DXF de cidade passa de 25 MB) precisam de fôlego.
export const maxDuration = 300;

/**
 * Sobe camada de cartografia urbana:
 *  - .dxf  → convertido aqui para GeoJSON WGS84 e publicado na hora (vetorial)
 *  - imagem georreferenciada (.tif/.png/.jpg) → vira job de tiles para o worker
 *  - .dwg  → recusado com instrução (formato fechado; exportar DXF no CAD)
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Restrito à Arini." }, { status: 403 });

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const municipality_id = String(form.get("municipality_id") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  const zona = form.get("zona") ? Number(form.get("zona")) : undefined;

  if (!(arquivo instanceof File) || !municipality_id || !nome) {
    return NextResponse.json({ error: "Informe nome, município e o arquivo." }, { status: 400 });
  }
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "dwg") {
    return NextResponse.json({
      error: "DWG é formato fechado. No AutoCAD use Salvar como → DXF (qualquer versão) e envie o .dxf — a conversão é automática.",
    }, { status: 400 });
  }
  if (arquivo.size > 120 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo acima de 120 MB — fale com o desenvolvedor." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // ---------- planta vetorial (DXF) ----------
  if (ext === "dxf") {
    let convertido;
    try {
      convertido = converterDxf(await arquivo.text(), zona);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Não foi possível ler o DXF." },
        { status: 400 }
      );
    }

    const path = `cartografia/vetor/${municipality_id}-${crypto.randomUUID()}.geojson`;
    const { error: upErro } = await admin.storage.from("media").upload(
      path, Buffer.from(JSON.stringify(convertido.geojson)),
      { contentType: "application/geo+json", upsert: true }
    );
    if (upErro) return NextResponse.json({ error: upErro.message }, { status: 500 });

    // uma planta ativa por município: a nova substitui a anterior
    await admin.from("cartography_layers")
      .delete().eq("municipality_id", municipality_id).eq("tipo", "vector");
    const { data: camada, error } = await admin.from("cartography_layers").insert({
      municipality_id, nome, tipo: "vector",
      source_path: path, tiles_path: path,
      status: "pronto", min_zoom: 12, max_zoom: 19, opacidade_padrao: 0.85,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAudit({
      user_id: a.userId, acao: "cartografia_dxf_publicada",
      entidade: "cartography_layers", entidade_id: camada.id,
      dados_depois: { nome, linhas: convertido.linhas, zona: convertido.zona },
    });

    return NextResponse.json({
      ok: true,
      tipo: "vetorial",
      linhas: convertido.linhas,
      layers_cad: convertido.layersCad,
      zona: convertido.zona,
      bbox: convertido.bbox,
      mensagem: `Planta publicada: ${convertido.linhas.toLocaleString("pt-BR")} linhas em ${convertido.layersCad} camadas do CAD.`,
    });
  }

  // ---------- imagem georreferenciada (vira tiles no worker) ----------
  const path = `cartografia/${municipality_id}/${crypto.randomUUID()}.${ext || "tif"}`;
  const { error: upError } = await admin.storage.from("media")
    .upload(path, await arquivo.arrayBuffer(), { contentType: arquivo.type || "application/octet-stream" });
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  const { data: layer, error } = await admin.from("cartography_layers")
    .insert({ municipality_id, nome, tipo: "raster", source_path: path })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("jobs").insert({ tipo: "tile_raster", payload: { layer_id: layer.id, source_path: path } });
  await logAudit({
    user_id: a.userId, acao: "cartografia_enviada",
    entidade: "cartography_layers", entidade_id: layer.id, dados_depois: { nome, path },
  });
  return NextResponse.json({
    ok: true, tipo: "raster",
    mensagem: "Imagem enviada — o worker vai gerar os tiles e a camada entra no mapa.",
  });
}
