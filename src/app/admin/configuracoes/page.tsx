import { supabaseAdmin } from "@/lib/supabase/admin";
import { comPadroes } from "@/lib/configuracoes";
import { currentUser } from "@/lib/supabase/server";
import ConfiguracoesForm from "./ConfiguracoesForm";

export default async function AdminConfiguracoes() {
  const [{ data }, user] = await Promise.all([
    supabaseAdmin().from("settings").select("chave, valor"),
    currentUser(),
  ]);

  // integrações vêm de variável de ambiente (chave nunca no navegador):
  // aqui a tela só mostra se estão ligadas.
  const integracoes = [
    { nome: "Resend (e-mails automáticos)", ligado: !!process.env.RESEND_API_KEY,
      dica: "Sem isso, leads e avisos ficam só no painel." },
    { nome: "Asaas (cobrança)", ligado: !!process.env.ASAAS_API_KEY,
      dica: "Habilita “Cobrar via Asaas” nas faturas." },
    { nome: "MapTiler (satélite licenciado)", ligado: !!process.env.NEXT_PUBLIC_MAPTILER_KEY,
      dica: "Sem isso, o satélite usa a fonte de demonstração." },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Configurações do sistema</h1>
        <p className="text-sm text-texto-2">
          O que você mudar aqui vale imediatamente no site, no mapa e nas regras comerciais.
        </p>
      </div>

      <ConfiguracoesForm
        inicial={comPadroes(data ?? [])}
        ehDiretoria={user?.role === "admin_central"}
      />

      <section className="cartao p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-texto text-lg">🔌 Integrações</h2>
          <p className="text-sm text-texto-2">
            Configuradas no servidor por segurança (as chaves nunca chegam ao navegador).
            Peça ao desenvolvedor para ligar as que faltam.
          </p>
        </div>
        <div className="divide-y divide-linha">
          {integracoes.map((i) => (
            <div key={i.nome} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-56">
                <p className="font-medium text-sm">{i.nome}</p>
                <p className="text-xs text-texto-2">{i.dica}</p>
              </div>
              <span className={`text-xs rounded-full px-3 py-1 font-medium ${i.ligado ? "bg-verde/10 text-verde" : "bg-superficie-2 text-texto-2"}`}>
                {i.ligado ? "ligada" : "não configurada"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
