import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { estadoIa } from "@/lib/ia/acesso";

export const dynamic = "force-dynamic";

/** O que o botão do assistente mostra: ligado? sessão? plano? cota? (nunca expõe a chave) */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json(await estadoIa(user?.id ?? null), { headers: { "Cache-Control": "no-store" } });
}
