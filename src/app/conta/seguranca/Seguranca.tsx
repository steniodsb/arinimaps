"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SENHA_MIN, validarSenha } from "@/lib/seguranca/senha";

type Evento = { id: string; evento: string; ip: string | null; agente: string | null; created_at: string };
type Fator = { id: string; status: string; friendly_name?: string | null; created_at: string };

const input = "w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition";

const EVENTO: Record<string, string> = {
  login_ok: "Entrada na conta", login_falhou: "Tentativa com senha errada", login_bloqueado: "Tentativas bloqueadas",
  logout: "Saída", recuperacao_pedida: "Pedido de recuperação de senha", senha_redefinida: "Senha redefinida pelo link",
  senha_alterada: "Senha trocada", mfa_ativado: "Segundo fator ativado", mfa_desativado: "Segundo fator desativado",
  mfa_ok: "Segundo fator confirmado", mfa_falhou: "Código do segundo fator errado", sessoes_encerradas: "Outras sessões encerradas",
};

const registrar = (evento: string) =>
  fetch("/api/auth/evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evento }) })
    .catch(() => undefined);

export default function Seguranca({
  eventos, obrigatorio, exigidoDaEquipe,
}: { eventos: Evento[]; obrigatorio: boolean; exigidoDaEquipe: boolean }) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  // ---------- segundo fator ----------
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [cadastro, setCadastro] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erroMfa, setErroMfa] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregarFatores = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFatores((data?.all ?? []) as Fator[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { carregarFatores(); }, [carregarFatores]);

  const ativo = fatores?.find((f) => f.status === "verified") ?? null;

  async function iniciarCadastro() {
    setOcupado(true); setErroMfa("");
    // sobras de um cadastro que não foi concluído impedem um novo com o mesmo nome
    for (const f of fatores ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Arini Maps ${Date.now()}` });
    setOcupado(false);
    if (error || !data) { setErroMfa(error?.message ?? "Não foi possível iniciar."); return; }
    setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
  }

  async function confirmarCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (!cadastro) return;
    setOcupado(true); setErroMfa("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo.replace(/[^0-9]/g, "") });
    setOcupado(false);
    if (error) { setErroMfa("Código incorreto. Confira o aplicativo e o horário do celular."); return; }
    await registrar("mfa_ativado");
    setCadastro(null); setCodigo("");
    await carregarFatores();
    router.refresh();
  }

  async function desativar() {
    if (!ativo) return;
    if (!window.confirm("Desativar o segundo fator? A conta volta a depender só da senha.")) return;
    setOcupado(true); setErroMfa("");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: ativo.id });
    setOcupado(false);
    if (error) {
      setErroMfa(/aal2/i.test(error.message)
        ? "Para desativar, saia e entre de novo confirmando o código do aplicativo."
        : error.message);
      return;
    }
    await registrar("mfa_desativado");
    await carregarFatores();
    router.refresh();
  }

  // ---------- senha ----------
  const [senha, setSenha] = useState({ atual: "", nova: "", confirma: "" });
  const [msgSenha, setMsgSenha] = useState<{ ok: boolean; texto: string } | null>(null);

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setMsgSenha(null);
    const problema = validarSenha(senha.nova);
    if (problema) { setMsgSenha({ ok: false, texto: problema }); return; }
    if (senha.nova !== senha.confirma) { setMsgSenha({ ok: false, texto: "As duas senhas novas não são iguais." }); return; }
    setOcupado(true);
    const res = await fetch("/api/auth/redefinir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: senha.nova, senha_atual: senha.atual }),
    });
    setOcupado(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsgSenha({ ok: false, texto: data.error ?? "Não foi possível trocar a senha." }); return; }
    setSenha({ atual: "", nova: "", confirma: "" });
    setMsgSenha({ ok: true, texto: "Senha trocada. Os outros aparelhos foram desconectados." });
    router.refresh();
  }

  // ---------- sessões ----------
  const [msgSessao, setMsgSessao] = useState("");
  async function encerrarOutras() {
    setOcupado(true);
    await supabase.auth.signOut({ scope: "others" });
    await registrar("sessoes_encerradas");
    setOcupado(false);
    setMsgSessao("Pronto: só este aparelho continua conectado.");
    router.refresh();
  }
  async function sair() {
    await registrar("logout");
    await supabase.auth.signOut();
    router.push("/entrar");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {(obrigatorio || (exigidoDaEquipe && fatores && !ativo)) && (
        <p className="rounded-xl border border-ouro/50 bg-ouro/10 px-4 py-3 text-sm text-texto">
          A diretoria exige o segundo fator para as contas da equipe. Ative-o abaixo para voltar à Central.
        </p>
      )}

      <section className="cartao p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-texto text-lg">Verificação em duas etapas</h2>
            <p className="text-sm text-texto-2">
              Além da senha, o login pede um código de 6 dígitos gerado no seu celular. Quem descobrir a
              senha não entra sem o aparelho.
            </p>
          </div>
          {fatores && (
            <span className={"text-xs rounded-full px-3 py-1 " + (ativo ? "bg-verde/10 text-verde" : "bg-alerta/10 text-alerta")}>
              {ativo ? "ativa" : "desativada"}
            </span>
          )}
        </div>

        {!fatores && <p className="text-sm text-texto-2">Carregando…</p>}

        {fatores && !ativo && !cadastro && (
          <button onClick={iniciarCadastro} disabled={ocupado} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">
            Ativar com aplicativo autenticador
          </button>
        )}

        {cadastro && (
          <form onSubmit={confirmarCadastro} className="space-y-4">
            <ol className="text-sm text-texto-2 space-y-1 list-decimal pl-5">
              <li>Instale um autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy).</li>
              <li>No aplicativo, escolha adicionar conta e aponte a câmera para o código abaixo.</li>
              <li>Digite aqui o código de 6 dígitos que o aplicativo mostrar.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cadastro.qr} alt="Código QR para o aplicativo autenticador" className="w-44 h-44 rounded-xl bg-white p-2" />
              <div className="text-xs text-texto-2 space-y-1">
                <p>Sem câmera? Digite esta chave no aplicativo:</p>
                <p className="font-mono text-texto break-all select-all max-w-56">{cadastro.segredo}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-texto mb-1" htmlFor="cod">Código do aplicativo</label>
                <input id="cod" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000 000"
                  className={input + " w-40 tracking-[0.35em] text-center"} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </div>
              <button disabled={ocupado} className="btn-verde px-5 py-2.5 text-sm disabled:opacity-60">Confirmar e ativar</button>
              <button type="button" onClick={() => { setCadastro(null); setCodigo(""); }} className="text-sm text-texto-2 hover:text-texto">Cancelar</button>
            </div>
          </form>
        )}

        {ativo && (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <p className="text-texto-2">
              Ativa desde {new Date(ativo.created_at).toLocaleDateString("pt-BR")}. Trocou de celular? Desative e ative de novo no aparelho novo.
            </p>
            <button onClick={desativar} disabled={ocupado} className="rounded-lg border border-critico/50 text-critico px-4 py-2 text-xs">
              Desativar
            </button>
          </div>
        )}
        {erroMfa && <p className="text-sm text-critico">{erroMfa}</p>}
      </section>

      <section className="cartao p-6 space-y-4">
        <h2 className="font-semibold text-texto text-lg">Trocar a senha</h2>
        <form onSubmit={trocarSenha} className="grid gap-3 sm:grid-cols-3">
          <input required type="password" autoComplete="current-password" className={input} placeholder="Senha atual"
            value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} />
          <input required type="password" autoComplete="new-password" className={input} placeholder={`Nova (mín. ${SENHA_MIN})`}
            value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} />
          <input required type="password" autoComplete="new-password" className={input} placeholder="Repita a nova"
            value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} />
          <button disabled={ocupado} className="btn-contorno px-5 py-2.5 text-sm sm:col-span-3 justify-self-start disabled:opacity-60">
            Trocar senha
          </button>
        </form>
        {msgSenha && <p className={"text-sm " + (msgSenha.ok ? "text-verde" : "text-critico")}>{msgSenha.texto}</p>}
      </section>

      <section className="cartao p-6 space-y-3">
        <h2 className="font-semibold text-texto text-lg">Sessões</h2>
        <p className="text-sm text-texto-2">
          Se você entrou num computador que não é seu e esqueceu de sair, encerre as outras sessões daqui.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={encerrarOutras} disabled={ocupado} className="btn-contorno px-5 py-2.5 text-sm disabled:opacity-60">
            Encerrar as outras sessões
          </button>
          <button onClick={sair} className="rounded-lg border border-linha px-5 py-2.5 text-sm text-texto-2 hover:text-texto">
            Sair deste aparelho
          </button>
        </div>
        {msgSessao && <p className="text-sm text-verde">{msgSessao}</p>}
      </section>

      <section className="cartao p-6 space-y-3">
        <h2 className="font-semibold text-texto text-lg">Atividade recente</h2>
        <div className="divide-y divide-linha text-sm">
          {eventos.map((e) => (
            <div key={e.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-texto">{EVENTO[e.evento] ?? e.evento}</span>
              <span className="text-xs text-texto-2">
                {new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{e.ip && ` · ${e.ip}`}
              </span>
            </div>
          ))}
          {!eventos.length && <p className="py-3 text-texto-2">Nenhuma atividade registrada ainda.</p>}
        </div>
        <p className="text-xs text-texto-2">Viu um acesso que não reconhece? Troque a senha e encerre as outras sessões.</p>
      </section>
    </div>
  );
}
