"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

const PERFIS = [
  { value: "comprador", label: "Quero comprar / procurar imóvel" },
  { value: "proprietario", label: "Sou proprietário" },
  { value: "imobiliaria", label: "Sou imobiliária" },
  { value: "corretor", label: "Sou corretor autônomo" },
  { value: "engenheiro", label: "Sou engenheiro / profissional" },
];

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [form, setForm] = useState({
    nome: "", email: "", senha: "", telefone: "", role: "comprador",
    razao_social: "", registro_profissional: "",
  });

  const ehParceiro = ["imobiliaria", "corretor", "engenheiro"].includes(form.role);

  async function entrar() {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.senha });
    if (error) throw new Error("E-mail ou senha incorretos.");
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user!.id).single();
    const role = profile?.role;
    router.push(role === "admin_central" || role === "analista_arini" ? "/admin" : role === "comprador" ? "/" : "/painel");
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

  const input = "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";

  return (
    <div className="min-h-screen flex flex-col bg-areia">
      <div className="bg-verde-escuro text-white px-4 py-3">
        <Link href="/" className="font-semibold">Arini <span className="text-ouro">Maps</span></Link>
      </div>
      <main className="flex-1 flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg p-6 space-y-3">
          <div className="flex rounded-lg overflow-hidden border border-linha text-sm font-medium">
            {(["login", "cadastro"] as const).map((m) => (
              <button
                key={m} type="button" onClick={() => setModo(m)}
                className={`flex-1 py-2 ${modo === m ? "bg-verde text-white" : "bg-white hover:bg-areia"}`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {modo === "cadastro" && (
            <>
              <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {PERFIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <input required placeholder="Nome completo" className={input}
                value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              <input placeholder="WhatsApp / telefone" className={input}
                value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              {ehParceiro && (
                <>
                  <input placeholder={form.role === "imobiliaria" ? "Razão social" : "Nome profissional"} className={input}
                    value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
                  <input placeholder={form.role === "engenheiro" ? "CREA" : "CRECI"} className={input}
                    value={form.registro_profissional} onChange={(e) => setForm({ ...form, registro_profissional: e.target.value })} />
                </>
              )}
            </>
          )}

          <input required type="email" placeholder="E-mail" className={input}
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input required type="password" placeholder="Senha (mínimo 8 caracteres)" className={input}
            value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />

          {modo === "cadastro" && (
            <p className="text-xs text-foreground/60">
              Ao criar a conta você aceita os termos de uso.
              {form.role !== "comprador" && " Cadastros de proprietário e parceiro passam pela análise da Arini antes de anunciar."}
            </p>
          )}
          {erro && <p className="text-sm text-red-700">{erro}</p>}

          <button disabled={carregando}
            className="w-full rounded-lg bg-verde text-white font-semibold py-2.5 hover:bg-verde-escuro disabled:opacity-60">
            {carregando ? "Aguarde…" : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </main>
    </div>
  );
}
