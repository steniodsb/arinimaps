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
import { Users, MailOpen, Building, Info } from "lucide-react";
import { Secao, Vazio, Etiqueta, BotaoLink } from "@/components/ui/Pagina";

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
      <div className="max-w-4xl">
        <Secao
          eyebrow="Equipe"
          titulo="Organização"
          subtitulo="Imobiliárias, empresas, holdings, prefeituras e franquias podem ter várias contas sob o mesmo plano."
        >
          {convites.length > 0 ? (
            <div className="cartao flex flex-col gap-4 border-l-4 border-l-ouro p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-3 text-base text-texto">
                <MailOpen className="mt-0.5 size-5 shrink-0 text-ouro" />
                <span>Você tem {convites.length === 1 ? "um convite pendente" : `${convites.length} convites pendentes`}:{" "}
                  <strong>{convites.map((c) => c.org?.nome).join(", ")}</strong>.</span>
              </p>
              <BotaoLink href="/conta" variante="ouro">Responder em Minha conta</BotaoLink>
            </div>
          ) : (
            <Vazio
              icone={Users}
              titulo="Você ainda não faz parte de uma organização"
              texto={<>
                Para cadastrar a sua, fale com a Arini em{" "}
                <Link href="/suporte?assunto=plano:organizacao" className="text-verde hover:underline">Suporte</Link>.
                Se alguém da sua empresa já tem, peça para convidar este e-mail ({user.email}).
              </>}
            />
          )}
        </Secao>
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
    <div className="max-w-4xl space-y-10">
      <div className="cartao flex flex-col gap-5 p-6 md:flex-row md:items-center md:p-7">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-verde/12 text-verde">
          <Building className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="lp-eyebrow text-xs">{TIPO_ORG_LABEL[org.tipo]}{org.cnpj && ` · CNPJ ${org.cnpj}`}</p>
          <h1 className="lp-display mt-2 text-2xl md:text-[1.75rem] text-texto">{org.nome}</h1>
          <p className="mt-2 text-base text-texto-2">
            Você é {PAPEL_ORG_LABEL[membro.papel_org].toLowerCase()} · plano da organização: <strong className="font-semibold text-texto">{plano?.nome ?? "nenhum"}</strong>
            {org.plan_valido_ate && ` (até ${dataBR(org.plan_valido_ate)})`}
            {!org.ativo && " · organização desativada"}
          </p>
          <p className="mt-1.5 text-sm text-texto-2">
            {usaPlanoDaOrg
              ? "Sua conta está usando o plano da organização."
              : plano && plano.escopo !== "organizacao"
                ? "O plano atribuído não é de organização, então cada membro segue no próprio plano."
                : "Sua conta segue no plano pessoal (definido pela Arini), que vale por cima do da organização."}
          </p>
        </div>
        {!org.ativo && <Etiqueta tom="critico">desativada</Etiqueta>}
      </div>

      <Secao titulo="Pessoas" subtitulo={`${(membros ?? []).length} ${(membros ?? []).length === 1 ? "pessoa" : "pessoas"} na organização`}>
        <div className="cartao divide-y divide-linha overflow-hidden">
          {(membros ?? []).map((m) => {
            const p = m.user_id ? perfil.get(m.user_id) : null;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-superficie-2/60">
                <Avatar nome={p?.nome ?? m.email} url={p?.avatar_url} tamanho={40} />
                <span className="min-w-48 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[0.95rem] font-semibold text-texto">
                    {p?.nome ?? m.email}{m.user_id === user.id && <span className="font-normal text-texto-2">(você)</span>}
                    {m.papel_org === "admin" && <Etiqueta tom="verde">{PAPEL_ORG_LABEL[m.papel_org]}</Etiqueta>}
                    {m.status === "pendente" && <Etiqueta tom="alerta">{STATUS_MEMBRO_LABEL.pendente}</Etiqueta>}
                  </span>
                  <span className="mt-0.5 block text-sm text-texto-2">
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
      </Secao>

      <GerirOrganizacao souAdmin={souAdmin} podeConvidar={souAdmin && org.ativo && acesso.recursos.has("multiusuario")} />

      <p className="flex items-start gap-2 text-sm text-texto-2">
        <Info className="mt-0.5 size-4 shrink-0" />
        Cada membro continua vendo só os próprios imóveis e oportunidades. O compartilhamento de carteira dentro da
        organização ainda não está disponível.
      </p>
    </div>
  );
}
