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
import BotaoTema from "@/components/shell/BotaoTema";
import { SETORES, type ItemMenu, type SetorId } from "@/lib/setores";
import Avatar from "@/components/shell/Avatar";
import { useNaoLidosSuporte } from "@/components/suporte/useNaoLidos";

/** Itens que todo membro da equipe tem, qualquer que seja o setor. */
const GERAL: ItemMenu[] = [
  { href: "/admin", rotulo: "Matriz", icone: "◈" },
  { href: "/admin/tarefas", rotulo: "Tarefas", icone: "☑" },
];

export default function AdminShell({
  children, nome, papel, setores, avatar = null,
}: { children: React.ReactNode; nome: string; papel: string; setores: SetorId[]; avatar?: string | null }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // 10.2: selo de chamados esperando a equipe (só para quem atua no Suporte)
  const naoLidos = useNaoLidosSuporte(setores.includes("suporte"));
  const selo: Record<string, number> = { "/admin/suporte": naoLidos };
  // "/admin" só fica ativo na raiz; os demais casam por prefixo
  const ativo = (href: string) => (href === "/admin" ? caminho === "/admin" : caminho.startsWith(href));

  // o menu mostra só os setores do membro; a trava de verdade é no servidor
  const GRUPOS = [
    { titulo: "Geral", itens: GERAL },
    ...SETORES.filter((st) => setores.includes(st.id)).map((st) => ({ titulo: st.nome, itens: st.itens })),
  ];
  // o item mais específico vence: "/admin/juridico/lgpd" não acende "/admin/juridico"
  const todos = GRUPOS.flatMap((g) => g.itens);
  const maisEspecifico = todos
    .filter((i) => ativo(i.href))
    .sort((x, y) => y.href.length - x.href.length)[0];
  const aceso = (href: string) => maisEspecifico?.href === href;

  const titulo = maisEspecifico?.rotulo ?? "Central Arini";

  const navegacao = (
    <>
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="mb-4">
          <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase text-texto-2">
            {g.titulo}
          </p>
          <div className="space-y-0.5">
            {g.itens.map((i) => (
              <Link key={g.titulo + i.href} href={i.href} onClick={() => setAberto(false)}
                className={
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                  (aceso(i.href)
                    ? "bg-verde/12 text-verde font-medium"
                    : "text-texto-2 hover:text-texto hover:bg-superficie-2")
                }>
                <span className="w-4 text-center">{i.icone}</span> {i.rotulo}
                {!!selo[i.href] && (
                  <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-ouro text-[#06140D] text-[10px] font-semibold grid place-items-center"
                    title="Chamados com mensagem nova do cliente">
                    {selo[i.href] > 99 ? "99+" : selo[i.href]}
                  </span>
                )}
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
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar nome={nome} url={avatar} tamanho={34} />
            <div className="min-w-0">
              <p className="text-sm text-texto truncate">{nome}</p>
              <p className="text-xs text-texto-2">{papel}</p>
            </div>
          </div>
          <div className="mt-2 flex gap-3 text-xs flex-wrap">
            <Link href="/conta" className="text-verde hover:underline">Minha conta</Link>
            <Link href="/conta/seguranca" className="text-verde hover:underline">Minha segurança</Link>
            <Link href="/" className="text-texto-2 hover:text-texto">Site</Link>
          </div>
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
            <BotaoTema />
            <Link href="/mapa" className="hidden sm:inline-block rounded-lg border border-linha px-3 py-1.5 text-xs text-texto-2 hover:text-texto hover:bg-superficie-2 transition">
              Ver mapa público
            </Link>
            <Link href="/conta" aria-label="Minha conta" title="Minha conta">
              {avatar ? <Avatar nome={nome} url={avatar} tamanho={36} /> : (
                <span className="w-9 h-9 rounded-full bg-verde-escuro border border-verde/30 grid place-items-center text-xs text-verde">
                  {(nome || "A").slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
