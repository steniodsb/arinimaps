import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { Logo } from "@/components/shell/AppShell";
import BotaoTema from "@/components/shell/BotaoTema";

/**
 * Cabeçalho do site institucional (página inicial). A área de consultas —
 * mapa, busca, relatórios, painel — usa o AppShell com sidebar; aqui é um
 * site comum, com navegação no topo e o mesmo design system.
 */
const NAV = [
  { href: "/#ferramenta", rotulo: "A ferramenta" },
  { href: "/#consultas", rotulo: "Consultas" },
  { href: "/imoveis", rotulo: "Imóveis" },
  { href: "/#sobre", rotulo: "A Arini" },
];

export default async function SiteHeader() {
  const user = await currentUser();
  const painelHref =
    user?.role === "admin_central" || user?.role === "analista_arini" ? "/admin" : "/painel";

  return (
    <header className="sticky top-0 z-50 border-b border-linha bg-superficie/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
        <Link href="/" aria-label="Arini Imóveis Brasil — início" className="shrink-0">
          <span className="sm:hidden"><Logo compacto /></span>
          <span className="hidden sm:block whitespace-nowrap"><Logo /></span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm ml-6">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-texto-2 hover:text-texto transition">
              {n.rotulo}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <BotaoTema compacto />
          {/* .btn-verde é CSS sem camada e venceria o `hidden` do Tailwind; o span esconde */}
          <span className="hidden sm:block">
            <Link href="/mapa" className="btn-verde px-4 py-2 text-sm whitespace-nowrap">Abrir o mapa</Link>
          </span>
          {user ? (
            <Link href={painelHref} className="btn-contorno px-4 py-2 text-sm">
              {user.nome?.split(" ")[0] || "Painel"}
            </Link>
          ) : (
            <Link href="/entrar" className="btn-ouro px-4 py-2 text-sm">
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
