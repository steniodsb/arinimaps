"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SENHA_MIN, validarSenha } from "@/lib/seguranca/senha";

const INPUT = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition";

/**
 * Chegada do link de recuperação. O link traz um token de uso único
 * (`token_hash`, no e-mail enviado por nós) ou um `code` (e-mail padrão do
 * Supabase). Trocado o token por sessão, a pessoa escolhe a senha nova.
 */
export default function RedefinirSenha() {
  const router = useRouter();
  const [estado, setEstado] = useState<"validando" | "pronto" | "invalido" | "feito">("validando");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // contas da equipe (item 6.7): etapa extra pedida pelo servidor
  const [etapa, setEtapa] = useState<null | "mfa" | "codigo">(null);
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    const supabase = supabaseBrowser();
    const q = new URLSearchParams(window.location.search);
    const tokenHash = q.get("token_hash");
    const code = q.get("code");
    (async () => {
      let ok = false;
      if (tokenHash) {
        ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })).error;
      } else if (code) {
        ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
      } else {
        ok = !!(await supabase.auth.getUser()).data.user;
      }
      // tira o token da barra de endereço: ele não deve ficar no histórico
      window.history.replaceState(null, "", "/redefinir-senha");
      setEstado(ok ? "pronto" : "invalido");
    })();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const problema = validarSenha(senha);
    if (problema) { setErro(problema); return; }
    if (senha !== confirma) { setErro("As duas senhas não são iguais."); return; }
    setOcupado(true);
    // conta da equipe com segundo fator: confirma o código do aplicativo antes (sessão aal2)
    if (etapa === "mfa") {
      const supabase = supabaseBrowser();
      const { data: fatores } = await supabase.auth.mfa.listFactors();
      const fator = fatores?.totp?.find((f) => f.status === "verified");
      const { error } = fator
        ? await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.replace(/[^0-9]/g, "") })
        : { error: new Error("sem fator") };
      await fetch("/api/auth/evento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento: error ? "mfa_falhou" : "mfa_ok" }),
      }).catch(() => undefined);
      if (error) { setOcupado(false); setErro("Código incorreto ou vencido. Confira o aplicativo e tente de novo."); return; }
    }
    const res = await fetch("/api/auth/redefinir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha, ...(etapa === "codigo" && codigo ? { codigo } : {}) }),
    });
    setOcupado(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      if (corpo.codigo === "mfa_necessario") { setEtapa("mfa"); setCodigo(""); setAviso(corpo.error); return; }
      if (corpo.codigo === "codigo_email_necessario") { setEtapa("codigo"); setCodigo(""); setAviso(corpo.error); return; }
      setErro(corpo.error ?? "Não foi possível salvar a senha.");
      return;
    }
    setEstado("feito");
    setTimeout(() => { router.push("/entrar"); router.refresh(); }, 2500);
  }

  return (
    <div className="min-h-screen flex flex-col bg-fundo">
      <div className="px-4 py-4 border-b border-linha">
        <Link href="/" className="font-semibold text-texto">Arini <span className="texto-ouro">Imóveis Brasil</span></Link>
      </div>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md cartao p-6 space-y-4">
          <h1 className="text-xl font-semibold text-texto">Criar senha nova</h1>

          {estado === "validando" && <p className="text-sm text-texto-2">Conferindo o link…</p>}

          {estado === "invalido" && (
            <>
              <p className="text-sm text-texto-2">
                Este link expirou ou já foi usado. Cada link vale por 1 hora e funciona uma única vez.
              </p>
              <Link href="/entrar?recuperar=1" className="btn-verde block text-center py-3">Pedir um link novo</Link>
            </>
          )}

          {estado === "pronto" && (
            <form onSubmit={salvar} className="space-y-3.5">
              <div>
                <label className="block text-sm font-medium text-texto mb-1" htmlFor="nova">Senha nova</label>
                <input id="nova" type="password" required autoComplete="new-password" className={INPUT}
                  placeholder={`Mínimo ${SENHA_MIN} caracteres, com letras e números`}
                  value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-texto mb-1" htmlFor="conf">Repita a senha</label>
                <input id="conf" type="password" required autoComplete="new-password" className={INPUT}
                  value={confirma} onChange={(e) => setConfirma(e.target.value)} />
              </div>
              {etapa && (
                <div>
                  <label className="block text-sm font-medium text-texto mb-1" htmlFor="codigo">
                    {etapa === "mfa" ? "Código do aplicativo autenticador" : "Código enviado ao seu e-mail"}
                  </label>
                  <input id="codigo" required inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={INPUT}
                    placeholder="000000" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                  {aviso && <p className="text-xs text-texto-2 mt-1">{aviso}</p>}
                </div>
              )}
              {erro && <p className="text-sm text-critico">{erro}</p>}
              <button disabled={ocupado} className="btn-verde w-full py-3 disabled:opacity-60">
                {ocupado ? "Salvando…" : "Salvar senha nova"}
              </button>
              <p className="text-xs text-texto-2">
                Ao salvar, os outros aparelhos em que esta conta estiver aberta são desconectados.
              </p>
            </form>
          )}

          {estado === "feito" && (
            <p className="text-sm text-verde">Senha alterada. Levando você para a tela de entrada…</p>
          )}
        </div>
      </main>
    </div>
  );
}
