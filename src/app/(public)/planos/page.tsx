import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
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
    <AppShell usuario={usuario}>
      <div className="max-w-6xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-texto">Planos</h1>
          <p className="text-sm text-texto-2 max-w-3xl">
            Cada plano é pensado para um perfil de uso: quem só consulta, quem compra, quem anuncia o próprio
            imóvel, o profissional que precisa cruzar a área com as fontes oficiais e a organização com vários
            usuários. Ao criar a conta você recebe o plano do seu perfil; a equipe da Arini pode mudar o plano de
            uma conta a qualquer momento. A mensalidade por anúncio publicado é cobrada à parte, por imóvel.
          </p>
          {acesso.planNome && (
            <p className="text-sm text-texto">
              Seu plano atual: <strong>{acesso.planNome}</strong>
              {acesso.nicho && <span className="text-texto-2"> · perfil {NICHO_LABEL[acesso.nicho] ?? acesso.nicho}</span>}
              {acesso.vencido && <span className="text-alerta"> · vencido — vale o acesso básico</span>}
            </p>
          )}
        </div>

        {!planos.length ? (
          <div className="cartao p-10 text-center text-sm text-texto-2">Nenhum plano publicado ainda.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {planos.map((p) => {
              const atual = !acesso.equipe && acesso.planId === p.id && !acesso.vencido;
              const preco = precoDe(p);
              const recursos = new Set(p.recursos);
              const cotas = COTAS.filter((c) => p.cotas?.[c.id] != null);
              return (
                <article key={p.id}
                  className={"cartao p-5 flex flex-col gap-4 relative " + (p.destaque ? "border-ouro/60 shadow-lg" : "")}>
                  {(p.destaque || atual) && (
                    <div className="absolute -top-3 left-5 flex gap-2">
                      {p.destaque && <span className="rounded-full bg-ouro text-[#06140D] text-[10px] font-semibold uppercase tracking-wide px-3 py-1">Mais completo</span>}
                      {atual && <span className="rounded-full bg-verde text-[#06140D] text-[10px] font-semibold uppercase tracking-wide px-3 py-1">Seu plano</span>}
                    </div>
                  )}
                  <div className="space-y-1 pt-1">
                    <h2 className="text-lg font-semibold text-texto">{p.nome}</h2>
                    <p className="text-sm text-texto-2">{p.descricao}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-texto">{preco.valor}</p>
                    {preco.nota && <p className="text-xs text-texto-2">{preco.nota}</p>}
                    {p.escopo === "organizacao" && <p className="text-xs text-texto-2 mt-1">Por organização.</p>}
                  </div>

                  <div className="space-y-3 flex-1">
                    {GRUPOS.map((g) => {
                      const itens = RECURSOS.filter((r) => r.grupo === g && recursos.has(r.id));
                      if (!itens.length) return null;
                      return (
                        <div key={g}>
                          <p className="text-[10px] uppercase tracking-wide text-texto-2 font-semibold mb-1">{GRUPO_RECURSO_LABEL[g]}</p>
                          <ul className="space-y-1 text-sm">
                            {itens.map((r) => (
                              <li key={r.id} className="flex gap-2 items-start">
                                <span className="text-verde shrink-0">✓</span>
                                <span className="text-texto">
                                  {r.nome}
                                  {r.reservado && <span className="ml-1 text-[10px] text-texto-2">(em breve)</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {cotas.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-texto-2 font-semibold mb-1">Limites</p>
                        <ul className="space-y-1 text-sm">
                          {cotas.map((c) => (
                            <li key={c.id} className="flex justify-between gap-3 text-texto-2">
                              <span>{c.nome}</span>
                              <span className="text-texto tabular-nums">{p.cotas[c.id]}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {atual ? (
                    <span className="btn-contorno text-center py-2.5 text-sm opacity-70 cursor-default">Plano atual</span>
                  ) : (
                    <Link href={`/suporte?assunto=${encodeURIComponent(`plano:${p.id}`)}`}
                      className={(p.destaque ? "btn-ouro" : "btn-verde") + " text-center py-2.5 text-sm"}>
                      Falar com a Arini
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="text-xs text-texto-2">
          Os valores e limites podem mudar; o que vale é o plano registrado na sua conta. Dúvidas em{" "}
          <Link href="/suporte" className="text-verde underline">Suporte</Link>.
        </p>
      </div>
    </AppShell>
  );
}
