import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import FormSuporte from "./FormSuporte";
import MeusChamados, { type Chamado } from "./MeusChamados";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Suporte",
  description: "Fale com a equipe do Arini Maps: dúvidas, problemas, anúncios, cobrança e dados pessoais.",
};

export default async function Suporte({ searchParams }: PageProps<"/suporte">) {
  const [user, sp] = await Promise.all([currentUser(), searchParams]);
  const admin = supabaseAdmin();

  // veio de /planos ("Falar com a Arini"): assunto já preenchido com o plano
  let assuntoInicial = "";
  const assuntoParam = typeof sp.assunto === "string" ? sp.assunto : "";
  const planoPedido = /^plano:([a-z][a-z0-9_]{2,40})$/.exec(assuntoParam)?.[1];
  if (planoPedido) {
    const { data: plano } = await admin.from("plans").select("nome").eq("id", planoPedido).maybeSingle();
    assuntoInicial = `Quero contratar o plano ${plano?.nome ?? planoPedido}`;
  } else if (assuntoParam) {
    assuntoInicial = assuntoParam.slice(0, 120);
  }

  let chamados: Chamado[] = [];
  if (user) {
    const { data: tickets } = await admin.from("support_tickets")
      .select("id, codigo, assunto, status, created_at, updated_at")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30);
    const ids = (tickets ?? []).map((t) => t.id);
    const { data: msgs } = ids.length
      ? await admin.from("support_messages")
          .select("id, ticket_id, autor_nome, da_equipe, corpo, created_at")
          .in("ticket_id", ids).eq("interno", false).order("created_at")
      : { data: [] };
    chamados = (tickets ?? []).map((t) => ({ ...t, mensagens: (msgs ?? []).filter((m) => m.ticket_id === t.id) }));
  }

  return (
    <div className="min-h-screen bg-fundo">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div className="space-y-2">
          <p className="text-sm text-verde font-medium">Suporte</p>
          <h1 className="text-3xl font-semibold text-texto">Como podemos ajudar?</h1>
          <p className="text-texto-2">
            Escreva para a equipe. Respondemos por e-mail em horário comercial
            {user ? ", e a conversa continua aqui embaixo, ao vivo: quando a equipe responde, a mensagem aparece sem recarregar." : ". Com uma conta, a conversa também acontece nesta página, ao vivo."}
          </p>
        </div>

        <FormSuporte nome={user?.nome ?? ""} email={user?.email ?? ""} logado={!!user} assuntoInicial={assuntoInicial} />

        {user && <MeusChamados chamados={chamados} />}
      </main>
    </div>
  );
}
