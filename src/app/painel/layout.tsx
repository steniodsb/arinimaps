import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AppShell from "@/components/shell/AppShell";

const ABAS = [
  { href: "/painel", rotulo: "Meus imóveis" },
  { href: "/painel/oportunidades", rotulo: "Minhas oportunidades" },
  { href: "/painel/novo", rotulo: "Anunciar" },
];

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (["admin_central", "analista_arini"].includes(user.role)) redirect("/admin");

  return (
    <AppShell usuario={{ nome: user.nome || "Conta", papel: "Anunciante" }} busca={false}>
      <nav className="flex gap-1.5 mb-5 overflow-x-auto">
        {ABAS.map((a) => (
          <Link key={a.href} href={a.href} className="chip px-4 py-2 text-sm whitespace-nowrap">
            {a.rotulo}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
