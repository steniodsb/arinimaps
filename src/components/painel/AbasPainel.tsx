"use client";

/**
 * Navegação da área do cliente (/painel): abas com ícone e estado ativo.
 * No celular rola na horizontal dentro do próprio trilho — a página não rola de lado.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, Handshake, PlusCircle, Map as MapIcon, Users, LifeBuoy, UserRound, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const ABAS: { href: string; rotulo: string; icone: LucideIcon }[] = [
  { href: "/painel", rotulo: "Meus imóveis", icone: Building2 },
  { href: "/painel/oportunidades", rotulo: "Minhas oportunidades", icone: Handshake },
  { href: "/painel/novo", rotulo: "Anunciar", icone: PlusCircle },
  { href: "/painel/cartografia", rotulo: "Mapa: solicitações", icone: MapIcon },
  { href: "/painel/organizacao", rotulo: "Organização", icone: Users },
  { href: "/suporte", rotulo: "Suporte", icone: LifeBuoy },
  { href: "/conta", rotulo: "Minha conta", icone: UserRound },
  { href: "/conta/seguranca", rotulo: "Segurança da conta", icone: ShieldCheck },
];

export default function AbasPainel() {
  const caminho = usePathname();
  // a aba mais específica que casa com o caminho é a ativa (/painel não "engole" /painel/novo)
  const ativa = ABAS
    .filter((a) => caminho === a.href || caminho.startsWith(a.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Área do cliente" className="border-b border-linha">
      <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ABAS.map(({ href, rotulo, icone: Icone }) => {
          const ativo = href === ativa;
          return (
            <Link key={href} href={href} aria-current={ativo ? "page" : undefined}
              className={
                "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[0.95rem] transition-colors " +
                (ativo
                  ? "border-verde text-texto font-semibold"
                  : "border-transparent text-texto-2 hover:text-texto hover:border-linha-forte")
              }>
              <Icone className={`size-[18px] ${ativo ? "text-verde" : ""}`} />
              {rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
