import { NextResponse } from "next/server";
import { ator, temSetor } from "@/lib/authz";
import { chamadosEsperandoEquipe, marcarVisto } from "@/lib/suporte";

/**
 * Selo do menu "Chamados" (10.2): quantos chamados em aberto têm a última
 * mensagem do cliente. O menu da Central consulta a cada 30 s — e isso também
 * é o que mantém o "atendente online" aceso para quem está do outro lado.
 */
export async function GET() {
  const a = await ator();
  if (!a || !temSetor(a, "suporte")) return NextResponse.json({ error: "Restrito ao setor de Suporte." }, { status: 403 });
  const [ids] = await Promise.all([chamadosEsperandoEquipe(), marcarVisto(a.userId)]);
  return NextResponse.json({ aguardando: ids.length, ids }, { headers: { "Cache-Control": "private, no-store" } });
}
