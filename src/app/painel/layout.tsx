import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { acessoDe } from "@/lib/planos-servidor";
import { PAPEL_LABEL } from "@/lib/perfis";
import AppShell from "@/components/shell/AppShell";
import AbasPainel from "@/components/painel/AbasPainel";

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (["admin_central", "analista_arini"].includes(user.role)) redirect("/admin");

  // só para a saudação: o plano nunca derruba o painel
  const plano = await acessoDe(user.id).then((a) => a.planNome ?? null).catch(() => null);
  const primeiroNome = (user.nome || "").trim().split(/\s+/)[0];

  return (
    <AppShell usuario={{ nome: user.nome || "Conta", papel: "Anunciante", avatar: user.avatarUrl }} busca={false}>
      <div className="mx-auto w-full max-w-[1280px] md:px-4 md:pt-4">
        <header className="mb-8 md:mb-10">
          <p className="lp-eyebrow">Área do cliente</p>
          <p className="lp-display mt-3 text-3xl md:text-[2.5rem] text-texto text-balance">
            Olá{primeiroNome ? <>, <span className="text-verde">{primeiroNome}</span></> : ""}
          </p>
          <p className="mt-3 text-base text-texto-2">
            {PAPEL_LABEL[user.role] ?? "Anunciante"}
            {plano && <> · plano <strong className="font-semibold text-texto">{plano}</strong></>}
          </p>
          <div className="mt-6">
            <AbasPainel />
          </div>
        </header>
        <div className="pb-12">{children}</div>
      </div>
    </AppShell>
  );
}
