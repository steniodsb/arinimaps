"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatarCPF, validarDocumento } from "@/lib/br/documentos";

const PERFIS = [
  { value: "comprador", label: "Quero comprar / procurar imóvel" },
  { value: "proprietario", label: "Sou proprietário" },
  { value: "imobiliaria", label: "Sou imobiliária" },
  { value: "corretor", label: "Sou corretor autônomo" },
  { value: "engenheiro", label: "Sou engenheiro / profissional" },
];

const INPUT = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde focus:border-verde transition";
const ROTULO = "block text-sm font-medium text-texto mb-1";

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [form, setForm] = useState({
    nome: "", email: "", senha: "", telefone: "", cpf: "", role: "comprador",
    razao_social: "", registro_profissional: "",
  });

  const ehParceiro = ["imobiliaria", "corretor", "engenheiro"].includes(form.role);
  const docInvalido = form.cpf.length > 0 && !validarDocumento(form.cpf).ok;

  async function entrar() {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.senha });
    if (error) throw new Error("E-mail ou senha incorretos.");
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user!.id).single();
    const role = profile?.role;
    router.push(
      role === "admin_central" || role === "analista_arini" ? "/admin"
        : role === "comprador" ? "/mapa"
        : "/painel"
    );
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      if (modo === "cadastro") {
        const res = await fetch("/api/cadastro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
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
          Arini <span className="texto-ouro">Imóveis Brasil</span>
        </Link>
      </div>

      <main className="flex-1 flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-md cartao p-6 space-y-3.5">
          <div className="flex rounded-xl overflow-hidden border border-linha text-sm font-medium">
            {(["login", "cadastro"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setModo(m); setErro(""); }}
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
                      {form.role === "engenheiro" ? "CREA" : "CRECI"}
                    </label>
                    <input id="registro" className={INPUT}
                      value={form.registro_profissional}
                      onChange={(e) => setForm({ ...form, registro_profissional: e.target.value })} />
                  </div>
                </>
              )}
            </>
          )}

          <div>
            <label className={ROTULO} htmlFor="email">E-mail *</label>
            <input id="email" required type="email" placeholder="seu@email.com" className={INPUT}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <div>
            <label className={ROTULO} htmlFor="senha">Senha *</label>
            <input id="senha" required type="password" placeholder="Mínimo 8 caracteres" className={INPUT}
              value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
          </div>

          {modo === "cadastro" && (
            <p className="text-xs text-texto-2">
              Ao criar a conta você aceita os termos de uso.
              {form.role !== "comprador" && " Cadastros de proprietário e parceiro passam pela análise da Arini antes de anunciar."}
            </p>
          )}
          {erro && <p className="text-sm text-critico">{erro}</p>}

          <button disabled={carregando} className="btn-verde w-full py-3 disabled:opacity-60">
            {carregando ? "Aguarde…" : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </main>
    </div>
  );
}
