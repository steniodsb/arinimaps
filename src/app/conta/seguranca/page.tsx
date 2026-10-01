import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { lerConfiguracoes } from "@/lib/settings";
import Seguranca from "./Seguranca";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Segurança da conta" };

/**
 * Segurança da própria conta: segundo fator, troca de senha, sessões e o
 * histórico de acessos. Fica fora de /admin e de /painel de propósito — é para
 * onde a pessoa é levada quando o segundo fator é obrigatório e ela ainda não
 * tem um, e não pode depender de já ter passado por essa exigência.
 */
export default async function ContaSeguranca({ searchParams }: PageProps<"/conta/seguranca">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const obrigatorio = (await searchParams).obrigatorio === "1";
  const daEquipe = ["admin_central", "analista_arini"].includes(user.role);

  const [{ data: eventos }, cfg] = await Promise.all([
    supabaseAdmin().from("auth_events")
      .select("id, evento, ip, agente, created_at").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(15),
    lerConfiguracoes(),
  ]);

  return (
    <div className="min-h-screen bg-fundo">
      <div className="px-4 py-4 border-b border-linha flex items-center justify-between">
        <Link href="/" className="font-semibold text-texto">Arini <span className="texto-ouro">Maps</span></Link>
        <Link href={daEquipe ? "/admin" : "/painel"} className="text-sm text-verde hover:underline">
          ← Voltar {daEquipe ? "à Central" : "ao painel"}
        </Link>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Segurança da conta</h1>
          <p className="text-sm text-texto-2">{user.nome} · {user.email}</p>
        </div>
        <Seguranca
          eventos={eventos ?? []}
          obrigatorio={obrigatorio}
          exigidoDaEquipe={daEquipe && cfg.seguranca_mfa_equipe === true}
        />
      </main>
    </div>
  );
}
