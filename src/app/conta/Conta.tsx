"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/shell/Avatar";
import { aplicarTemaPreferido } from "@/components/shell/BotaoTema";
import { recarregarPreferencias, usePreferencias } from "@/lib/usePreferencias";
import type { Preferencias } from "@/lib/preferencias";

const input = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition";
const rotulo = "block text-sm font-medium text-texto mb-1";

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO = 3 * 1024 * 1024;
const LADO = 512;

type Convite = { id: string; org: string; tipo: string; papel: string; emOutra: boolean };

/**
 * Reduz a foto no navegador: recorte quadrado central, 512 px, WebP. Assim o
 * envio é pequeno (dezenas de KB) e a foto já sai no formato do círculo.
 */
async function reduzir(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível ler a imagem."));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const destino = Math.min(LADO, lado);
    const canvas = document.createElement("canvas");
    canvas.width = destino; canvas.height = destino;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu preparar a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, destino, destino);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.86));
    if (!blob) throw new Error("Não foi possível converter a imagem.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Conta({
  inicial, convites,
}: {
  inicial: { nome: string; telefone: string; avatar: string | null; preferencias: Preferencias };
  convites: Convite[];
}) {
  const router = useRouter();

  // ---------- foto ----------
  const [avatar, setAvatar] = useState(inicial.avatar);
  const [fotoMsg, setFotoMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function trocarFoto(arquivo: File) {
    setFotoMsg(null);
    if (!TIPOS_FOTO.includes(arquivo.type)) { setFotoMsg({ ok: false, texto: "Use uma foto JPG, PNG ou WebP." }); return; }
    if (arquivo.size > MAX_FOTO) { setFotoMsg({ ok: false, texto: "A foto passa de 3 MB. Escolha uma menor." }); return; }
    setEnviandoFoto(true);
    try {
      const blob = await reduzir(arquivo);
      const fd = new FormData();
      fd.set("foto", blob, blob.type === "image/webp" ? "foto.webp" : "foto.png");
      const res = await fetch("/api/conta/avatar", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setFotoMsg({ ok: false, texto: [d.error, d.solucao].filter(Boolean).join(" ") || "Não foi possível enviar." }); return; }
      setAvatar(d.avatar_url);
      setFotoMsg({ ok: true, texto: "Foto atualizada." });
      void recarregarPreferencias();
      router.refresh();
    } catch (e) {
      setFotoMsg({ ok: false, texto: e instanceof Error ? e.message : "Não foi possível enviar." });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    setEnviandoFoto(true); setFotoMsg(null);
    const res = await fetch("/api/conta/avatar", { method: "DELETE" });
    setEnviandoFoto(false);
    if (res.ok) { setAvatar(null); setFotoMsg({ ok: true, texto: "Foto removida." }); void recarregarPreferencias(); router.refresh(); }
  }

  // ---------- dados ----------
  const [nome, setNome] = useState(inicial.nome);
  const [telefone, setTelefone] = useState(inicial.telefone);
  const [dadosMsg, setDadosMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvandoDados, setSalvandoDados] = useState(false);

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoDados(true); setDadosMsg(null);
    const res = await fetch("/api/conta", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, telefone }),
    });
    const d = await res.json().catch(() => ({}));
    setSalvandoDados(false);
    if (!res.ok) { setDadosMsg({ ok: false, texto: [d.error, d.solucao].filter(Boolean).join(" ") || "Não foi possível salvar." }); return; }
    setDadosMsg({ ok: true, texto: "Dados salvos." });
    void recarregarPreferencias();
    router.refresh();
  }

  // ---------- preferências ----------
  const { salvar } = usePreferencias();
  const [prefs, setPrefs] = useState<Preferencias>(inicial.preferencias);
  const [prefMsg, setPrefMsg] = useState("");

  async function mudar(parcial: Partial<Preferencias>) {
    setPrefs((p) => ({ ...p, ...parcial }));
    if (parcial.tema) aplicarTemaPreferido(parcial.tema);
    setPrefMsg("Salvando…");
    setPrefMsg((await salvar(parcial)) ? "Salvo na sua conta — vale em qualquer aparelho." : "Não foi possível salvar agora.");
  }

  // ---------- convites ----------
  const [conviteMsg, setConviteMsg] = useState("");
  async function responderConvite(id: string, acao: "aceitar" | "recusar") {
    setConviteMsg("");
    const res = await fetch("/api/conta/organizacao", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, convite_id: id }),
    });
    const d = await res.json().catch(() => ({}));
    setConviteMsg(res.ok ? d.mensagem ?? "Pronto." : d.error ?? "Não foi possível responder.");
    if (res.ok) router.refresh();
  }

  const opcao = (ativo: boolean) =>
    "rounded-xl border px-3.5 py-2 text-sm transition " +
    (ativo ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2 hover:text-texto");

  return (
    <div className="space-y-6">
      {convites.length > 0 && (
        <section className="cartao p-5 space-y-3 border-ouro/40">
          <h2 className="font-semibold text-texto">Convites de organização</h2>
          {convites.map((c) => (
            <div key={c.id} className="flex items-center gap-3 flex-wrap text-sm">
              <span className="flex-1 min-w-48 text-texto">
                {c.org} <span className="text-texto-2">· {c.tipo} · como {c.papel.toLowerCase()}</span>
              </span>
              <button type="button" disabled={c.emOutra} onClick={() => responderConvite(c.id, "aceitar")}
                title={c.emOutra ? "Saia da organização atual antes de aceitar outra." : undefined}
                className="btn-verde px-4 py-2 text-sm disabled:opacity-50">Aceitar</button>
              <button type="button" onClick={() => responderConvite(c.id, "recusar")} className="btn-contorno px-4 py-2 text-sm">Recusar</button>
            </div>
          ))}
          <p className="text-xs text-texto-2">Quem entra numa organização passa a usar o plano dela (se o seu plano pessoal não foi definido pela Arini).</p>
          {conviteMsg && <p className="text-sm text-verde">{conviteMsg}</p>}
        </section>
      )}

      <section className="cartao p-5 space-y-4">
        <h2 className="font-semibold text-texto">Foto do perfil</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <Avatar nome={nome} url={avatar} tamanho={88} />
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button type="button" disabled={enviandoFoto} onClick={() => arquivoRef.current?.click()}
                className="btn-verde px-4 py-2 text-sm disabled:opacity-60">
                {enviandoFoto ? "Enviando…" : avatar ? "Trocar foto" : "Enviar foto"}
              </button>
              {avatar && (
                <button type="button" disabled={enviandoFoto} onClick={removerFoto} className="btn-contorno px-4 py-2 text-sm">Remover</button>
              )}
            </div>
            <p className="text-xs text-texto-2">JPG, PNG ou WebP até 3 MB. A foto é recortada em quadrado e aparece no topo do site. Não substitui a selfie da exclusividade.</p>
            <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) trocarFoto(f); }} />
          </div>
        </div>
        {fotoMsg && <p className={"text-sm " + (fotoMsg.ok ? "text-verde" : "text-critico")}>{fotoMsg.texto}</p>}
      </section>

      <form onSubmit={salvarDados} className="cartao p-5 space-y-4">
        <h2 className="font-semibold text-texto">Seus dados</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="c-nome">Nome</label>
            <input id="c-nome" required minLength={2} maxLength={120} className={input} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className={rotulo} htmlFor="c-tel">Telefone / WhatsApp</label>
            <input id="c-tel" className={input} placeholder="(34) 90000-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>
        {dadosMsg && <p className={"text-sm " + (dadosMsg.ok ? "text-verde" : "text-critico")}>{dadosMsg.texto}</p>}
        <button disabled={salvandoDados} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">{salvandoDados ? "Salvando…" : "Salvar dados"}</button>
      </form>

      <section className="cartao p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-texto">Preferências</h2>
          <p className="text-xs text-texto-2">Ficam guardadas na conta e acompanham você no celular e no computador.</p>
        </div>
        <div className="space-y-2">
          <p className={rotulo}>Tema</p>
          <div className="flex gap-2 flex-wrap">
            {([["claro", "Claro"], ["escuro", "Escuro"], ["sistema", "Igual ao aparelho"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={opcao(prefs.tema === v)} onClick={() => mudar({ tema: v })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className={rotulo}>Mapa abre em</p>
          <div className="flex gap-2 flex-wrap">
            {([["satelite", "Satélite"], ["mapa", "Mapa de ruas"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={opcao(prefs.mapa_base === v)} onClick={() => mudar({ mapa_base: v })}>{l}</button>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 text-sm text-texto">
          <input type="checkbox" className="mt-1" checked={prefs.camada_car} onChange={(e) => mudar({ camada_car: e.target.checked })} />
          <span>Abrir o mapa com a camada do CAR ligada<span className="block text-xs text-texto-2">Divisas dos imóveis rurais declaradas no Cadastro Ambiental Rural.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-texto">
          <input type="checkbox" className="mt-1" checked={prefs.emails_novidades} onChange={(e) => mudar({ emails_novidades: e.target.checked })} />
          <span>Quero receber e-mails de novidades do Arini Imóveis Brasil<span className="block text-xs text-texto-2">Imóveis novos e recursos do sistema. Você pode desmarcar quando quiser. Avisos da sua conta e dos seus anúncios continuam chegando.</span></span>
        </label>
        {prefMsg && <p className="text-xs text-texto-2">{prefMsg}</p>}
      </section>
    </div>
  );
}
