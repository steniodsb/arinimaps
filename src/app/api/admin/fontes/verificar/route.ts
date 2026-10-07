import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, temSetor } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
// o mesmo módulo que o worker roda a cada 6 h — uma regra só para "fonte no ar"
import { sondarFontes } from "../../../../../../worker/jobs/sondaFonte.mjs";

export const maxDuration = 60;

/**
 * "Verificar agora" de /admin/fontes (PENDENCIAS 3.16): sonda cada fonte ativa
 * com um envelope de ~2 km, grava disponibilidade e latência em fontes_saude e
 * recalcula a situação (3 falhas seguidas → instável).
 */
export async function POST() {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia", "seguranca")) {
    return falha(403, "sem_permissao", "Restrito aos setores de Cartografia e dados e de Segurança.", {
      solucao: "Peça à diretoria para incluir você em um desses setores.",
    });
  }
  const admin = supabaseAdmin();
  const { data: fontes, error } = await admin.from("fontes_externas")
    .select("id, sonda_url").eq("ativa", true).not("sonda_url", "is", null).order("prioridade");
  if (error) return falhaBanco("fontes_leitura", error);

  const resultados = await sondarFontes(fontes ?? []);
  const situacoes: Record<string, string | null> = {};
  for (const r of resultados) {
    const { data } = await admin.rpc("fn_fonte_saude_registrar", {
      p_fonte: r.fonte_id, p_ok: r.ok, p_status: r.status_http, p_ms: r.ms, p_erro: r.erro, p_origem: "manual",
    });
    situacoes[r.fonte_id] = (data as string | null) ?? null;
  }

  const fora = resultados.filter((r) => !r.ok);
  await logAudit({
    user_id: a.userId, acao: "fontes_verificadas", entidade: "fontes_externas",
    dados_depois: { total: resultados.length, fora: fora.map((f) => ({ id: f.fonte_id, erro: f.erro })) },
  });
  return NextResponse.json({
    ok: true,
    total: resultados.length,
    no_ar: resultados.length - fora.length,
    resultados: resultados.map((r) => ({ ...r, situacao: situacoes[r.fonte_id] })),
  });
}
