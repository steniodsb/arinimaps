import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { dataBR } from "@/components/admin/Painel";
import Avatar from "@/components/shell/Avatar";
import { PAPEL_ORG_LABEL, STATUS_MEMBRO_LABEL, TIPO_ORG_LABEL } from "@/lib/organizacoes";
import { convitesPendentes, organizacaoDoUsuario } from "@/lib/organizacoes-servidor";
import { acessoDe } from "@/lib/planos-servidor";
import GerirOrganizacao, { AcoesMembro } from "./GerirOrganizacao";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organização" };

/**
 * A organização da conta (5.9). Membro vê nome, plano e colegas; o
 * administrador convida por e-mail, remove e troca o papel — se o plano da
 * organização tiver o recurso "Vários usuários".
 *
 * Compartilhar imóveis e oportunidades entre membros ainda NÃO existe: cada
 * conta continua vendo só o que é dela (próximo passo, docs/PLANOS.md §10).
 */
export default async function PainelOrganizacao() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const [vinculo, convites, acesso] = await Promise.all([
    organizacaoDoUsuario(user.id), convitesPendentes(user.email), acessoDe(user.id),
  ]);

  if (!vinculo) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Organização</h1>
          <p className="text-texto-2 text-sm">
            Imobiliárias, empresas, holdings, prefeituras e franquias podem ter várias contas sob o mesmo plano.
          </p>
        </div>
        {convites.length > 0 ? (
          <div className="cartao p-5 text-sm space-y-2">
            <p className="text-texto">Você tem {convites.length === 1 ? "um convite pendente" : `${convites.length} convites pendentes`}:{" "}
              {convites.map((c) => c.org?.nome).join(", ")}.</p>
            <Link href="/conta" className="text-verde hover:underline">Responder em Minha conta →</Link>
          </div>
        ) : (
          <div className="cartao p-8 text-center text-sm text-texto-2 space-y-2">
            <p>Você ainda não faz parte de uma organização.</p>
            <p>
              Para cadastrar a sua, fale com a Arini em{" "}
              <Link href="/suporte?assunto=plano:organizacao" className="text-verde hover:underline">Suporte</Link>.
              Se alguém da sua empresa já tem, peça para convidar este e-mail ({user.email}).
            </p>
          </div>
        )}
      </div>
    );
  }

  const { org, membro } = vinculo;
  const admin = supabaseAdmin();
  const souAdmin = membro.papel_org === "admin";
  const [{ data: plano }, { data: membros }] = await Promise.all([
    org.plan_id ? admin.from("plans").select("nome, escopo").eq("id", org.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("organization_members")
      .select("id, user_id, email, papel_org, status, convidado_em, aceito_em")
      .eq("org_id", org.id).in("status", souAdmin ? ["ativo", "pendente"] : ["ativo"])
      .order("status").order("convidado_em"),
  ]);
  const ids = (membros ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const { data: perfis } = ids.length
    ? await admin.from("profiles").select("user_id, nome, avatar_url").in("user_id", ids)
    : { data: [] as { user_id: string; nome: string; avatar_url: string | null }[] };
  const perfil = new Map((perfis ?? []).map((p) => [p.user_id, p]));
  const usaPlanoDaOrg = acesso.planId === org.plan_id && !!org.plan_id;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs text-texto-2">{TIPO_ORG_LABEL[org.tipo]}{org.cnpj && ` · CNPJ ${org.cnpj}`}</p>
        <h1 className="text-2xl font-semibold text-texto">{org.nome}</h1>
        <p className="text-sm text-texto-2">
          Você é {PAPEL_ORG_LABEL[membro.papel_org].toLowerCase()} · plano da organização: {plano?.nome ?? "nenhum"}
          {org.plan_valido_ate && ` (até ${dataBR(org.plan_valido_ate)})`}
          {!org.ativo && " · organização desativada"}
        </p>
        <p className="text-xs text-texto-2 mt-1">
          {usaPlanoDaOrg
            ? "Sua conta está usando o plano da organização."
            : plano && plano.escopo !== "organizacao"
              ? "O plano atribuído não é de organização, então cada membro segue no próprio plano."
              : "Sua conta segue no plano pessoal (definido pela Arini), que vale por cima do da organização."}
        </p>
      </div>

      <div className="cartao divide-y divide-linha">
        {(membros ?? []).map((m) => {
          const p = m.user_id ? perfil.get(m.user_id) : null;
          return (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
              <Avatar nome={p?.nome ?? m.email} url={p?.avatar_url} tamanho={32} />
              <span className="flex-1 min-w-48">
                <span className="block text-texto">{p?.nome ?? m.email}{m.user_id === user.id && " (você)"}</span>
                <span className="block text-xs text-texto-2">
                  {souAdmin && `${m.email} · `}{PAPEL_ORG_LABEL[m.papel_org]}
                  {m.status === "pendente" ? ` · ${STATUS_MEMBRO_LABEL.pendente} desde ${dataBR(m.convidado_em)}` : m.aceito_em ? ` · desde ${dataBR(m.aceito_em)}` : ""}
                </span>
              </span>
              {souAdmin && m.user_id !== user.id && (
                <AcoesMembro id={m.id} papel={m.papel_org} pendente={m.status === "pendente"} />
              )}
            </div>
          );
        })}
      </div>

      <GerirOrganizacao souAdmin={souAdmin} podeConvidar={souAdmin && org.ativo && acesso.recursos.has("multiusuario")} />

      <p className="text-xs text-texto-2">
        Cada membro continua vendo só os próprios imóveis e oportunidades. O compartilhamento de carteira dentro da
        organização ainda não está disponível.
      </p>
    </div>
  );
}
