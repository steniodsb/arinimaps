"use client";

/**
 * Botão flutuante do assistente de IA (PENDÊNCIA 5.1), montado no AppShell
 * (páginas públicas e painel; a Central usa outra casca e não mostra).
 *
 * Resposta por streaming (SSE) de POST /api/ia/chat; se o navegador não der
 * acesso ao corpo em fluxo, lê tudo de uma vez e mostra no fim. A conversa
 * da aba fica no sessionStorage para sobreviver à troca de página — o
 * histórico que o modelo vê vem do banco, não daqui.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Fonte = { tipo: "imovel" | "car" | "conhecimento"; rotulo: string; href?: string };
type Msg = { papel: "user" | "assistant"; texto: string; fontes?: Fonte[]; erro?: boolean; status?: string };
type Estado = {
  ligado: boolean; motivo?: "sem_chave" | "desligado"; sessao: boolean; permitido: boolean;
  negacao?: { mensagem: string; solucao: string }; cota?: { limite: number; usado: number } | null;
};

const CHAVE = "arini:ia:conversa";
const SUGESTOES = [
  "Lotes até R$ 400 mil em Iturama",
  "Fazendas acima de 50 ha na região",
  "Qual a comissão da Arini?",
  "O CAR comprova a propriedade?",
];

// ---------------------------------------------------------------- markdown mínimo e seguro
// só negrito, listas, quebras e links INTERNOS (começando por "/"); nada de HTML.
function Inline({ texto }: { texto: string }) {
  const partes: React.ReactNode[] = [];
  const re = /\[([^\]]{1,200})\]\((\/[^\s)]{1,200})\)|(\/(?:imovel|consulta\/car)\/[A-Za-z0-9%.\-]+)|\*\*([^*]{1,300})\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1] && m[2]) partes.push(<Link key={k++} href={m[2]} className="text-verde underline underline-offset-2">{m[1]}</Link>);
    else if (m[3]) partes.push(<Link key={k++} href={m[3]} className="text-verde underline underline-offset-2">{m[3]}</Link>);
    else if (m[4]) partes.push(<strong key={k++} className="font-semibold text-texto">{m[4]}</strong>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocos: React.ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) {
      blocos.push(<ul key={blocos.length} className="list-disc pl-5 space-y-0.5">{lista.map((l, i) => <li key={i}><Inline texto={l} /></li>)}</ul>);
      lista = [];
    }
  };
  for (const l of linhas) {
    const item = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) { lista.push(item[1]); continue; }
    fecharLista();
    if (!l.trim()) continue;
    const titulo = l.match(/^#{1,4}\s+(.*)$/);
    blocos.push(titulo
      ? <p key={blocos.length} className="font-semibold text-texto"><Inline texto={titulo[1]} /></p>
      : <p key={blocos.length}><Inline texto={l} /></p>);
  }
  fecharLista();
  return <div className="space-y-1.5">{blocos}</div>;
}

// ---------------------------------------------------------------- SSE
function eventosDe(bloco: string): Record<string, unknown>[] {
  return bloco.split("\n\n").flatMap((parte) => {
    const dados = parte.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!dados) return [];
    try { return [JSON.parse(dados)]; } catch { return []; }
  });
}

export default function ChatIA() {
  // no mapa, a barra de ferramentas ocupa o rodapé: o botão sobe para não cobrir "Capturar"
  const noMapa = usePathname()?.startsWith("/mapa") ?? false;
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // a conversa da aba é restaurada ao abrir (não no carregamento da página)
  const restaurado = useRef(false);
  function abrir() {
    if (!restaurado.current) {
      restaurado.current = true;
      try {
        const salvo = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
        if (salvo?.msgs) { setMsgs(salvo.msgs); setConversaId(salvo.conversaId ?? null); }
      } catch { /* sem armazenamento: começa vazio */ }
    }
    setAberto(true);
  }
  useEffect(() => {
    if (!restaurado.current) return;
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ conversaId, msgs: msgs.slice(-30) })); } catch { /* ignore */ }
  }, [msgs, conversaId]);
  useEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [msgs, aberto]);

  useEffect(() => {
    if (!aberto || estado) return;
    fetch("/api/ia/estado").then((r) => r.json()).then(setEstado)
      .catch(() => setEstado({ ligado: false, sessao: false, permitido: false }));
  }, [aberto, estado]);

  const atualizarUltima = (fn: (m: Msg) => Msg) =>
    setMsgs((lista) => lista.map((m, i) => (i === lista.length - 1 ? fn(m) : m)));

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || enviando) return;
    setTexto("");
    setEnviando(true);
    setMsgs((l) => [...l, { papel: "user", texto: q }, { papel: "assistant", texto: "", status: "Pensando…" }]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const suportaFluxo = typeof ReadableStream !== "undefined" && typeof TextDecoder !== "undefined";

    const aplicar = (ev: Record<string, unknown>) => {
      if (ev.tipo === "inicio" && typeof ev.conversaId === "string") setConversaId(ev.conversaId);
      if (ev.tipo === "texto") atualizarUltima((m) => ({ ...m, texto: m.texto + String(ev.texto ?? ""), status: undefined }));
      if (ev.tipo === "ferramenta") atualizarUltima((m) => ({ ...m, status: `${String(ev.rotulo ?? "Consultando")}…` }));
      if (ev.tipo === "fim") {
        atualizarUltima((m) => ({ ...m, fontes: (ev.fontes as Fonte[]) ?? [], status: undefined }));
        if (typeof ev.restante === "number") setEstado((e) => e?.cota ? { ...e, cota: { ...e.cota, usado: e.cota.limite - (ev.restante as number) } } : e);
      }
      if (ev.tipo === "erro") atualizarUltima((m) => ({ ...m, texto: (m.texto ? m.texto + "\n\n" : "") + String(ev.mensagem ?? "Falhou."), erro: true, status: undefined }));
    };

    try {
      const res = await fetch(`/api/ia/chat${suportaFluxo ? "" : "?stream=0"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: q, conversaId }),
        signal: ctrl.signal,
      });
      const tipo = res.headers.get("content-type") ?? "";
      if (!res.ok || !tipo.includes("text/event-stream")) {
        const corpo = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (res.ok && corpo) {
          // resposta inteira (sem streaming)
          if (typeof corpo.conversaId === "string") setConversaId(corpo.conversaId);
          atualizarUltima((m) => ({ ...m, texto: String(corpo.texto ?? ""), fontes: (corpo.fontes as Fonte[]) ?? [], status: undefined }));
        } else {
          const msg = [corpo?.error, corpo?.solucao].filter(Boolean).join(" ") || `O assistente não respondeu (${res.status}).`;
          atualizarUltima((m) => ({ ...m, texto: msg, erro: true, status: undefined }));
          if (corpo?.codigo === "ia_desligada" || corpo?.codigo === "cota_esgotada") setEstado(null);
        }
        return;
      }
      if (!res.body) {
        // sem corpo em fluxo: processa tudo de uma vez
        eventosDe(await res.text()).forEach(aplicar);
        return;
      }
      const leitor = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const corte = buffer.lastIndexOf("\n\n");
        if (corte >= 0) {
          eventosDe(buffer.slice(0, corte + 2)).forEach(aplicar);
          buffer = buffer.slice(corte + 2);
        }
      }
      if (buffer.trim()) eventosDe(buffer).forEach(aplicar);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        atualizarUltima((m) => ({ ...m, texto: (m.texto ? m.texto + "\n\n" : "") + "A conexão caiu antes do fim da resposta. Tente de novo.", erro: true, status: undefined }));
      }
    } finally {
      setEnviando(false);
      abortRef.current = null;
      atualizarUltima((m) => (m.status ? { ...m, status: undefined, texto: m.texto || "Sem resposta." } : m));
    }
  }

  function novaConversa() {
    abortRef.current?.abort();
    setMsgs([]); setConversaId(null);
  }

  const restante = estado?.cota ? Math.max(0, estado.cota.limite - estado.cota.usado) : null;
  const podeConversar = !!estado?.ligado && estado.permitido && restante !== 0;

  return (
    <>
      {!aberto && (
        <button type="button" onClick={abrir} aria-label="Abrir o assistente"
          className={"fixed z-50 right-4 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-[#06140D] shadow-xl border border-verde/40 hover:-translate-y-0.5 transition " + (noMapa ? "bottom-72 lg:bottom-36" : "bottom-20 lg:bottom-6")}
          style={{ background: "linear-gradient(180deg, #45D98A 0%, #2FA866 100%)" }}>
          <span aria-hidden>✦</span> <span className="hidden sm:inline">Pergunte à Arini</span>
        </button>
      )}

      {aberto && (
        <div role="dialog" aria-label="Assistente Arini"
          className="fixed z-50 inset-x-2 bottom-20 top-20 sm:inset-x-auto sm:right-4 sm:top-auto sm:w-[400px] sm:h-[600px] sm:max-h-[calc(100vh-7rem)] lg:bottom-6 cartao shadow-2xl flex flex-col overflow-hidden anima-subir">
          <div className="flex items-center gap-2 px-4 h-14 border-b border-linha bg-superficie-2 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-verde/15 text-verde grid place-items-center" aria-hidden>✦</span>
            <div className="flex-1 leading-tight">
              <p className="text-sm font-semibold text-texto">Assistente Arini</p>
              <p className="text-[10px] text-texto-2">IA · imóveis publicados, CAR e base de conhecimento</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={novaConversa} className="text-[11px] text-texto-2 hover:text-texto px-2">Nova</button>
            )}
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="w-8 h-8 rounded-lg text-texto-2 hover:text-texto hover:bg-superficie">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {!estado && <p className="text-texto-2">Carregando…</p>}

            {estado && !estado.ligado && (
              <div className="rounded-xl bg-superficie-2 p-4 space-y-1">
                <p className="font-semibold text-texto">{estado.motivo === "desligado" ? "Assistente desligado" : "Assistente em configuração"}</p>
                <p className="text-texto-2">
                  {estado.motivo === "desligado"
                    ? "A Arini desligou o assistente por enquanto."
                    : "O assistente de IA ainda está sendo configurado."}{" "}
                  Enquanto isso, use a <Link href="/imoveis" className="text-verde underline">busca de imóveis</Link> ou o{" "}
                  <Link href="/mapa" className="text-verde underline">mapa</Link>.
                </p>
              </div>
            )}

            {estado?.ligado && !estado.permitido && estado.negacao && (
              <div className="rounded-xl bg-superficie-2 p-4 space-y-2">
                <p className="font-semibold text-texto">{estado.negacao.mensagem}</p>
                <p className="text-texto-2">{estado.negacao.solucao}</p>
                {estado.sessao
                  ? <Link href="/planos" className="btn-ouro inline-block px-4 py-2 text-xs">Ver planos</Link>
                  : <Link href="/entrar" className="btn-verde inline-block px-4 py-2 text-xs">Entrar</Link>}
              </div>
            )}

            {estado?.ligado && estado.permitido && msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-texto-2">
                  Pergunte sobre imóveis publicados, uma área do CAR ou como o Arini Maps funciona.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGESTOES.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} disabled={!podeConversar}
                      className="chip px-3 py-1.5 text-xs text-left">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={m.papel === "user" ? "flex justify-end" : ""}>
                <div className={
                  m.papel === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-verde/15 text-texto px-3.5 py-2 whitespace-pre-wrap"
                    : "max-w-[95%] text-texto-2 leading-relaxed " + (m.erro ? "text-critico" : "")
                }>
                  {m.papel === "user" ? m.texto : <Markdown texto={m.texto} />}
                  {m.status && <p className="text-xs text-texto-2 animate-pulse mt-1">{m.status}</p>}
                  {!!m.fontes?.length && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.fontes.slice(0, 8).map((f, j) => f.href ? (
                        <Link key={j} href={f.href} className="text-[11px] rounded-full border border-linha px-2.5 py-1 hover:border-verde/50 hover:text-texto">
                          {f.tipo === "car" ? "CAR" : f.tipo === "imovel" ? "Imóvel" : "Base"} · {f.rotulo.length > 42 ? f.rotulo.slice(0, 42) + "…" : f.rotulo}
                        </Link>
                      ) : (
                        <span key={j} className="text-[11px] rounded-full border border-linha px-2.5 py-1">Base · {f.rotulo}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          {estado?.ligado && estado.permitido && (
            <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="border-t border-linha p-3 space-y-1.5 shrink-0">
              <div className="flex gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={1500}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
                  placeholder={restante === 0 ? "Cota do mês esgotada" : "Escreva sua pergunta…"}
                  disabled={!podeConversar}
                  className="flex-1 resize-none rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde" />
                <button type="submit" disabled={!podeConversar || enviando || !texto.trim()} className="btn-verde px-4 text-sm disabled:opacity-50">
                  {enviando ? "…" : "Enviar"}
                </button>
              </div>
              <p className="text-[10px] text-texto-2 leading-snug">
                Respostas automáticas: confira na ficha do imóvel. Não envie dados pessoais. Conversas ficam registradas.
                {restante != null && ` · ${restante} pergunta(s) restante(s) no mês.`}
              </p>
            </form>
          )}
        </div>
      )}
    </>
  );
}
