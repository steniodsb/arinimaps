import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator, temSetor } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { logAudit } from "@/lib/audit";
import { registrarTentativa } from "@/lib/planos-servidor";
import { carregarRevisao } from "@/lib/seguranca/revisao";

/**
 * "Marcar revisão concluída" (item 6.13). Guarda quem revisou, quando, as
 * observações e uma foto do que foi revisado (contagens e quem estava na
 * equipe) — a lista em si continua no banco, a foto serve de prova da data.
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a) return falha(401, "sem_sessao", "Sessão expirada.");
  if (!temSetor(a, "seguranca", "diretoria")) {
    await registrarTentativa({ request, userId: a.userId, role: a.role, recurso: "setor:seguranca", motivo: "sem_setor" });
    return falha(403, "sem_setor", "A revisão de acessos é dos setores de Segurança e Diretoria.");
  }
  const b = await request.json().catch(() => ({}));
  const observacoes = typeof b?.observacoes === "string" ? b.observacoes.trim().slice(0, 4000) : "";

  const r = await carregarRevisao();
  const resumo = {
    equipe: r.equipe.map((m) => ({ user_id: m.user_id, nome: m.nome, role: m.role, setores: m.setores, mfa: m.mfa, ativo: m.ativo })),
    contas_plano_especial: r.planosEspeciais.length,
    parceiros_com_territorio: r.parceiros.length,
    equipe_sem_mfa: r.equipe.filter((m) => m.ativo && !m.mfa).length,
  };
  const { data, error } = await supabaseAdmin().from("revisoes_acesso")
    .insert({ revisado_por: a.userId, observacoes: observacoes || null, resumo }).select("id, created_at").single();
  if (error) return falha(500, "falha_banco", "Não foi possível registrar a revisão.", { motivo: error.message });
  await logAudit({ user_id: a.userId, acao: "revisao_acessos", entidade: "revisoes_acesso", entidade_id: data.id, dados_depois: { observacoes, equipe: resumo.equipe.length } });
  return NextResponse.json({ ok: true, id: data.id, em: data.created_at });
}
