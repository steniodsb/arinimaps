import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { currentUser } from "@/lib/supabase/server";

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (["admin_central", "analista_arini"].includes(user.role)) redirect("/admin");

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <div className="bg-white border-b border-linha">
        <nav className="mx-auto max-w-5xl px-4 flex gap-6 text-sm">
          <a href="/painel" className="py-3 font-medium text-verde-escuro hover:text-verde">Meus imóveis</a>
          <a href="/painel/oportunidades" className="py-3 font-medium text-verde-escuro hover:text-verde">Minhas oportunidades</a>
          <a href="/painel/novo" className="py-3 font-medium text-verde-escuro hover:text-verde">Anunciar</a>
        </nav>
      </div>
      <main className="mx-auto max-w-5xl w-full px-4 py-8 flex-1">{children}</main>
    </div>
  );
}
