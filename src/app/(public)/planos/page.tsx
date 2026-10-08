import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Check, CreditCard } from "lucide-react";
import Moldura from "@/components/shell/Moldura";
import { CabecalhoPagina, Conteudo, Vazio } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/planos-servidor";
import { formatBRL } from "@/lib/format";
import {
  COTAS, GRUPO_RECURSO_LABEL, NICHO_LABEL, PERIODICIDADE_LABEL, RECURSOS, type Plano, type Recurso,
} from "@/lib/planos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Planos",
  description: "Planos do Arini Imóveis Brasil por perfil de uso: consulta básica, consulta profissional, anunciante, parceiro e organização.",
};

const GRUPOS = Object.keys(GRUPO_RECURSO_LABEL) as Recurso["grupo"][];

/** Texto do preço: zero com periodicidade paga = ainda sem tabela (fala com a Arini). */
function precoDe(p: Plano) {
  if (p.periodicidade === "gratis") return { valor: "Gratuito", nota: "" };
  if (!Number(p.preco_mensal)) return { valor: "Sob consulta", nota: "fale com a Arini" };
  return { valor: formatBRL(Number(p.preco_mensal)), nota: PERIODICIDADE_LABEL[p.periodicidade] ?? p.periodicidade };
}

/**
 * Página pública dos planos. O que cada plano libera vem do banco (a Diretoria
 * edita em /admin/planos); o nome e o grupo de cada recurso vêm do registro.
 */
export default async function Planos() {
  const [{ data: planosRaw }, user, { acesso }] = await Promise.all([
    supabaseAdmin().from("plans").select("*").eq("ativo", true).order("ordem").order("id"),
    currentUser(),
    acessoAtual(),
  ]);
  const planos = (planosRaw ?? []) as Plano[];

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  return (
    <Moldura usuario={usuario} site>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Planos e acesso"
        titulo="Um plano para cada"
        destaque="perfil de uso"
        subtitulo="Cada plano é pensado para um perfil de uso: quem só consulta, quem compra, quem anuncia o próprio imóvel, o profissional que precisa cruzar a área com as fontes oficiais e a organização com vários usuários."
      >
        <div className="max-w-3xl space-y-3">
          <p className="text-base leading-relaxed text-texto-2">
            Ao criar a conta você recebe o plano do seu perfil; a equipe da Arini pode mudar o plano de
            uma conta a qualquer momento. A mensalidade por anúncio publicado é cobrada à parte, por imóvel.
          </p>
          {acesso.planNome && (
            <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-linha bg-superficie/70 px-4 py-3 text-[15px] text-texto backdrop-blur">
              <BadgeCheck className="size-5 text-verde" />
              Seu plano atual: <strong>{acesso.planNome}</strong>
              {acesso.nicho && <span className="text-texto-2"> · perfil {NICHO_LABEL[acesso.nicho] ?? acesso.nicho}</span>}
              {acesso.vencido && <span className="text-alerta"> · vencido — vale o acesso básico</span>}
            </p>
          )}
        </div>
      </CabecalhoPagina>

      <Conteudo className="space-y-10 py-12 md:py-16">
        {!planos.length ? (
          <Vazio icone={CreditCard} titulo="Nenhum plano publicado ainda." />
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
            {planos.map((p) => {
              const atual = !acesso.equipe && acesso.planId === p.id && !acesso.vencido;
              const preco = precoDe(p);
              const recursos = new Set(p.recursos);
              const cotas = COTAS.filter((c) => p.cotas?.[c.id] != null);
              return (
                <article key={p.id}
                  className={"cartao relative flex flex-col gap-6 p-6 md:p-7 " + (p.destaque ? "!border-ouro/60 ring-1 ring-ouro/40 shadow-xl" : "")}>
                  {(p.destaque || atual) && (
                    <div className="absolute -top-3 left-6 flex gap-2">
                      {p.destaque && <span className="rounded-md bg-ouro px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#06140D]">Mais completo</span>}
                      {atual && <span className="rounded-md bg-verde px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#06140D]">Seu plano</span>}
                    </div>
                  )}
                  <div className="space-y-2 pt-1">
                    <h2 className="lp-display text-2xl text-texto">{p.nome}</h2>
                    <p className="text-[15px] leading-relaxed text-texto-2">{p.descricao}</p>
                  </div>
                  <div className="border-y border-linha py-5">
                    <p className={"lp-display text-4xl " + (p.destaque ? "text-ouro" : "text-texto")}>{preco.valor}</p>
                    {preco.nota && <p className="mt-1.5 text-sm text-texto-2">{preco.nota}</p>}
                    {p.escopo === "organizacao" && <p className="mt-1 text-sm text-texto-2">Por organização.</p>}
                  </div>

                  <div className="flex-1 space-y-5">
                    {GRUPOS.map((g) => {
                      const itens = RECURSOS.filter((r) => r.grupo === g && recursos.has(r.id));
                      if (!itens.length) return null;
                      return (
                        <div key={g}>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-texto-2">{GRUPO_RECURSO_LABEL[g]}</p>
                          <ul className="space-y-2 text-[15px]">
                            {itens.map((r) => (
                              <li key={r.id} className="flex items-start gap-2.5">
                                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-verde/15 text-verde">
                                  <Check className="size-3.5" strokeWidth={3} />
                                </span>
                                <span className="text-texto">
                                  {r.nome}
                                  {r.reservado && <span className="ml-1.5 text-xs text-texto-2">(em breve)</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {cotas.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-texto-2">Limites</p>
                        <ul className="divide-y divide-linha rounded-xl border border-linha text-[15px]">
                          {cotas.map((c) => (
                            <li key={c.id} className="flex justify-between gap-3 px-4 py-2.5 text-texto-2">
                              <span>{c.nome}</span>
                              <span className="font-semibold tabular-nums text-texto">{p.cotas[c.id]}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {atual ? (
                    <span className="lp-btn lp-btn-contorno w-full cursor-default opacity-70">Plano atual</span>
                  ) : (
                    <Link href={`/suporte?assunto=${encodeURIComponent(`plano:${p.id}`)}`}
                      className={"lp-btn w-full " + (p.destaque ? "lp-btn-ouro" : "lp-btn-verde")}>
                      Falar com a Arini <ArrowRight />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="text-sm text-texto-2">
          Os valores e limites podem mudar; o que vale é o plano registrado na sua conta. Dúvidas em{" "}
          <Link href="/suporte" className="font-semibold text-verde hover:underline">Suporte</Link>.
        </p>
      </Conteudo>
    </Moldura>
  );
}
