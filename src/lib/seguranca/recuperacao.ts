import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { registrarAlerta } from "./alertas";
import { ipDoPedido, limitar, respostaLimite } from "./limite";

/**
 * Recuperação reforçada para contas da equipe (item 6.7; requisito 5:
 * "validação adicional para recuperação de contas de maior privilégio").
 *
 * O link de recuperação prova só que a pessoa abriu o e-mail. Para Diretoria
 * e Equipe isso não basta:
 *  · com segundo fator ativo → a senha só muda depois do código do
 *    aplicativo autenticador (sessão aal2);
 *  · sem segundo fator → segunda etapa: código de 6 dígitos enviado ao
 *    e-mail, válido por 15 min, 5 tentativas.
 * Em qualquer caso: registro na auditoria, alerta em Segurança e aviso por
 * e-mail aos outros membros da Diretoria.
 *
 * Sem serviço de e-mail (RESEND_API_KEY) o código não tem como chegar: a troca
 * segue SEM a segunda etapa, mas com alerta de severidade alta e a auditoria
 * marcada "sem_segunda_etapa" — trancar a Diretoria fora da própria conta seria
 * pior. Com o e-mail configurado (item 3.2), a etapa passa a valer sozinha.
 */
export const PAPEIS_EQUIPE = ["admin_central", "analista_arini"];
const VALIDADE_MIN = 15;
const MAX_TENTATIVAS = 5;

function hashCodigo(userId: string, codigo: string) {
  const pimenta = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "arini";
  return createHmac("sha256", pimenta).update(`recuperacao:${userId}:${codigo}`).digest("hex");
}

/** Sessão aberta por senha (e não por link de recuperação)? */
export async function sessaoPorSenha(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.auth.getClaims();
    const amr = (data?.claims?.amr ?? []) as ({ method?: string } | string)[];
    const metodos = amr.map((m) => (typeof m === "string" ? m : m.method ?? ""));
    if (metodos.some((m) => ["otp", "recovery", "magiclink", "email"].includes(m))) return false;
    return metodos.includes("password");
  } catch {
    return false;
  }
}

export type Etapa =
  | { ok: true; equipe: false }
  | { ok: true; equipe: true; via: "mfa" | "codigo_email" | "sem_segunda_etapa"; papel: string; nome: string }
  | { ok: false; resposta: NextResponse };

/** Confere a etapa extra da recuperação. Para contas fora da equipe, passa direto. */
export async function segundaEtapaRecuperacao(
  supabase: SupabaseClient, user: User, codigo: string | null
): Promise<Etapa> {
  const admin = supabaseAdmin();
  const { data: perfil } = await admin.from("profiles").select("role, nome").eq("user_id", user.id).maybeSingle();
  if (!perfil || !PAPEIS_EQUIPE.includes(perfil.role)) return { ok: true, equipe: false };
  const base = { ok: true as const, equipe: true as const, papel: perfil.role as string, nome: (perfil.nome as string) ?? "" };

  // 1) conta com segundo fator: exige a sessão confirmada pelo aplicativo
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2") {
    if (aal.currentLevel === "aal2") return { ...base, via: "mfa" };
    return {
      ok: false,
      resposta: NextResponse.json({
        error: "Conta da equipe: confirme o código do aplicativo autenticador para criar a senha nova.",
        codigo: "mfa_necessario",
      }, { status: 403 }),
    };
  }

  // 2) sem segundo fator e sem serviço de e-mail: segue, com alerta alto
  if (!process.env.RESEND_API_KEY) return { ...base, via: "sem_segunda_etapa" };

  // 3) sem segundo fator: código de 6 dígitos no e-mail
  if (!codigo) {
    const l = await limitar(`recuperacao-codigo:${user.id}`, 5, 3600);
    if (!l.permitido) return { ok: false, resposta: respostaLimite(l, "envio de código") };
    const novo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await admin.from("recuperacao_codigos").upsert({
      user_id: user.id, codigo_hash: hashCodigo(user.id, novo),
      expira_em: new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString(), tentativas: 0,
      created_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    await sendEmail(user.email, "Código de confirmação — Arini Maps",
      `Seu código para concluir a redefinição de senha é: ${novo}\n\n` +
      `Ele vale por ${VALIDADE_MIN} minutos. Contas da equipe da Arini precisam desta confirmação extra.\n\n` +
      "Se não foi você que pediu, NÃO informe o código a ninguém e avise a diretoria: alguém pode estar tentando entrar na sua conta.");
    return {
      ok: false,
      resposta: NextResponse.json({
        error: "Conta da equipe: enviamos um código de 6 dígitos para o seu e-mail. Digite-o para concluir.",
        codigo: "codigo_email_necessario",
      }, { status: 403 }),
    };
  }

  const { data: reg } = await admin.from("recuperacao_codigos").select("*").eq("user_id", user.id).maybeSingle();
  const invalido = (msg: string) => ({
    ok: false as const,
    resposta: NextResponse.json({ error: msg, codigo: "codigo_email_invalido" }, { status: 400 }),
  });
  if (!reg || new Date(reg.expira_em).getTime() < Date.now()) {
    return invalido("O código expirou. Envie o formulário sem código para receber outro.");
  }
  if (reg.tentativas >= MAX_TENTATIVAS) {
    return invalido("Código errado vezes demais. Envie o formulário sem código para receber outro.");
  }
  const esperado = Buffer.from(reg.codigo_hash, "hex");
  const recebido = Buffer.from(hashCodigo(user.id, codigo.replace(/\D/g, "")), "hex");
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    await admin.from("recuperacao_codigos").update({ tentativas: reg.tentativas + 1 }).eq("user_id", user.id);
    return invalido("Código incorreto. Confira o e-mail e tente de novo.");
  }
  await admin.from("recuperacao_codigos").delete().eq("user_id", user.id);
  return { ...base, via: "codigo_email" };
}

/** Depois da troca: auditoria, alerta e aviso aos outros membros da Diretoria. Nunca lança. */
export async function avisarRecuperacaoEquipe(
  request: Request, user: User, etapa: Extract<Etapa, { equipe: true }>
) {
  try {
    const admin = supabaseAdmin();
    const ip = ipDoPedido(request);
    await logAudit({
      user_id: user.id, acao: "senha_recuperada_equipe", entidade: "auth.users", entidade_id: user.id,
      dados_depois: { via: etapa.via, ip, papel: etapa.papel },
    });
    // e-mail dos outros membros da diretoria
    const { data: diretoria } = await admin.from("profiles").select("user_id")
      .eq("role", "admin_central").eq("ativo", true).neq("user_id", user.id);
    const copias: string[] = [];
    for (const d of diretoria ?? []) {
      const { data } = await admin.auth.admin.getUserById(d.user_id);
      if (data?.user?.email) copias.push(data.user.email);
    }
    const quem = etapa.nome || user.email || "membro da equipe";
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await registrarAlerta({
      tipo: "recuperacao_equipe", severidade: etapa.via === "sem_segunda_etapa" ? "alta" : "media",
      userId: user.id, email: user.email, request,
      detalhe: { via: etapa.via, papel: etapa.papel, nome: etapa.nome },
      aviso: [`Senha da equipe redefinida: ${quem} — Arini Maps`,
        `A senha da conta de ${quem} (${user.email}) foi redefinida pelo link de recuperação em ${quando}, a partir do endereço ${ip}.\n\n` +
        `Confirmação extra: ${etapa.via === "mfa" ? "código do aplicativo autenticador" : etapa.via === "codigo_email" ? "código enviado ao e-mail" : "nenhuma (serviço de e-mail ausente)"}.\n\n` +
        "Se a pessoa não confirmar que foi ela, desative a conta em Equipe e usuários e siga o plano de resposta a incidentes (docs/INCIDENTES.md)."],
      copias,
      sempre: true,
    });
  } catch (e) {
    console.error("avisarRecuperacaoEquipe falhou:", e);
  }
}
