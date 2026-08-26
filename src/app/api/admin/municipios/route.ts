import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

// Adiciona município à região buscando nome + malha no IBGE.
export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") return NextResponse.json({ error: "Restrito à diretoria." }, { status: 403 });

  const { codigo_ibge, region_id } = await request.json().catch(() => ({}));
  if (!/^\d{7}$/.test(String(codigo_ibge ?? ""))) {
    return NextResponse.json({ error: "Código IBGE deve ter 7 dígitos." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: existe } = await admin.from("municipalities").select("id").eq("codigo_ibge", codigo_ibge).maybeSingle();
  if (existe) return NextResponse.json({ error: "Município já cadastrado." }, { status: 400 });

  let regiao = region_id;
  if (!regiao) {
    const { data: r } = await admin.from("regions").select("id").eq("ativa", true).limit(1).single();
    regiao = r?.id;
  }

  const metaRes = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo_ibge}`);
  const meta = await metaRes.json().catch(() => null);
  if (!meta?.nome) return NextResponse.json({ error: "Código não encontrado no IBGE." }, { status: 404 });
  const malhaRes = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigo_ibge}?formato=application/vnd.geo+json`);
  const malha = await malhaRes.json().catch(() => null);
  const geom = malha?.features?.[0]?.geometry ?? malha?.geometry ??
    (["Polygon", "MultiPolygon"].includes(malha?.type) ? malha : null);
  if (!geom) return NextResponse.json({ error: "Malha do IBGE indisponível para este código." }, { status: 502 });

  const uf = meta.microrregiao?.mesorregiao?.UF?.sigla ?? meta["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? "MG";
  const { error } = await admin.rpc("fn_inserir_municipio", {
    p_region_id: regiao,
    p_nome: meta.nome,
    p_uf: uf,
    p_codigo: String(codigo_ibge),
    p_geojson: geom,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ user_id: a.userId, acao: "municipio_adicionado", entidade: "municipalities", dados_depois: { codigo_ibge, nome: meta.nome } });
  return NextResponse.json({ ok: true, nome: meta.nome });
}
