import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendEmail, emailDoProfile } from "@/lib/notify";
import { buscarEVincularPois } from "@/lib/overpass";

async function emailDoAnunciante(propertyId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("properties").select("owner_id, partner_id").eq("id", propertyId).single();
  if (!p) return null;
  if (p.owner_id) {
    const { data: o } = await admin.from("owners").select("profile_id").eq("id", p.owner_id).single();
    if (o) return emailDoProfile(o.profile_id);
  }
  if (p.partner_id) {
    const { data: pa } = await admin.from("partners").select("profile_id").eq("id", p.partner_id).single();
    if (pa) return emailDoProfile(pa.profile_id);
  }
  return null;
}

const ACOES_IMOVEL = ["em_analise", "aprovado", "correcao", "reprovado", "publicado", "suspenso"];

// Decisões da Arini sobre imóveis e cadastros (parceiro/proprietário).
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).single();
  if (!profile || !["admin_central", "analista_arini"].includes(profile.role)) {
    return NextResponse.json({ error: "Acesso restrito à Arini." }, { status: 403 });
  }

  const { alvo, id, acao, motivo } = await request.json().catch(() => ({}));

  // ---------- imóveis ----------
  if (alvo === "imovel") {
    if (!ACOES_IMOVEL.includes(acao)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const { data: antes } = await admin.from("properties").select("id, codigo, status").eq("id", id).single();
    if (!antes) return NextResponse.json({ error: "Imóvel não encontrado." }, { status: 404 });

    const { error } = await admin
      .from("properties")
      .update({ status: acao, motivo_correcao: ["correcao", "reprovado"].includes(acao) ? motivo || null : null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 }); // transição inválida cai aqui

    if (acao === "publicado") {
      // mensalidade nasce junto com a publicação (idempotente)
      const { data: valorPadrao } = await admin.from("settings").select("valor").eq("chave", "mensalidade_valor_padrao").single();
      await admin.from("subscriptions").upsert(
        { property_id: id, valor_mensal: Number(valorPadrao?.valor ?? 0) },
        { onConflict: "property_id", ignoreDuplicates: true }
      );
      // apresentação 3D fica disponível na hora; vídeo/OG vão para a fila do worker
      await admin.from("presentations").insert([
        { property_id: id, tipo: "tour3d", status: "pronto", output_path: `/imovel/${antes.codigo}/tour` },
        { property_id: id, tipo: "video", status: "pendente" },
      ]);
      await admin.from("jobs").insert([
        { tipo: "render_video", payload: { property_id: id, codigo: antes.codigo } },
        { tipo: "screenshot_og", payload: { property_id: id, codigo: antes.codigo } },
      ]);
      // POIs: tenta agora (Overpass com cache); se falhar vira job
      buscarEVincularPois(id).catch(() => undefined);
    }

    // avisa o anunciante nas decisões que mudam a vida dele
    const mensagens: Record<string, string> = {
      aprovado: "Seu imóvel foi APROVADO pela Arini e será publicado em breve.",
      publicado: `Seu imóvel está PUBLICADO no mapa: ${process.env.NEXT_PUBLIC_SITE_URL}/imovel/${antes.codigo}`,
      correcao: `A Arini pediu correções no seu imóvel: ${motivo ?? "veja o painel"}. Acesse ${process.env.NEXT_PUBLIC_SITE_URL}/painel`,
      reprovado: `Seu imóvel não foi aprovado. Motivo: ${motivo ?? "entre em contato com a Arini"}.`,
    };
    if (mensagens[acao]) {
      emailDoAnunciante(id).then((to) =>
        sendEmail(to, `Arini Imóveis Brasil — imóvel ${antes.codigo}`, mensagens[acao])
      ).catch(() => undefined);
    }

    await logAudit({
      user_id: user.id,
      acao: `imovel_${acao}`,
      entidade: "properties",
      entidade_id: id,
      property_id: id,
      dados_antes: { status: antes.status },
      dados_depois: { status: acao, motivo },
    });
    return NextResponse.json({ ok: true });
  }

  // ---------- cadastros (parceiro / proprietário) ----------
  if (alvo === "partner" || alvo === "owner") {
    const tabela = alvo === "partner" ? "partners" : "owners";
    if (!["aprovado", "ativo", "pendente", "reprovado", "suspenso", "em_analise"].includes(acao)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const { data: antes } = await admin.from(tabela).select("id, status").eq("id", id).single();
    if (!antes) return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });

    const { error } = await admin
      .from(tabela)
      .update({ status: acao, motivo_pendencia: acao === "pendente" ? motivo || null : null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await logAudit({
      user_id: user.id,
      acao: `${alvo}_${acao}`,
      entidade: tabela,
      entidade_id: id,
      dados_antes: { status: antes.status },
      dados_depois: { status: acao, motivo },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Alvo inválido." }, { status: 400 });
}
