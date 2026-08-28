"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/mapa", rotulo: "Mapa Interativo", icone: "🗺️" },
  { href: "/imoveis", rotulo: "Buscar Imóveis", icone: "🔍" },
  { href: "/painel", rotulo: "Meu Painel", icone: "📊" },
];

const ATALHOS = [
  { rotulo: "Consultar CAR", chave: "car" },
  { rotulo: "Embargos Ambientais", chave: "ibama_embargos" },
  { rotulo: "Focos de Queimadas", chave: "inpe_queimadas" },
  { rotulo: "Processos Minerários", chave: "anm" },
];

export default function SidebarMapa({ onAtalho }: { onAtalho?: (chave: string) => void }) {
  const caminho = usePathname();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-superficie border-r border-linha">
      <Link href="/" className="px-5 h-16 flex items-center gap-2 border-b border-linha">
        <span className="text-ouro text-xl">◈</span>
        <span className="font-semibold tracking-wide text-texto text-sm">
          ARINI <span className="text-texto-2 font-normal text-xs tracking-[0.2em]">MAPS</span>
        </span>
      </Link>

      <nav className="p-3 space-y-1">
        {MENU.map((m) => {
          const ativo = caminho === m.href;
          return (
            <Link key={m.href} href={m.href}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                (ativo ? "bg-verde/12 text-verde font-medium" : "text-texto-2 hover:text-texto hover:bg-superficie-2")
              }>
              <span>{m.icone}</span> {m.rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pt-4">
        <p className="px-3 text-[10px] font-semibold tracking-[0.18em] text-texto-2 uppercase mb-2">
          Acesso rápido
        </p>
        <div className="space-y-1">
          {ATALHOS.map((a) => (
            <button key={a.chave} onClick={() => onAtalho?.(a.chave)}
              className="w-full flex items-center justify-between rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-xs text-texto-2 hover:text-texto hover:border-verde/40 transition">
              {a.rotulo} <span>›</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto p-4">
        <div className="rounded-xl bg-verde-escuro/60 border border-linha p-4">
          <p className="text-sm font-semibold text-texto leading-snug">
            Transforme dados em <span className="texto-verde">boas decisões</span>.
          </p>
          <p className="text-xs text-texto-2 mt-1">Inteligência territorial para o seu negócio.</p>
          <Link href="/entrar" className="btn-ouro inline-block mt-3 px-4 py-2 text-xs">Saiba mais</Link>
        </div>
      </div>
    </aside>
  );
}
