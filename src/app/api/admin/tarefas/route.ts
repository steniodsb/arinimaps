import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, temSetor } from "@/lib/authz";
import { SETOR_IDS, type SetorId } from "@/lib/setores";

const STATUS = ["aberta", "andamento", "concluida", "cancelada"];
const PRIORIDADES = ["baixa", "normal", "alta"];

/** Tarefas internas por setor. Cada membro só mexe nas tarefas dos setores em que atua. */
export async function POST(request: Request) {
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Restrito à equipe da Arini." }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const setor = String(b.setor ?? "") as SetorId;
  if (!SETOR_IDS.includes(setor) || !temSetor(a, setor)) {
    return NextResponse.json({ error: "Você não atua neste setor." }, { status: 403 });
  }
  const titulo = String(b.titulo ?? "").trim();
  if (titulo.length < 3) return NextResponse.json({ error: "Descreva a tarefa em pelo menos 3 letras." }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("tasks").insert({
    titulo: titulo.slice(0, 200),
    descricao: b.descricao ? String(b.descricao).slice(0, 4000) : null,
    setor,
    responsavel: b.responsavel || null,
    criado_por: a.userId,
    prazo: b.prazo || null,
    prioridade: PRIORIDADES.includes(b.prioridade) ? b.prioridade : "normal",
    property_id: b.property_id || null,
    opportunity_id: b.opportunity_id || null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({ user_id: a.userId, acao: "tarefa_criada", entidade: "tasks", entidade_id: data.id, dados_depois: { setor, titulo } });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const a = await ator();
  if (!a?.ehArini) return NextResponse.json({ error: "Restrito à equipe da Arini." }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("tasks").select("setor, status, responsavel").eq("id", b.id).single();
  if (!antes) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  if (!temSetor(a, antes.setor as SetorId)) {
    return NextResponse.json({ error: "Esta tarefa é de um setor em que você não atua." }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    patch.status = b.status;
    patch.concluida_em = b.status === "concluida" ? new Date().toISOString() : null;
  }
  if (b.responsavel !== undefined) patch.responsavel = b.responsavel || null;
  if (b.prazo !== undefined) patch.prazo = b.prazo || null;
  if (b.prioridade !== undefined && PRIORIDADES.includes(b.prioridade)) patch.prioridade = b.prioridade;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });

  const { error } = await admin.from("tasks").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit({ user_id: a.userId, acao: "tarefa_alterada", entidade: "tasks", entidade_id: b.id, dados_antes: antes, dados_depois: patch });
  return NextResponse.json({ ok: true });
}
