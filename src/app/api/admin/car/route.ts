import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { importarCarTodos } from "@/lib/geo/car";

export const maxDuration = 300;

/** Atualiza a malha do CAR de todos os municípios cadastrados a partir do SICAR. */
export async function POST() {
  const a = await ator();
  if (!a?.ehArini) {
    return falha(403, "sem_permissao", "Restrito à equipe da Arini.", {
      solucao: "Entre com uma conta da Arini para atualizar o CAR.",
    });
  }
  const admin = supabaseAdmin();
  const resultados = await importarCarTodos(admin);
  await logAudit({
    user_id: a.userId, acao: "car_atualizado", entidade: "car_imoveis",
    dados_depois: { resultados },
  });
  return NextResponse.json({ ok: true, resultados });
}

/** Quantos imóveis do CAR há por município e quando foi a última importação. */
export async function GET() {
  const a = await ator();
  if (!a?.ehArini) return falha(403, "sem_permissao", "Restrito à equipe da Arini.", {});
  const { data, error } = await supabaseAdmin().rpc("fn_car_resumo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ municipios: data ?? [] });
}
