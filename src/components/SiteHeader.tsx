import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";

export default async function SiteHeader() {
  const user = await currentUser();
  const painelHref =
    user?.role === "admin_central" || user?.role === "analista_arini"
      ? "/admin"
      : "/painel";

  return (
    <header className="bg-verde-escuro text-white">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold tracking-tight text-lg">
          Arini <span className="text-ouro">Imóveis Brasil</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/mapa" className="hover:text-ouro">Mapa</Link>
          <Link href="/painel/novo" className="hover:text-ouro">Anunciar imóvel</Link>
          {user ? (
            <Link
              href={painelHref}
              className="rounded-full bg-ouro/90 text-verde-escuro font-medium px-4 py-1.5 hover:bg-ouro"
            >
              {user.nome?.split(" ")[0] || "Painel"}
            </Link>
          ) : (
            <Link
              href="/entrar"
              className="rounded-full bg-ouro/90 text-verde-escuro font-medium px-4 py-1.5 hover:bg-ouro"
            >
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
