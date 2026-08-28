"use client";

/**
 * Casca da Central Arini (back-office), no mesmo design system do produto:
 * sidebar escura com grupos, estado ativo em verde e gaveta no celular.
 *
 * Separada de AppShell porque o menu, os grupos e o rodapé são outros —
 * mas os tokens, raios e estados de hover são exatamente os mesmos.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/shell/AppShell";

const GRUPOS: { titulo: string; itens: { href: string; rotulo: string; icone: string }[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/admin", rotulo: "Dashboard", icone: "◫" },
      { href: "/admin/imoveis", rotulo: "Imóveis", icone: "▦" },
      { href: "/admin/cadastros", rotulo: "Cadastros", icone: "✓" },
      { href: "/admin/cartografia", rotulo: "Cartografia", icone: "🗺" },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      { href: "/admin/funil", rotulo: "Funil comercial", icone: "⇉" },
      { href: "/admin/leads", rotulo: "Leads", icone: "◎" },
      { href: "/admin/comissoes", rotulo: "Comissões", icone: "％" },
      { href: "/admin/mensalidades", rotulo: "Mensalidades", icone: "₿" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/admin/relatorios", rotulo: "Relatórios", icone: "▤" },
      { href: "/admin/auditoria", rotulo: "Auditoria", icone: "⧉" },
      { href: "/admin/regioes", rotulo: "Regiões", icone: "⊕" },
      { href: "/admin/usuarios", rotulo: "Usuários", icone: "☺" },
      { href: "/admin/configuracoes", rotulo: "Configurações", icone: "⚙" },
    ],
  },
];

export default function AdminShell({
  children, nome, papel,
}: { children: React.ReactNode; nome: string; papel: string }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // "/admin" só fica ativo na raiz; os demais casam por prefixo
  const ativo = (href: string) => (href === "/admin" ? caminho === "/admin" : caminho.startsWith(href));

  const titulo =
    GRUPOS.flatMap((g) => g.itens).find((i) => ativo(i.href))?.rotulo ?? "Central Arini";

  const navegacao = (
    <>
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="mb-4">
          <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-texto-2">
            {g.titulo}
          </p>
          <div className="space-y-0.5">
            {g.itens.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setAberto(false)}
                className={
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                  (ativo(i.href)
                    ? "bg-verde/12 text-verde font-medium"
                    : "text-texto-2 hover:text-texto hover:bg-superficie-2")
                }>
                <span className="w-4 text-center">{i.icone}</span> {i.rotulo}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-fundo flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-superficie border-r border-linha">
        <Link href="/" className="px-5 h-16 flex items-center border-b border-linha">
          <Logo />
        </Link>
        <nav className="flex-1 overflow-y-auto p-3">{navegacao}</nav>
        <div className="p-4 border-t border-linha">
          <p className="text-sm text-texto truncate">{nome}</p>
          <p className="text-xs text-texto-2">{papel}</p>
          <Link href="/" className="mt-2 inline-block text-xs text-verde hover:underline">
            ← Voltar ao site
          </Link>
        </div>
      </aside>

      {/* gaveta no celular */}
      {aberto && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <aside className="relative w-64 bg-superficie border-r border-linha flex flex-col">
            <div className="px-5 h-16 flex items-center border-b border-linha"><Logo /></div>
            <nav className="flex-1 overflow-y-auto p-3">{navegacao}</nav>
            <div className="p-4 border-t border-linha">
              <p className="text-sm text-texto truncate">{nome}</p>
              <p className="text-xs text-texto-2">{papel}</p>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-linha bg-superficie flex items-center gap-3 px-4">
          <button onClick={() => setAberto(true)} aria-label="Abrir menu"
            className="lg:hidden w-9 h-9 rounded-lg text-texto-2 hover:text-texto hover:bg-superficie-2 transition">
            ☰
          </button>
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.22em] uppercase text-texto-2">Central Arini</p>
            <p className="text-sm font-medium text-texto truncate">{titulo}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/mapa" className="hidden sm:inline-block rounded-lg border border-linha px-3 py-1.5 text-xs text-texto-2 hover:text-texto hover:bg-superficie-2 transition">
              Ver mapa público
            </Link>
            <span className="w-9 h-9 rounded-full bg-verde-escuro border border-verde/30 grid place-items-center text-xs text-verde">
              {(nome || "A").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
