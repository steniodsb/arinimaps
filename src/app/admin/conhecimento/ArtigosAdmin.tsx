"use client";

import { useState } from "react";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";
import {
  STATUS_ARTIGO, STATUS_ARTIGO_COR, STATUS_ARTIGO_LABEL, slugDe, type Artigo, type StatusArtigo,
} from "@/lib/ia/conhecimento";

type Versao = {
  versao: number; titulo: string; conteudo: string; fonte: string; data_referencia: string;
  status: StatusArtigo; editado_por_nome: string; created_at: string;
};
type Achado = { id: string; titulo: string; trecho: string; fonte: string; data_referencia: string; versao: number; rank: number };

const hoje = () => new Date().toISOString().slice(0, 10);
const VAZIO = { id: "", slug: "", titulo: "", conteudo: "", fonte: "", data_referencia: hoje(), status: "rascunho" as StatusArtigo, versao: 0, updated_at: "" };
const campo = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition";
const dataBR = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR");

/** CRUD da base de conhecimento + histórico de versões + teste da busca do assistente. */
export default function ArtigosAdmin({ inicial }: { inicial: Artigo[] }) {
  const [artigos, setArtigos] = useState(inicial);
  const [edit, setEdit] = useState<Artigo | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const [verVersao, setVerVersao] = useState<Versao | null>(null);
  const [filtro, setFiltro] = useState<"todos" | StatusArtigo>("todos");
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Achado[] | null>(null);

  async function recarregar() {
    const r = await fetch("/api/ia/conhecimento").then((x) => x.json()).catch(() => null);
    if (r?.artigos) setArtigos(r.artigos);
  }

  async function abrir(a: Artigo | null) {
    setErro(null); setOk(null); setVersoes(null); setVerVersao(null);
    setEdit(a ? { ...a } : { ...VAZIO });
    setSlugManual(!!a);
    if (a) {
      const r = await fetch(`/api/ia/conhecimento/${a.id}`).then((x) => x.json()).catch(() => null);
      if (r?.versoes) setVersoes(r.versoes);
    }
  }

  async function salvar(status?: StatusArtigo) {
    if (!edit) return;
    setSalvando(true); setErro(null); setOk(null);
    const corpo = { ...edit, status: status ?? edit.status };
    const r = edit.id
      ? await enviarJson<{ versao: number }>(`/api/ia/conhecimento/${edit.id}`, "PATCH", corpo)
      : await enviarJson<{ id: string }>("/api/ia/conhecimento", "POST", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setOk(edit.id ? "Alterações salvas — nova versão registrada." : "Artigo criado.");
    await recarregar();
    const id = edit.id || (r.dados as { id: string }).id;
    const atualizado = await fetch(`/api/ia/conhecimento/${id}`).then((x) => x.json()).catch(() => null);
    if (atualizado?.artigo) { setEdit(atualizado.artigo); setVersoes(atualizado.versoes); setSlugManual(true); }
  }

  async function testarBusca(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await fetch(`/api/ia/conhecimento?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null);
    setAchados(r?.resultados ?? []);
  }

  const lista = artigos.filter((a) => filtro === "todos" || a.status === filtro);

  return (
    <div className="space-y-6">
      <form onSubmit={testarBusca} className="cartao p-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-60">
          <label htmlFor="kb-q" className="block text-xs text-texto-2 mb-1">Testar a busca do assistente (só artigos publicados)</label>
          <input id="kb-q" value={q} onChange={(e) => setQ(e.target.value)} className={campo}
            placeholder="Ex.: qual a comissão da Arini?" />
        </div>
        <button className="btn-contorno px-5 py-2.5 text-sm">Buscar</button>
        {achados && (
          <div className="w-full pt-2 space-y-2">
            {!achados.length && <p className="text-sm text-texto-2">Nada encontrado — o assistente vai dizer que não há informação oficial.</p>}
            {achados.map((a) => (
              <div key={a.id} className="rounded-xl bg-superficie-2 p-3 text-sm">
                <p className="font-medium text-texto">{a.titulo} <span className="text-xs text-texto-2">v{a.versao} · relevância {a.rank.toFixed(2)}</span></p>
                <p className="text-texto-2 text-xs mt-1">{a.trecho}</p>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        {/* ---------- lista ---------- */}
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {(["todos", ...STATUS_ARTIGO] as const).map((s) => (
              <button key={s} type="button" onClick={() => setFiltro(s)} data-ativo={filtro === s} className="chip px-3 py-1.5 text-xs">
                {s === "todos" ? "Todos" : STATUS_ARTIGO_LABEL[s]}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => abrir(null)} className="btn-verde w-full py-2.5 text-sm">+ Novo artigo</button>
          <div className="cartao divide-y divide-linha overflow-hidden">
            {lista.map((a) => (
              <button key={a.id} type="button" onClick={() => abrir(a)}
                className={"w-full text-left px-4 py-3 hover:bg-superficie-2 transition " + (edit?.id === a.id ? "bg-superficie-2" : "")}>
                <p className="text-sm text-texto leading-snug">{a.titulo}</p>
                <p className="text-[11px] text-texto-2 mt-1 flex gap-2 items-center">
                  <span className={"rounded-full px-2 py-0.5 " + STATUS_ARTIGO_COR[a.status]}>{STATUS_ARTIGO_LABEL[a.status]}</span>
                  v{a.versao} · ref. {dataBR(a.data_referencia)}
                </p>
              </button>
            ))}
            {!lista.length && <p className="px-4 py-6 text-sm text-texto-2 text-center">Nenhum artigo.</p>}
          </div>
        </div>

        {/* ---------- editor ---------- */}
        {edit ? (
          <div className="space-y-4">
            <div className="cartao p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-texto">{edit.id ? `Editar artigo (versão ${edit.versao})` : "Novo artigo"}</h2>
                {edit.id && <span className={"text-xs rounded-full px-3 py-1 " + STATUS_ARTIGO_COR[edit.status]}>{STATUS_ARTIGO_LABEL[edit.status]}</span>}
              </div>
              <div>
                <label htmlFor="kb-titulo" className="block text-xs text-texto-2 mb-1">Título</label>
                <input id="kb-titulo" className={campo} value={edit.titulo}
                  onChange={(e) => setEdit({ ...edit, titulo: e.target.value, slug: slugManual ? edit.slug : slugDe(e.target.value) })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <div>
                  <label htmlFor="kb-slug" className="block text-xs text-texto-2 mb-1">Identificador</label>
                  <input id="kb-slug" className={campo + " font-mono"} value={edit.slug}
                    onChange={(e) => { setSlugManual(true); setEdit({ ...edit, slug: e.target.value }); }} />
                </div>
                <div>
                  <label htmlFor="kb-data" className="block text-xs text-texto-2 mb-1">Data de referência</label>
                  <input id="kb-data" type="date" className={campo} value={edit.data_referencia}
                    onChange={(e) => setEdit({ ...edit, data_referencia: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="kb-fonte" className="block text-xs text-texto-2 mb-1">Fonte (de onde veio a informação)</label>
                <input id="kb-fonte" className={campo} value={edit.fonte} placeholder="Ex.: Termos de uso v3; Configurações › Regras comerciais"
                  onChange={(e) => setEdit({ ...edit, fonte: e.target.value })} />
              </div>
              <div>
                <label htmlFor="kb-conteudo" className="block text-xs text-texto-2 mb-1">Conteúdo (markdown simples)</label>
                <textarea id="kb-conteudo" rows={16} className={campo + " font-mono text-[13px] leading-relaxed"} value={edit.conteudo}
                  onChange={(e) => setEdit({ ...edit, conteudo: e.target.value })} />
                <p className="text-[11px] text-texto-2 mt-1">{edit.conteudo.length.toLocaleString("pt-BR")} / 20.000 caracteres. O assistente lê até 3.000 por artigo.</p>
              </div>

              {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
              {ok && <p className="text-sm text-verde">{ok}</p>}

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={salvando} onClick={() => salvar()} className="btn-contorno px-5 py-2.5 text-sm">
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                {edit.status !== "publicado" && (
                  <button type="button" disabled={salvando} onClick={() => salvar("publicado")} className="btn-verde px-5 py-2.5 text-sm">
                    Salvar e publicar
                  </button>
                )}
                {edit.id && edit.status === "publicado" && (
                  <button type="button" disabled={salvando} onClick={() => salvar("rascunho")} className="btn-contorno px-5 py-2.5 text-sm">
                    Voltar para rascunho
                  </button>
                )}
                {edit.id && edit.status !== "arquivado" && (
                  <button type="button" disabled={salvando} onClick={() => salvar("arquivado")} className="btn-perigo px-5 py-2.5 text-sm">
                    Arquivar
                  </button>
                )}
              </div>
              <p className="text-[11px] text-texto-2">
                Só artigos publicados entram nas respostas do assistente. Arquivar tira da busca sem apagar o histórico.
              </p>
            </div>

            {versoes && versoes.length > 0 && (
              <div className="cartao p-5 space-y-3">
                <h3 className="font-semibold text-texto text-sm">Versões ({versoes.length})</h3>
                <div className="divide-y divide-linha text-sm">
                  {versoes.map((v) => (
                    <button key={v.versao} type="button" onClick={() => setVerVersao(verVersao?.versao === v.versao ? null : v)}
                      className="w-full text-left py-2 flex flex-wrap gap-x-3 hover:text-verde">
                      <span className="font-mono">v{v.versao}</span>
                      <span className={"text-[11px] rounded-full px-2 py-0.5 " + STATUS_ARTIGO_COR[v.status]}>{STATUS_ARTIGO_LABEL[v.status]}</span>
                      <span className="text-texto-2">{v.editado_por_nome}</span>
                      <span className="text-texto-2">{new Date(v.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </button>
                  ))}
                </div>
                {verVersao && (
                  <div className="rounded-xl bg-superficie-2 p-4 text-sm space-y-1">
                    <p className="font-medium text-texto">{verVersao.titulo}</p>
                    <p className="text-xs text-texto-2">Fonte: {verVersao.fonte || "—"} · ref. {dataBR(verVersao.data_referencia)}</p>
                    <pre className="whitespace-pre-wrap font-sans text-texto-2 text-[13px] leading-relaxed pt-2">{verVersao.conteudo}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="cartao p-10 text-center text-sm text-texto-2">
            Escolha um artigo para editar ou crie um novo.
          </div>
        )}
      </div>
    </div>
  );
}
