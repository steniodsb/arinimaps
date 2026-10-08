import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, Building2, Crown, Handshake, Headset, Map as IconeMapa, Megaphone, Scale, ShieldCheck, Wallet,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setorPorId, type SetorId } from "@/lib/setores";
import Tarefas, { type Membro, type Tarefa } from "./Tarefas";
import { LINK_ACAO } from "./estilos";

/** Peças comuns aos painéis de setor da Matriz. */

/** Ícone de cada setor (o registro em lib/setores guarda só um glifo de texto). */
export const ICONE_SETOR: Record<SetorId, LucideIcon> = {
  operacoes: Building2,
  comercial: Handshake,
  financeiro: Wallet,
  juridico: Scale,
  marketing: Megaphone,
  cartografia: IconeMapa,
  suporte: Headset,
  seguranca: ShieldCheck,
  diretoria: Crown,
};

export type Indicador = {
  rotulo: string; valor: string | number; href?: string; destaque?: boolean; nota?: string;
  /** ícone opcional (lucide) */
  icone?: LucideIcon;
};

/** Números do setor: cartões com borda de acento; em dourado o que pede ação. */
export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {itens.map((i) => {
        const Icone = i.icone;
        const corpo = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className={`lp-display text-[1.9rem] leading-none tabular-nums ${i.destaque ? "text-ouro" : "text-texto"}`}>{i.valor}</p>
              {Icone && (
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${i.destaque ? "bg-ouro/15 text-ouro" : "bg-verde/12 text-verde"}`}>
                  <Icone className="size-[18px]" />
                </span>
              )}
            </div>
            <p className="mt-2.5 text-sm font-medium text-texto-2 leading-snug">{i.rotulo}</p>
            {i.nota && <p className="mt-1 text-xs text-texto-2/80">{i.nota}</p>}
          </>
        );
        const classe = `cartao block border-l-4 p-5 ${i.destaque ? "border-l-ouro" : "border-l-verde"}`;
        return i.href
          ? <Link key={i.rotulo} href={i.href} className={classe + " cartao-link"}>{corpo}</Link>
          : <div key={i.rotulo} className={classe}>{corpo}</div>;
      })}
    </div>
  );
}

/** Topo da página de um setor: ícone, linha "Setor", título grande e descrição. */
export function CabecalhoSetor({ setor, children }: { setor: SetorId; children?: React.ReactNode }) {
  const s = setorPorId(setor)!;
  const Icone = ICONE_SETOR[setor];
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="flex items-start gap-4 min-w-0">
        <span className="hidden sm:grid size-14 shrink-0 place-items-center rounded-2xl bg-verde/12 text-verde">
          <Icone className="size-7" />
        </span>
        <div className="min-w-0 max-w-3xl">
          <p className="lp-eyebrow text-xs">Setor</p>
          <h1 className="lp-display mt-2 text-3xl md:text-[2.5rem] text-texto text-balance">{s.nome}</h1>
          <p className="mt-3 text-base md:text-lg leading-relaxed text-texto-2">{s.descricao}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-3 shrink-0">{children}</div>}
    </header>
  );
}

/** Seção de painel: título no padrão do site e ação à direita. */
export function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="lp-display text-xl md:text-2xl text-texto">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Link de ação de seção ("Todos os imóveis →"). */
export function LinkAcao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={LINK_ACAO}>
      {children}<ArrowRight className="size-4" />
    </Link>
  );
}

/** "hoje" / "há N dias", em alerta a partir de 3 dias de espera. */
const diasDesde = (desde: string) => Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000);
export function Espera({ desde }: { desde: string }) {
  const d = diasDesde(desde);
  return (
    <span className={"text-xs font-medium tabular-nums whitespace-nowrap " + (d >= 3 ? "text-alerta" : "text-texto-2")}>
      {d <= 0 ? "hoje" : `há ${d} dia${d === 1 ? "" : "s"}`}
    </span>
  );
}

/**
 * Conta linhas de uma tabela com um filtro opcional — só o número, sem baixar
 * as linhas. `monta` recebe a consulta do Supabase e devolve ela filtrada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function contar(tabela: string, monta: (q: any) => any = (q) => q): Promise<number> {
  const { count } = await monta(supabaseAdmin().from(tabela).select("*", { count: "exact", head: true }));
  return count ?? 0;
}

/** Equipe ativa (para atribuir tarefa e chamado). */
export async function equipeAtiva(): Promise<Membro[]> {
  const { data } = await supabaseAdmin()
    .from("profiles").select("user_id, nome")
    .in("role", ["admin_central", "analista_arini"]).eq("ativo", true).order("nome");
  return data ?? [];
}

/** Bloco de tarefas de um setor, já com os dados carregados. */
export async function TarefasDoSetor({ setor, souEu }: { setor: SetorId; souEu: string }) {
  const admin = supabaseAdmin();
  const [{ data: tarefas }, equipe] = await Promise.all([
    admin.from("tasks")
      .select("id, titulo, descricao, setor, status, prioridade, prazo, responsavel")
      .eq("setor", setor).neq("status", "cancelada")
      .order("status").order("prazo", { ascending: true, nullsFirst: false }).limit(60),
    equipeAtiva(),
  ]);
  const nome = new Map(equipe.map((m) => [m.user_id, m.nome]));
  const lista: Tarefa[] = (tarefas ?? []).map((t) => ({ ...t, responsavel_nome: t.responsavel ? nome.get(t.responsavel) ?? null : null }));
  return (
    <Secao titulo="Tarefas do setor">
      <Tarefas setor={setor} tarefas={lista} equipe={equipe} souEu={souEu} />
    </Secao>
  );
}

export const dataBR = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
export const dataHoraBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
