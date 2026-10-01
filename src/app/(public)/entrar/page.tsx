"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatarCPF, validarDocumento } from "@/lib/br/documentos";
import { lerCarPendente } from "@/lib/map/carPendente";
import { SENHA_MIN, validarSenha } from "@/lib/seguranca/senha";
import { REGISTRO_LABEL, ehParceiro as papelEhParceiro, podeAnunciar } from "@/lib/perfis";

const PERFIS = [
  { value: "comprador", label: "Quero comprar / procurar imóvel" },
  { value: "consulta", label: "Quero apenas consultar áreas e dados" },
  { value: "proprietario", label: "Sou proprietário" },
  { value: "imobiliaria", label: "Sou imobiliária" },
  { value: "corretor", label: "Sou corretor autônomo" },
  { value: "engenheiro", label: "Sou engenheiro / profissional" },
  { value: "leiloeiro", label: "Sou leiloeiro" },
];

const INPUT = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition";
const ROTULO = "block text-sm font-medium text-texto mb-1";

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "cadastro" | "recuperar" | "mfa">("login");
  const [aviso, setAviso] = useState("");
  const [codigoMfa, setCodigoMfa] = useState("");
  const [destino, setDestino] = useState("/painel");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [form, setForm] = useState({
    nome: "", email: "", senha: "", telefone: "", cpf: "", role: "comprador",
    razao_social: "", registro_profissional: "",
  });
  const [aceite, setAceite] = useState(false);
  // veio de "Esta área é minha": quem cria conta nesse caminho é proprietário
  useEffect(() => {
    if (lerCarPendente()) setForm((f) => ({ ...f, role: "proprietario" }));
    const q = new URLSearchParams(window.location.search);
    if (q.get("recuperar")) setModo("recuperar");
    // a Central mandou de volta: a sessão existe, falta confirmar o segundo fator
    if (q.get("mfa")) { setDestino("/admin"); setModo("mfa"); }
    if (q.get("expirou")) {
      supabaseBrowser().auth.signOut();
      setAviso("Sua sessão na Central expirou. Entre de novo.");
    }
  }, []);

  const ehParceiro = papelEhParceiro(form.role);
  const docInvalido = form.cpf.length > 0 && !validarDocumento(form.cpf).ok;

  function destinoDe(role: string) {
    // clicou numa área do CAR antes de entrar: volta direto para anunciá-la
    const carPendente = lerCarPendente();
    const anuncia = podeAnunciar(role);
    return role === "admin_central" || role === "analista_arini" ? "/admin"
      : carPendente && anuncia ? `/painel/novo?car=${encodeURIComponent(carPendente)}`
      : ["comprador", "consulta"].includes(role) ? "/mapa"
      : "/painel";
  }

  // O login passa pelo servidor: é lá que as tentativas são contadas e registradas.
  async function entrar() {
    const res = await fetch("/api/auth/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, senha: form.senha }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Não foi possível entrar.");
    const para = destinoDe(data.role);
    if (data.mfa) {
      // conta com segundo fator: a sessão só vale depois do código
      setDestino(para);
      setModo("mfa");
      setCarregando(false);
      return;
    }
    router.push(para);
    router.refresh();
  }

  async function confirmarMfa() {
    const supabase = supabaseBrowser();
    const { data: fatores } = await supabase.auth.mfa.listFactors();
    const fator = fatores?.totp?.find((f) => f.status === "verified");
    if (!fator) throw new Error("Nenhum segundo fator ativo nesta conta.");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigoMfa.replace(/[^0-9]/g, "") });
    await fetch("/api/auth/evento", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento: error ? "mfa_falhou" : "mfa_ok" }),
    }).catch(() => undefined);
    if (error) throw new Error("Código incorreto ou vencido. Confira o aplicativo e tente de novo.");
    router.push(destino);
    router.refresh();
  }

  async function pedirRecuperacao() {
    const res = await fetch("/api/auth/recuperar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar o link.");
    setAviso(data.mensagem);
    setCarregando(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    setAviso("");
    try {
      if (modo === "recuperar") { await pedirRecuperacao(); return; }
      if (modo === "mfa") { await confirmarMfa(); return; }
      if (modo === "cadastro") {
        const problema = validarSenha(form.senha);
        if (problema) throw new Error(problema);
        const res = await fetch("/api/cadastro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, aceite_termos: aceite }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha no cadastro.");
      }
      await entrar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Algo deu errado.");
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-fundo">
      <div className="px-4 py-4 border-b border-linha">
        <Link href="/" className="font-semibold text-texto">
          Arini <span className="texto-ouro">Maps</span>
        </Link>
      </div>

      <main className="flex-1 flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-md cartao p-6 space-y-3.5">
          {(modo === "recuperar" || modo === "mfa") && (
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-texto">
                {modo === "recuperar" ? "Recuperar a senha" : "Confirme que é você"}
              </h1>
              <p className="text-sm text-texto-2">
                {modo === "recuperar"
                  ? "Informe o e-mail da conta. Enviamos um link de uso único para criar uma senha nova."
                  : "Digite o código de 6 dígitos do seu aplicativo autenticador."}
              </p>
            </div>
          )}

          <div className={"rounded-xl overflow-hidden border border-linha text-sm font-medium " + (modo === "login" || modo === "cadastro" ? "flex" : "hidden")}>
            {(["login", "cadastro"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setModo(m); setErro(""); setAviso(""); }}
                className={
                  "flex-1 py-2.5 transition " +
                  (modo === m ? "bg-verde text-[#06140D]" : "bg-superficie-2 text-texto-2 hover:text-texto")
                }>
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {modo === "cadastro" && (
            <>
              <div>
                <label className={ROTULO} htmlFor="perfil">Como você usa o sistema</label>
                <select id="perfil" className={INPUT} value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {PERFIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className={ROTULO} htmlFor="nome">Nome completo *</label>
                <input id="nome" required placeholder="Como no documento" className={INPUT}
                  value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>

              <div>
                <label className={ROTULO} htmlFor="cpf">
                  {form.role === "imobiliaria" ? "CPF ou CNPJ *" : "CPF *"}
                </label>
                <input id="cpf" required inputMode="numeric" placeholder="000.000.000-00"
                  className={INPUT + (docInvalido ? " border-critico focus:ring-critico" : "")}
                  value={formatarCPF(form.cpf)}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
                <p className={"text-xs mt-1 " + (docInvalido ? "text-critico" : "text-texto-2")}>
                  {docInvalido
                    ? "Documento inválido — confira os números."
                    : "Identifica a conta e mantém cada negociação rastreável."}
                </p>
              </div>

              <div>
                <label className={ROTULO} htmlFor="tel">WhatsApp / telefone</label>
                <input id="tel" placeholder="(34) 90000-0000" className={INPUT}
                  value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>

              {ehParceiro && (
                <>
                  <div>
                    <label className={ROTULO} htmlFor="razao">
                      {form.role === "imobiliaria" ? "Razão social" : "Nome profissional"}
                    </label>
                    <input id="razao" className={INPUT}
                      value={form.razao_social}
                      onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
                  </div>
                  <div>
                    <label className={ROTULO} htmlFor="registro">
                      {REGISTRO_LABEL[form.role] ?? "Registro profissional"}
                    </label>
                    <input id="registro" className={INPUT}
                      value={form.registro_profissional}
                      onChange={(e) => setForm({ ...form, registro_profissional: e.target.value })} />
                  </div>
                </>
              )}
            </>
          )}

          {modo === "mfa" && (
            <div>
              <label className={ROTULO} htmlFor="mfa">Código de verificação</label>
              <input id="mfa" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                placeholder="000 000" className={INPUT + " tracking-[0.4em] text-center text-lg"}
                value={codigoMfa} onChange={(e) => setCodigoMfa(e.target.value)} />
            </div>
          )}

          <div className={modo === "mfa" ? "hidden" : ""}>
            <label className={ROTULO} htmlFor="email">E-mail *</label>
            <input id="email" required={modo !== "mfa"} type="email" placeholder="seu@email.com" className={INPUT}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          {(modo === "login" || modo === "cadastro") && (
            <div>
              <label className={ROTULO} htmlFor="senha">Senha *</label>
              <input id="senha" required type="password" className={INPUT}
                autoComplete={modo === "login" ? "current-password" : "new-password"}
                placeholder={modo === "login" ? "Sua senha" : `Mínimo ${SENHA_MIN} caracteres, com letras e números`}
                value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
              {modo === "login" && (
                <button type="button" onClick={() => { setModo("recuperar"); setErro(""); setAviso(""); }}
                  className="mt-1.5 text-xs text-verde hover:underline">
                  Esqueci minha senha
                </button>
              )}
            </div>
          )}

          {modo === "cadastro" && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-texto-2">
                <input type="checkbox" required checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
                <span>
                  Li e aceito os{" "}
                  <Link href="/termos/termos-de-uso" target="_blank" className="text-verde underline">Termos de Uso</Link>
                  {ehParceiro && <>, o{" "}
                    <Link href="/termos/parceiros" target="_blank" className="text-verde underline">Termo de Parceria</Link>
                  </>}
                  {" "}e a{" "}
                  <Link href="/termos/privacidade" target="_blank" className="text-verde underline">Política de Privacidade</Link>.
                </span>
              </label>
              {!["comprador", "consulta"].includes(form.role) && (
                <p className="text-xs text-texto-2">
                  Cadastros de proprietário e parceiro passam pela análise da Arini antes de anunciar.
                </p>
              )}
            </div>
          )}
          {erro && <p className="text-sm text-critico">{erro}</p>}
          {aviso && <p className="text-sm text-verde">{aviso}</p>}

          <button disabled={carregando} className="btn-verde w-full py-3 disabled:opacity-60">
            {carregando ? "Aguarde…"
              : modo === "login" ? "Entrar"
              : modo === "cadastro" ? "Criar conta"
              : modo === "recuperar" ? "Enviar link"
              : "Confirmar código"}
          </button>

          {(modo === "recuperar" || modo === "mfa") && (
            <button type="button" className="w-full text-xs text-texto-2 hover:text-texto"
              onClick={async () => {
                if (modo === "mfa") await supabaseBrowser().auth.signOut();
                setModo("login"); setErro(""); setAviso(""); setCodigoMfa("");
              }}>
              ← Voltar para o login
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
