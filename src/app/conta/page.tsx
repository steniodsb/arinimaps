import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { normalizar } from "@/lib/preferencias";
import { TIPO_ORG_LABEL, PAPEL_ORG_LABEL, type TipoOrg } from "@/lib/organizacoes";
import { convitesPendentes, organizacaoDoUsuario } from "@/lib/organizacoes-servidor";
import { acessoDe } from "@/lib/planos-servidor";
import BotaoTema from "@/components/shell/BotaoTema";
import Conta from "./Conta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta" };

/**
 * Minha conta (4.6 + 5.10): nome, telefone, foto do perfil, preferências que
 * acompanham a pessoa em qualquer aparelho e convites de organização (5.9).
 * Vale para todo mundo — equipe, parceiro e cliente —, por isso fica fora de
 * /painel e de /admin, como /conta/seguranca.
 */
export default async function MinhaConta() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const daEquipe = ["admin_central", "analista_arini"].includes(user.role);

  const [{ data: perfil }, vinculo, convites, acesso] = await Promise.all([
    supabaseAdmin().from("profiles").select("nome, telefone, avatar_url, preferencias").eq("user_id", user.id).single(),
    organizacaoDoUsuario(user.id),
    convitesPendentes(user.email),
    acessoDe(user.id),
  ]);

  return (
    <div className="min-h-screen bg-fundo">
      <div className="px-4 py-3 border-b border-linha flex items-center justify-between gap-3">
        <Link href="/" className="font-semibold text-texto">Arini <span className="texto-ouro">Maps</span></Link>
        <div className="flex items-center gap-2">
          <BotaoTema />
          <Link href={daEquipe ? "/admin" : "/painel"} className="text-sm text-verde hover:underline">
            ← Voltar {daEquipe ? "à Central" : "ao painel"}
          </Link>
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Minha conta</h1>
          <p className="text-sm text-texto-2">
            {user.email} · plano {acesso.planNome ?? "—"}
            {vinculo && ` · ${vinculo.org.nome}`}
          </p>
        </div>

        <Conta
          inicial={{
            nome: perfil?.nome ?? "",
            telefone: perfil?.telefone ?? "",
            avatar: perfil?.avatar_url ?? null,
            preferencias: normalizar(perfil?.preferencias),
          }}
          convites={convites.map((c) => ({
            id: c.id, org: c.org?.nome ?? "Organização", tipo: TIPO_ORG_LABEL[c.org?.tipo as TipoOrg] ?? "",
            papel: PAPEL_ORG_LABEL[c.papel_org] ?? c.papel_org, emOutra: !!vinculo,
          }))}
        />

        <section className="cartao p-5 space-y-2 text-sm">
          <h2 className="font-semibold text-texto">Mais da conta</h2>
          <ul className="space-y-1.5">
            <li><Link href="/conta/seguranca" className="text-verde hover:underline">Segurança da conta</Link>
              <span className="text-texto-2"> — senha, segundo fator e histórico de acessos</span></li>
            {!daEquipe && (
              <li><Link href="/painel/organizacao" className="text-verde hover:underline">Organização</Link>
                <span className="text-texto-2"> — {vinculo ? `${vinculo.org.nome} (${PAPEL_ORG_LABEL[vinculo.membro.papel_org]})` : "você ainda não faz parte de uma"}</span></li>
            )}
            <li><Link href="/planos" className="text-verde hover:underline">Planos</Link>
              <span className="text-texto-2"> — o que o seu plano libera</span></li>
            <li><Link href="/suporte" className="text-verde hover:underline">Suporte</Link>
              <span className="text-texto-2"> — fale com a equipe; dados pessoais (LGPD) também por lá</span></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
