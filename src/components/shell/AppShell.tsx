"use client";

/**
 * Casca da aplicação, igual aos mockups:
 *  - desktop: sidebar fixa à esquerda + topbar com busca e navegação
 *  - mobile: conteúdo em tela cheia + barra inferior com botão de ação central
 *
 * Todas as telas do produto passam por aqui, então a navegação é a mesma
 * no desktop e no celular — muda só a forma.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import BotaoTema from "./BotaoTema";

export type Usuario = { nome: string; papel: string } | null;

const MENU = [
  { href: "/", rotulo: "Início", icone: "⌂" },
  { href: "/mapa", rotulo: "Mapa Interativo", icone: "🗺" },
  { href: "/imoveis", rotulo: "Buscar Imóveis", icone: "⌕" },
  { href: "/relatorios", rotulo: "Relatórios", icone: "▤" },
  { href: "/painel", rotulo: "Meu Painel", icone: "◫" },
];

const ATALHOS = [
  { rotulo: "Consultar CAR", href: "/mapa?camada=car" },
  { rotulo: "Embargos Ambientais", href: "/mapa?camada=ibama_embargos" },
  { rotulo: "Focos de Queimadas", href: "/mapa?camada=inpe_queimadas" },
  { rotulo: "Processos Minerários", href: "/mapa?camada=anm" },
];

const NAV_MOBILE = [
  { href: "/", rotulo: "Início", icone: "⌂" },
  { href: "/mapa", rotulo: "Mapas", icone: "🗺" },
  { href: "/imoveis", rotulo: "Imóveis", icone: "▦" },
  { href: "/painel", rotulo: "Menu", icone: "☰" },
];

export function Logo({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-lg bg-verde-escuro border border-verde/30 grid place-items-center text-ouro text-sm">
        ◈
      </span>
      {!compacto && (
        <span className="leading-none">
          <span className="block font-semibold tracking-wide text-texto text-sm">ARINI</span>
          <span className="block text-[9px] tracking-[0.32em] text-texto-2">IMÓVEIS BRASIL</span>
        </span>
      )}
    </span>
  );
}

export default function AppShell({
  children, usuario, semPadding = false, busca = true,
}: {
  children: React.ReactNode;
  usuario?: Usuario;
  /** telas de mapa ocupam tudo; as demais recebem respiro */
  semPadding?: boolean;
  busca?: boolean;
}) {
  const caminho = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <div className="min-h-screen bg-fundo flex">
      {/* ---------- sidebar (desktop) ---------- */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-superficie border-r border-linha">
        <Link href="/" className="px-5 h-16 flex items-center border-b border-linha">
          <Logo />
        </Link>

        <nav className="p-3 space-y-1">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                (ativo(m.href)
                  ? "bg-verde/12 text-verde font-medium"
                  : "text-texto-2 hover:text-texto hover:bg-superficie-2")
              }>
              <span className="w-4 text-center">{m.icone}</span> {m.rotulo}
            </Link>
          ))}
        </nav>

        <div className="px-3 pt-4">
          <p className="px-3 text-[10px] font-semibold tracking-[0.18em] text-texto-2 uppercase mb-2">
            Acesso rápido
          </p>
          <div className="space-y-1">
            {ATALHOS.map((a) => (
              <Link key={a.rotulo} href={a.href}
                className="flex items-center justify-between rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-xs text-texto-2 hover:text-texto hover:border-verde/40 transition">
                {a.rotulo} <span>›</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-xl bg-verde-escuro/70 border border-linha p-4">
            <p className="text-sm font-semibold text-texto leading-snug">
              Transforme dados em <span className="texto-verde">boas decisões</span>.
            </p>
            <p className="text-xs text-texto-2 mt-1">Inteligência territorial para o seu negócio.</p>
            <Link href="/entrar" className="btn-ouro inline-block mt-3 px-4 py-2 text-xs">Saiba mais</Link>
          </div>
        </div>
      </aside>

      {/* ---------- coluna principal ---------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-linha bg-superficie flex items-center gap-3 px-4">
          <button onClick={() => setMenuAberto(!menuAberto)}
            className="lg:hidden w-9 h-9 rounded-lg text-texto-2 hover:text-texto hover:bg-superficie-2 transition"
            aria-label="Abrir menu">☰</button>

          <Link href="/" className="lg:hidden"><Logo compacto /></Link>

          {busca && (
            <div className="relative flex-1 max-w-xl hidden sm:block">
              <input
                placeholder="Buscar por imóvel, município, estado ou coordenada"
                className="w-full rounded-xl border border-linha bg-superficie-2 pl-10 pr-3 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-2">⌕</span>
            </div>
          )}

          <nav className="hidden xl:flex items-center gap-5 text-sm ml-2">
            {MENU.slice(0, 4).map((m) => (
              <Link key={m.href} href={m.href}
                className={ativo(m.href) ? "text-verde font-medium" : "text-texto-2 hover:text-texto transition"}>
                {m.rotulo.replace("Mapa Interativo", "Mapas").replace("Buscar Imóveis", "Imóveis")}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <BotaoTema />
            <button className="w-9 h-9 rounded-lg text-texto-2 hover:text-texto hover:bg-superficie-2 transition relative"
              aria-label="Notificações">
              ◔<span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-ouro" />
            </button>
            {usuario ? (
              <Link href="/painel" className="flex items-center gap-2 rounded-xl hover:bg-superficie-2 px-2 py-1.5 transition">
                <span className="w-8 h-8 rounded-full bg-verde/15 text-verde grid place-items-center text-sm font-semibold">
                  {usuario.nome.charAt(0).toUpperCase()}
                </span>
                <span className="hidden md:block leading-tight text-left">
                  <span className="block text-xs font-medium text-texto">{usuario.nome.split(" ")[0]}</span>
                  <span className="block text-[10px] text-texto-2">{usuario.papel}</span>
                </span>
              </Link>
            ) : (
              <Link href="/entrar" className="btn-ouro px-4 py-2 text-sm">Entrar</Link>
            )}
          </div>
        </header>

        {/* menu mobile */}
        {menuAberto && (
          <div className="lg:hidden border-b border-linha bg-superficie p-3 space-y-1 anima-subir">
            {MENU.map((m) => (
              <Link key={m.href} href={m.href} onClick={() => setMenuAberto(false)}
                className={
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm " +
                  (ativo(m.href) ? "bg-verde/12 text-verde font-medium" : "text-texto-2")
                }>
                <span className="w-4 text-center">{m.icone}</span> {m.rotulo}
              </Link>
            ))}
          </div>
        )}

        <main className={"flex-1 min-h-0 flex flex-col pb-16 lg:pb-0 " + (semPadding ? "" : "p-4 lg:p-6")}>
          {children}
        </main>
      </div>

      {/* ---------- barra inferior (mobile) ---------- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-superficie border-t border-linha flex items-center justify-around px-2">
        {NAV_MOBILE.slice(0, 2).map((m) => (
          <Link key={m.href} href={m.href}
            className={"flex flex-col items-center gap-0.5 text-[10px] " + (ativo(m.href) ? "text-verde" : "text-texto-2")}>
            <span className="text-lg leading-none">{m.icone}</span>{m.rotulo}
          </Link>
        ))}

        {/* círculo: não usa .btn-verde porque o raio daquela classe venceria o rounded-full */}
        <Link href="/painel/novo"
          aria-label="Anunciar imóvel"
          className="shrink-0 w-14 h-14 -mt-7 rounded-full grid place-items-center text-2xl font-light text-[#06140D] shadow-xl border-4 border-superficie"
          style={{ background: "linear-gradient(180deg, #45D98A 0%, #2FA866 100%)" }}>
          +
        </Link>

        {NAV_MOBILE.slice(2).map((m) => (
          <Link key={m.href} href={m.href}
            className={"flex flex-col items-center gap-0.5 text-[10px] " + (ativo(m.href) ? "text-verde" : "text-texto-2")}>
            <span className="text-lg leading-none">{m.icone}</span>{m.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}
