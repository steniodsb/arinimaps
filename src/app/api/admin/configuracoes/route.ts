import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";

const CHAVES_PERMITIDAS = [
  "mensalidade_valor_padrao", "comissao_percentual_padrao", "notify_email",
  "suspensao_dias", "poi_raio_rural_m", "poi_raio_urbano_m", "poi_categorias",
];

export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") return NextResponse.json({ error: "Restrito à diretoria." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();
  for (const [chave, valor] of Object.entries(body ?? {})) {
    if (!CHAVES_PERMITIDAS.includes(chave)) continue;
    await admin.from("settings").upsert({ chave, valor: valor as never, updated_at: new Date().toISOString() });
  }
  await logAudit({ user_id: a.userId, acao: "configuracoes_alteradas", entidade: "settings", dados_depois: body });
  return NextResponse.json({ ok: true });
}
