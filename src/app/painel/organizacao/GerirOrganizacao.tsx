"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition";

async function enviar(corpo: Record<string, unknown>) {
  const res = await fetch("/api/conta/organizacao", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, texto: res.ok ? d.mensagem ?? "Pronto." : [d.error, d.solucao].filter(Boolean).join(" ") || "Não foi possível." };
}

/** Convidar (administrador) e sair da organização (qualquer membro). */
export default function GerirOrganizacao({ souAdmin, podeConvidar }: { souAdmin: boolean; podeConvidar: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin">("membro");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setMsg(null);
    const r = await enviar({ acao: "convidar", email, papel_org: papel });
    setOcupado(false); setMsg(r);
    if (r.ok) { setEmail(""); router.refresh(); }
  }

  async function sair() {
    if (!confirm("Sair da organização? Sua conta volta ao plano pessoal.")) return;
    setOcupado(true);
    const r = await enviar({ acao: "sair" });
    setOcupado(false); setMsg(r);
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {souAdmin && (
        podeConvidar ? (
          <form onSubmit={convidar} className="cartao p-5 space-y-3">
            <h2 className="font-semibold text-texto">Convidar pessoa</h2>
            <div className="flex gap-2 flex-wrap">
              <input type="email" required placeholder="e-mail da pessoa" className={input + " flex-1 min-w-56"}
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className={input} value={papel} onChange={(e) => setPapel(e.target.value as "membro" | "admin")}>
                <option value="membro">Membro</option>
                <option value="admin">Administrador</option>
              </select>
              <button disabled={ocupado} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">Convidar</button>
            </div>
            <p className="text-xs text-texto-2">
              A pessoa recebe um e-mail. Ao entrar (ou criar a conta) com esse mesmo e-mail, ela passa a fazer parte da
              organização e a usar o plano dela.
            </p>
          </form>
        ) : (
          <p className="cartao p-4 text-sm text-texto-2">
            O plano atual da organização não inclui “Vários usuários”. Para convidar pessoas,{" "}
            <a href="/suporte?assunto=plano:organizacao" className="text-verde hover:underline">fale com a Arini</a>.
          </p>
        )
      )}
      {msg && <p className={"text-sm " + (msg.ok ? "text-verde" : "text-critico")}>{msg.texto}</p>}
      <button type="button" onClick={sair} disabled={ocupado} className="text-xs text-texto-2 hover:text-critico">
        Sair da organização
      </button>
    </div>
  );
}

/** Ações do administrador sobre um membro ou convite. */
export function AcoesMembro({ id, papel, pendente }: { id: string; papel: string; pendente: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function agir(corpo: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return;
    setOcupado(true); setErro("");
    const r = await enviar({ ...corpo, membro_id: id });
    setOcupado(false);
    if (r.ok) router.refresh(); else setErro(r.texto);
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {!pendente && (
        <button type="button" disabled={ocupado} className="text-texto-2 hover:text-texto"
          onClick={() => agir({ acao: "papel", papel_org: papel === "admin" ? "membro" : "admin" })}>
          {papel === "admin" ? "Tornar membro" : "Tornar administrador"}
        </button>
      )}
      <button type="button" disabled={ocupado} className="text-texto-2 hover:text-critico"
        onClick={() => agir({ acao: "remover" }, pendente ? "Cancelar este convite?" : "Remover esta pessoa da organização?")}>
        {pendente ? "Cancelar convite" : "Remover"}
      </button>
      {erro && <span className="text-critico">{erro}</span>}
    </span>
  );
}
