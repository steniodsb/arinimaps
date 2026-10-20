import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { setoresDe } from "@/lib/setores";
import { mfaPendente } from "@/lib/authz";

/**
 * Número da matrícula do anúncio, conferido pela Matriz (20/10/2026).
 * POST { property_id, numero, cartorio, conferir }:
 *  · grava número e cartório (a equipe pode corrigir o que o anunciante digitou);
 *  · `conferir: true` marca como conferida contra o documento, com quem e quando;
 *  · mudar o número de uma matrícula já conferida tira a conferência.
 * Mesma permissão das decisões sobre anúncios: setor de Operações.
 */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("role, setores").eq("user_id", user.id).single();
  const daEquipe = !!profile && ["admin_central", "analista_arini"].includes(profile.role);
  if (!daEquipe || !setoresDe(profile.role, profile.setores as string[] | null).includes("operacoes") ||
      (await mfaPendente(supabase, daEquipe))) {
    return NextResponse.json({ error: "A conferência da matrícula é do setor de Operações." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { property_id?: string; numero?: string; cartorio?: string; conferir?: boolean };
  const propertyId = String(body.property_id ?? "");
  const numero = String(body.numero ?? "").trim().slice(0, 120);
  const cartorio = String(body.cartorio ?? "").trim().slice(0, 200) || null;
  if (!propertyId) return NextResponse.json({ error: "Imóvel não informado." }, { status: 400 });
  if (!numero) return NextResponse.json({ error: "Informe o número da matrícula.", solucao: "Copie do topo do documento da matrícula." }, { status: 400 });

  const { data: imovel } = await admin.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (!imovel) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

  const { data: antes } = await admin.from("property_matriculas").select("numero, cartorio, conferida_em").eq("property_id", propertyId).maybeSingle();
  const mudouNumero = !!antes && antes.numero !== numero;
  const conferida = body.conferir
    ? { conferida_em: new Date().toISOString(), conferida_por: user.id }
    : mudouNumero ? { conferida_em: null, conferida_por: null } : {};

  const { data: depois, error } = await admin.from("property_matriculas")
    .upsert({ property_id: propertyId, numero, cartorio, updated_at: new Date().toISOString(), ...conferida }, { onConflict: "property_id" })
    .select("numero, cartorio, conferida_em")
    .single();
  if (error) return NextResponse.json({ error: "Não foi possível gravar a matrícula agora." }, { status: 500 });

  await logAudit({
    user_id: user.id, acao: body.conferir ? "matricula_conferida" : "matricula_alterada",
    entidade: "property_matriculas", entidade_id: propertyId, property_id: propertyId,
    dados_antes: antes ?? null, dados_depois: depois,
  });
  return NextResponse.json({ ok: true, matricula: depois });
}
