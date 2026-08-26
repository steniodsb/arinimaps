import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";

const MENU = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/imoveis", label: "Imóveis" },
  { href: "/admin/funil", label: "Funil comercial" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/cadastros", label: "Cadastros" },
  { href: "/admin/comissoes", label: "Comissões" },
  { href: "/admin/mensalidades", label: "Mensalidades" },
  { href: "/admin/cartografia", label: "Cartografia" },
  { href: "/admin/relatorios", label: "Relatórios" },
  { href: "/admin/auditoria", label: "Auditoria" },
  { href: "/admin/regioes", label: "Regiões" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!["admin_central", "analista_arini"].includes(user.role)) redirect("/");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-verde-escuro text-white flex flex-col">
        <Link href="/" className="px-5 h-14 flex items-center font-semibold border-b border-white/10">
          Arini <span className="text-ouro ml-1">Maps</span>
        </Link>
        <nav className="flex-1 py-4 space-y-1 text-sm">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href}
              className="block px-5 py-2 text-white/80 hover:text-white hover:bg-white/5">
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-white/50 border-t border-white/10">
          {user.nome} · Central Arini
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 lg:p-8">{children}</main>
    </div>
  );
}
