import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { cotacaoDolar, custoUsd, iaConfigurada, modeloIa, PRECOS_USD_POR_MTOK } from "@/lib/ia/config";
import { Indicadores } from "@/components/admin/Painel";
import { CabecalhoPagina, Etiqueta, Secao, Vazio } from "@/components/ui/Pagina";
import { Bot, BookOpen, MessagesSquare, Wrench } from "lucide-react";
import ArtigosAdmin from "./ArtigosAdmin";
import type { Artigo } from "@/lib/ia/conhecimento";

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "artigos", rotulo: "Base de conhecimento", icone: BookOpen },
  { id: "conversas", rotulo: "Conversas do assistente", icone: MessagesSquare },
] as const;

const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const n = (v: number) => v.toLocaleString("pt-BR");
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Conhecimento e IA (PENDÊNCIAS 5.1 e 5.2): artigos que o assistente consulta,
 * com fonte, data e versões; e as conversas, com tokens e custo estimado.
 * Setores Marketing e Diretoria.
 */
export default async function ConhecimentoIA({ searchParams }: PageProps<"/admin/conhecimento">) {
  await exigirSetor("marketing");
  const sp = await searchParams;
  const aba = sp.aba === "conversas" ? "conversas" : "artigos";
  const conversaSel = typeof sp.conversa === "string" ? sp.conversa : null;
  const admin = supabaseAdmin();

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Marketing · Diretoria"
        titulo="Conhecimento e IA"
        subtitulo={<>
          O assistente do site só responde sobre regras e processos a partir dos artigos <strong className="text-texto">publicados</strong> aqui,
          citando fonte e data. Cada alteração gera uma versão.
        </>}
        acoes={
          <Etiqueta quebra tom={iaConfigurada() ? "verde" : "alerta"} className="!px-3.5 !py-2 !text-sm">
            <Bot className="size-4" />
            {iaConfigurada() ? `Assistente ligado · ${modeloIa()}` : "Assistente em configuração (sem ANTHROPIC_API_KEY)"}
          </Etiqueta>
        }
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-linha" aria-label="Abas">
        {ABAS.map((a) => {
          const Icone = a.icone;
          const ativa = aba === a.id;
          return (
            <Link key={a.id} href={`/admin/conhecimento?aba=${a.id}`} aria-current={ativa ? "page" : undefined}
              className={"-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[0.95rem] font-semibold transition-colors " +
                (ativa ? "border-verde text-texto" : "border-transparent text-texto-2 hover:text-texto")}>
              <Icone className={"size-4 " + (ativa ? "text-verde" : "")} />
              {a.rotulo}
            </Link>
          );
        })}
      </nav>

      {aba === "artigos" ? <AbaArtigos admin={admin} /> : <AbaConversas admin={admin} conversaSel={conversaSel} />}
    </div>
  );
}

async function AbaArtigos({ admin }: { admin: ReturnType<typeof supabaseAdmin> }) {
  const { data } = await admin.from("kb_artigos")
    .select("id, slug, titulo, conteudo, fonte, data_referencia, status, versao, updated_at")
    .order("updated_at", { ascending: false });
  return <ArtigosAdmin inicial={(data ?? []) as Artigo[]} />;
}

async function AbaConversas({ admin, conversaSel }: { admin: ReturnType<typeof supabaseAdmin>; conversaSel: string | null }) {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 5, 1); desde.setHours(0, 0, 0, 0);
  const [{ data: conversas }, { data: msgs }] = await Promise.all([
    admin.from("ia_conversas")
      .select("id, user_id, titulo, modelo, mensagens, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(50),
    admin.from("ia_mensagens")
      .select("papel, modelo, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita, erro, created_at")
      .gte("created_at", desde.toISOString()).limit(20000),
  ]);
  const ids = [...new Set((conversas ?? []).map((c) => c.user_id).filter(Boolean))] as string[];
  const { data: perfis } = ids.length
    ? await admin.from("profiles").select("user_id, nome, role, plan_id").in("user_id", ids)
    : { data: [] as { user_id: string; nome: string; role: string; plan_id: string | null }[] };
  const perfil = new Map((perfis ?? []).map((p) => [p.user_id, p]));

  // custo estimado por mês (tabela de preços em src/lib/ia/config.ts — verificar)
  const meses = new Map<string, { perguntas: number; erros: number; entrada: number; saida: number; cache: number; usd: number }>();
  for (const m of msgs ?? []) {
    const k = String(m.created_at).slice(0, 7);
    const linha = meses.get(k) ?? { perguntas: 0, erros: 0, entrada: 0, saida: 0, cache: 0, usd: 0 };
    if (m.papel === "user") linha.perguntas++;
    if (m.erro) linha.erros++;
    const uso = { entrada: Number(m.tokens_entrada), saida: Number(m.tokens_saida), cacheLeitura: Number(m.tokens_cache_leitura), cacheEscrita: Number(m.tokens_cache_escrita) };
    linha.entrada += uso.entrada; linha.saida += uso.saida; linha.cache += uso.cacheLeitura + uso.cacheEscrita;
    linha.usd += custoUsd(m.modelo, uso);
    meses.set(k, linha);
  }
  const mesAtual = new Date().toISOString().slice(0, 7);
  const atual = meses.get(mesAtual) ?? { perguntas: 0, erros: 0, entrada: 0, saida: 0, cache: 0, usd: 0 };
  const cotacao = cotacaoDolar();

  const detalhe = conversaSel && /^[0-9a-f-]{36}$/i.test(conversaSel)
    ? (await admin.from("ia_mensagens")
        .select("id, papel, conteudo, ferramentas, modelo, tokens_entrada, tokens_saida, erro, created_at")
        .eq("conversa_id", conversaSel).order("created_at")).data
    : null;

  return (
    <div className="space-y-12">
      <Indicadores itens={[
        { rotulo: "Perguntas no mês", valor: n(atual.perguntas) },
        { rotulo: "Tokens de entrada / saída", valor: `${n(atual.entrada)} / ${n(atual.saida)}` },
        { rotulo: "Custo estimado no mês", valor: `${usd(atual.usd)} ≈ ${brl(atual.usd * cotacao)}` },
        { rotulo: "Respostas com falha no mês", valor: n(atual.erros) },
      ]} />

      <Secao eyebrow="Consumo" titulo="Uso e custo por mês">
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[720px] text-[0.95rem]">
            <thead className="bg-superficie-2 text-left text-texto-2">
              <tr>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider">Mês</th><th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-right">Perguntas</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-right">Entrada</th><th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-right">Saída</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-right">Cache</th><th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-right">Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              {[...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, l]) => (
                <tr key={mes} className="border-b border-linha last:border-0 transition-colors hover:bg-superficie-2/60">
                  <td className="px-5 py-3.5 font-semibold text-texto tabular-nums">{mes.split("-").reverse().join("/")}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-texto">{n(l.perguntas)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-texto">{n(l.entrada)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-texto">{n(l.saida)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-texto">{n(l.cache)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-texto">{usd(l.usd)} ≈ {brl(l.usd * cotacao)}</td>
                </tr>
              ))}
              {!meses.size && <tr><td colSpan={6} className="px-5 py-10 text-center text-base text-texto-2">Nenhuma conversa ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-texto-2">
          Estimativa pela tabela de preços em <code className="font-mono text-xs">src/lib/ia/config.ts</code> ({Object.entries(PRECOS_USD_POR_MTOK).map(([m, p]) => `${m}: US$ ${p.entrada}/${p.saida} por milhão de tokens`).join(" · ")})
          e cotação de R$ {cotacao.toLocaleString("pt-BR")} por dólar. Confira com a fatura do provedor.
        </p>
      </Secao>

      <Secao eyebrow="Histórico" titulo="Conversas recentes">
        {conversas?.length ? (
        <div className="cartao divide-y divide-linha overflow-hidden">
          {conversas.map((c) => {
            const p = c.user_id ? perfil.get(c.user_id) : null;
            const custo = custoUsd(c.modelo, { entrada: Number(c.tokens_entrada), saida: Number(c.tokens_saida), cacheLeitura: Number(c.tokens_cache_leitura), cacheEscrita: Number(c.tokens_cache_escrita) });
            return (
              <Link key={c.id} href={`/admin/conhecimento?aba=conversas&conversa=${c.id}`}
                className={"flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3.5 text-[0.95rem] transition-colors hover:bg-superficie-2/70 " + (conversaSel === c.id ? "bg-verde/8 shadow-[inset_3px_0_0_var(--verde)]" : "")}>
                <span className="flex-1 min-w-48 font-semibold text-texto truncate">{c.titulo || "(sem título)"}</span>
                <span className="text-sm text-texto-2">{p?.nome ?? "conta removida"}{p?.plan_id ? ` · ${p.plan_id}` : ""}</span>
                <span className="text-sm text-texto-2 tabular-nums">{c.mensagens} msg · {n(Number(c.tokens_entrada) + Number(c.tokens_saida))} tokens · {usd(custo)}</span>
                <span className="text-sm text-texto-2 tabular-nums">{quando(c.updated_at)}</span>
              </Link>
            );
          })}
        </div>
        ) : (
          <Vazio icone={MessagesSquare} titulo="Nenhuma conversa ainda." />
        )}
      </Secao>

      {detalhe && (
        <Secao eyebrow="Auditoria" titulo="Conversa selecionada">
          <div className="space-y-3">
            {detalhe.map((m) => (
              <div key={m.id} className={"cartao p-5 space-y-2 " + (m.papel === "user" ? "mr-6 md:mr-12" : "ml-6 md:ml-12 border-verde/30 bg-verde/5")}>
                <p className="text-sm text-texto-2">
                  <span className="font-semibold text-texto">{m.papel === "user" ? "Pergunta" : "Resposta"}</span> · {quando(m.created_at)}
                  {m.papel === "assistant" && ` · ${m.modelo ?? "—"} · ${n(Number(m.tokens_entrada))} entrada / ${n(Number(m.tokens_saida))} saída`}
                  {m.erro && <span className="text-critico"> · falhou ({m.erro})</span>}
                </p>
                <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-texto">{m.conteudo || "—"}</p>
                {Array.isArray(m.ferramentas) && m.ferramentas.length > 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-texto-2">
                    <Wrench className="size-3.5" /> Ferramentas: {(m.ferramentas as { nome: string; ok: boolean }[]).map((f) => `${f.nome}${f.ok ? "" : " (falhou)"}`).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Secao>
      )}
    </div>
  );
}
