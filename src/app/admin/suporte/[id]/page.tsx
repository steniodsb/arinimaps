import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { dataHoraBR, equipeAtiva } from "@/components/admin/Painel";
import Atendimento from "./Atendimento";
import Conversa from "./Conversa";

const CATEGORIA: Record<string, string> = {
  duvida: "Dúvida", problema: "Problema no sistema", anuncio: "Meu anúncio", financeiro: "Cobrança", outro: "Outro",
};

export default async function ChamadoAdmin({ params }: PageProps<"/admin/suporte/[id]">) {
  await exigirSetor("suporte");
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: c }, { data: mensagens }, equipe] = await Promise.all([
    admin.from("support_tickets")
      .select("id, codigo, nome, email, telefone, categoria, assunto, status, prioridade, responsavel, user_id, created_at")
      .eq("id", id).maybeSingle(),
    admin.from("support_messages").select("id, autor_nome, da_equipe, interno, corpo, created_at").eq("ticket_id", id).order("created_at"),
    equipeAtiva(),
  ]);
  if (!c) notFound();

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <Link href="/admin/suporte" className="text-xs text-verde hover:underline">← Chamados</Link>
        <p className="font-mono text-xs text-texto-2 mt-2">{c.codigo} · {CATEGORIA[c.categoria] ?? c.categoria}</p>
        <h1 className="text-2xl font-semibold text-texto">{c.assunto}</h1>
        <p className="text-sm text-texto-2">
          {c.nome} · {c.email}{c.telefone && ` · ${c.telefone}`} · aberto em {dataHoraBR(c.created_at)}
          {c.user_id ? " · tem conta no sistema" : " · visitante sem conta"}
        </p>
      </div>

      {/* 10.2: a conversa atualiza sozinha (polling de 5 s) */}
      <Conversa id={c.id} inicial={mensagens ?? []} temConta={!!c.user_id} />

      <Atendimento
        id={c.id} situacao={c.status} prioridade={c.prioridade} responsavel={c.responsavel ?? ""}
        equipe={equipe} semConta={!c.user_id}
      />
    </div>
  );
}
