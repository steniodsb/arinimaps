import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { cotacaoDolar, custoUsd, iaConfigurada, modeloIa, PRECOS_USD_POR_MTOK } from "@/lib/ia/config";
import { Indicadores, Secao } from "@/components/admin/Painel";
import ArtigosAdmin from "./ArtigosAdmin";
import type { Artigo } from "@/lib/ia/conhecimento";

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "artigos", rotulo: "Base de conhecimento" },
  { id: "conversas", rotulo: "Conversas do assistente" },
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
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[0.22em] uppercase text-ouro">Marketing · Diretoria</p>
          <h1 className="text-2xl font-semibold text-texto">Conhecimento e IA</h1>
          <p className="text-sm text-texto-2 max-w-2xl">
            O assistente do site só responde sobre regras e processos a partir dos artigos <strong>publicados</strong> aqui,
            citando fonte e data. Cada alteração gera uma versão.
          </p>
        </div>
        <span className={"text-xs rounded-full px-3 py-1.5 " + (iaConfigurada() ? "bg-verde/15 text-verde" : "bg-alerta/15 text-alerta")}>
          {iaConfigurada() ? `Assistente ligado · ${modeloIa()}` : "Assistente em configuração (sem ANTHROPIC_API_KEY)"}
        </span>
      </div>

      <nav className="flex gap-1.5">
        {ABAS.map((a) => (
          <Link key={a.id} href={`/admin/conhecimento?aba=${a.id}`} data-ativo={aba === a.id}
            className="chip px-4 py-2 text-sm">
            {a.rotulo}
          </Link>
        ))}
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
    <div className="space-y-6">
      <Indicadores itens={[
        { rotulo: "Perguntas no mês", valor: n(atual.perguntas) },
        { rotulo: "Tokens de entrada / saída", valor: `${n(atual.entrada)} / ${n(atual.saida)}` },
        { rotulo: "Custo estimado no mês", valor: `${usd(atual.usd)} ≈ ${brl(atual.usd * cotacao)}` },
        { rotulo: "Respostas com falha no mês", valor: n(atual.erros) },
      ]} />

      <Secao titulo="Uso e custo por mês">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-texto-2 text-xs">
              <tr className="border-b border-linha">
                <th className="px-4 py-2.5">Mês</th><th className="px-4 py-2.5 text-right">Perguntas</th>
                <th className="px-4 py-2.5 text-right">Entrada</th><th className="px-4 py-2.5 text-right">Saída</th>
                <th className="px-4 py-2.5 text-right">Cache</th><th className="px-4 py-2.5 text-right">Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              {[...meses.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, l]) => (
                <tr key={mes} className="border-b border-linha last:border-0">
                  <td className="px-4 py-2.5">{mes.split("-").reverse().join("/")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(l.perguntas)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(l.entrada)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(l.saida)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n(l.cache)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{usd(l.usd)} ≈ {brl(l.usd * cotacao)}</td>
                </tr>
              ))}
              {!meses.size && <tr><td colSpan={6} className="px-4 py-6 text-center text-texto-2">Nenhuma conversa ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-texto-2">
          Estimativa pela tabela de preços em <code>src/lib/ia/config.ts</code> ({Object.entries(PRECOS_USD_POR_MTOK).map(([m, p]) => `${m}: US$ ${p.entrada}/${p.saida} por milhão de tokens`).join(" · ")})
          e cotação de R$ {cotacao.toLocaleString("pt-BR")} por dólar. Confira com a fatura do provedor.
        </p>
      </Secao>

      <Secao titulo="Conversas recentes">
        <div className="cartao divide-y divide-linha overflow-hidden">
          {(conversas ?? []).map((c) => {
            const p = c.user_id ? perfil.get(c.user_id) : null;
            const custo = custoUsd(c.modelo, { entrada: Number(c.tokens_entrada), saida: Number(c.tokens_saida), cacheLeitura: Number(c.tokens_cache_leitura), cacheEscrita: Number(c.tokens_cache_escrita) });
            return (
              <Link key={c.id} href={`/admin/conhecimento?aba=conversas&conversa=${c.id}`}
                className={"flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-superficie-2 transition " + (conversaSel === c.id ? "bg-superficie-2" : "")}>
                <span className="flex-1 min-w-48 text-texto truncate">{c.titulo || "(sem título)"}</span>
                <span className="text-texto-2">{p?.nome ?? "conta removida"}{p?.plan_id ? ` · ${p.plan_id}` : ""}</span>
                <span className="text-texto-2 tabular-nums">{c.mensagens} msg · {n(Number(c.tokens_entrada) + Number(c.tokens_saida))} tokens · {usd(custo)}</span>
                <span className="text-xs text-texto-2">{quando(c.updated_at)}</span>
              </Link>
            );
          })}
          {!conversas?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma conversa ainda.</p>}
        </div>
      </Secao>

      {detalhe && (
        <Secao titulo="Conversa selecionada (auditoria)">
          <div className="space-y-2">
            {detalhe.map((m) => (
              <div key={m.id} className={"cartao p-4 text-sm space-y-1 " + (m.papel === "user" ? "" : "border-verde/30")}>
                <p className="text-xs text-texto-2">
                  {m.papel === "user" ? "Pergunta" : "Resposta"} · {quando(m.created_at)}
                  {m.papel === "assistant" && ` · ${m.modelo ?? "—"} · ${n(Number(m.tokens_entrada))} entrada / ${n(Number(m.tokens_saida))} saída`}
                  {m.erro && <span className="text-critico"> · falhou ({m.erro})</span>}
                </p>
                <p className="whitespace-pre-wrap text-texto">{m.conteudo || "—"}</p>
                {Array.isArray(m.ferramentas) && m.ferramentas.length > 0 && (
                  <p className="text-xs text-texto-2">
                    Ferramentas: {(m.ferramentas as { nome: string; ok: boolean }[]).map((f) => `${f.nome}${f.ok ? "" : " (falhou)"}`).join(", ")}
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
