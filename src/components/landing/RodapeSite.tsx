import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Box, Mail, MapPinned, MessageCircle, Phone, ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/shell/AppShell";
import { Parallax, Reveal, Stagger } from "./movimento";
import { formatarTelefone } from "./telefone";

type Contato = { whatsapp?: string; email?: string; telefone?: string; site?: string };

const wa = (n: string, msg?: string) =>
  `https://wa.me/${n.replace(/\D/g, "")}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;

/** Faixa de chamada antes do rodapé: barra verde + bloco escuro com foto. */
export function PreRodape({ contato }: { contato: Contato }) {
  const recursos = [
    { icone: MapPinned, titulo: "Divisa no satélite", texto: "A propriedade entra com o polígono real, área medida e alerta quando a área declarada diverge." },
    { icone: Box, titulo: "Tour 3D e vídeo", texto: "Sobrevoo com relevo real da região e vídeo pronto para compartilhar o imóvel." },
    { icone: ShieldCheck, titulo: "Central Arini", texto: "Nenhum anúncio vai ao ar sem conferência, e todo interessado passa pela central." },
  ];
  return (
    <section className="lp-escuro relative" aria-label="Anuncie na Arini">
      <div className="bg-[#2FB86C] text-[#06170F]">
        <div className="lp-container flex flex-col items-center justify-between gap-4 py-6 md:flex-row">
          {contato.whatsapp ? (
            <a href={wa(contato.whatsapp)} target="_blank" rel="noopener noreferrer" className="lp-display flex items-center gap-3 text-2xl md:text-3xl">
              <MessageCircle className="size-7" /> {formatarTelefone(contato.whatsapp)}
            </a>
          ) : (
            <p className="lp-display text-2xl md:text-3xl">Central Arini</p>
          )}
          <p className="text-center text-lg font-semibold md:text-left">Fale com a central: atendimento humano, sem robô.</p>
          <Link href="/suporte" className="lp-btn bg-[#07130E] text-white hover:bg-black">
            Falar com a Arini <ArrowRight />
          </Link>
        </div>
      </div>

      <div className="relative isolate overflow-hidden bg-[#07130E] py-24">
        <Parallax className="!absolute inset-0 -z-10" strength={80}>
          <Image src="/img/aerea-campo.jpg" alt="" fill sizes="100vw" className="object-cover opacity-30" />
        </Parallax>
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(7,19,14,.97),rgba(12,36,25,.86)_50%,rgba(14,44,30,.6))]" />
        <div className="lp-container relative grid gap-12 lg:grid-cols-[0.95fr_2fr] lg:items-center">
          <Reveal>
            <p className="lp-eyebrow">Para proprietários e corretores</p>
            <h2 className="lp-display mt-3 text-4xl text-white md:text-5xl">
              Tem um imóvel na região? <span className="text-[#5FE09A]">Coloque ele no mapa.</span>
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/painel/novo" className="lp-btn lp-btn-verde">Anunciar imóvel <ArrowRight /></Link>
              <Link href="/planos" className="lp-btn lp-btn-claro">Ver planos</Link>
            </div>
          </Reveal>
          <Stagger className="grid gap-10 md:grid-cols-3" gap={0.12}>
            {recursos.map((r) => (
              <div key={r.titulo}>
                <span className="grid size-14 place-items-center rounded-xl bg-[#3FCF7F]/15 text-[#3FCF7F] ring-1 ring-[#3FCF7F]/30">
                  <r.icone className="size-7" strokeWidth={1.7} />
                </span>
                <h3 className="lp-display mt-5 text-2xl text-white">{r.titulo}</h3>
                <p className="mt-3 text-[17px] leading-relaxed text-white/80">{r.texto}</p>
              </div>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

const COLUNAS: { titulo: string; links: { rotulo: string; href: string }[] }[] = [
  {
    titulo: "Plataforma",
    links: [
      { rotulo: "Mapa interativo", href: "/mapa" },
      { rotulo: "Buscar imóveis", href: "/imoveis" },
      { rotulo: "Relatórios territoriais", href: "/relatorios" },
      { rotulo: "Planos", href: "/planos" },
    ],
  },
  {
    titulo: "Para você",
    links: [
      { rotulo: "Anunciar imóvel", href: "/painel/novo" },
      { rotulo: "Entrar ou criar conta", href: "/entrar" },
      { rotulo: "Imóveis em leilão", href: "/imoveis?tipo=leilao" },
      { rotulo: "Suporte", href: "/suporte" },
    ],
  },
  {
    titulo: "Institucional",
    links: [
      { rotulo: "A Arini", href: "/#sobre" },
      { rotulo: "Como funciona", href: "/#como-funciona" },
      { rotulo: "Termos de uso", href: "/termos" },
      { rotulo: "Privacidade e LGPD", href: "/termos" },
    ],
  },
];

/** Rodapé completo da página inicial (sempre escuro). */
export default function RodapeSite({ marca, contato }: { marca: string; contato: Contato }) {
  const ano = new Date().getFullYear();
  return (
    <footer className="lp-escuro relative overflow-hidden bg-[#050D0A] text-white/80">
      <div className="lp-grade pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="lp-container relative grid gap-12 py-16 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="space-y-6">
          <Logo />
          <p className="max-w-sm text-[17px] leading-relaxed">
            {marca}: o mercado imobiliário do Pontal do Triângulo Mineiro visto do mapa, com intermediação da Arini Negócios Imobiliários.
          </p>
          <ul className="space-y-3 text-base">
            {contato.whatsapp && (
              <li>
                <a href={wa(contato.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 transition hover:text-white">
                  <MessageCircle className="size-5 text-[#3FCF7F]" /> {formatarTelefone(contato.whatsapp)}
                </a>
              </li>
            )}
            {contato.telefone && (
              <li className="flex items-center gap-3"><Phone className="size-5 text-[#3FCF7F]" /> {contato.telefone}</li>
            )}
            {contato.email && (
              <li>
                <a href={`mailto:${contato.email}`} className="flex items-center gap-3 transition hover:text-white">
                  <Mail className="size-5 text-[#3FCF7F]" /> {contato.email}
                </a>
              </li>
            )}
            <li className="flex items-center gap-3"><BadgeCheck className="size-5 text-[#3FCF7F]" /> Iturama · MG</li>
          </ul>
        </div>

        {COLUNAS.map((c) => (
          <div key={c.titulo}>
            <h3 className="lp-display mb-5 text-lg text-white">{c.titulo}</h3>
            <ul className="space-y-3 text-base">
              {c.links.map((l) => (
                <li key={l.rotulo}>
                  <Link href={l.href} className="group inline-flex items-center gap-1.5 transition hover:text-[#5FE09A]">
                    {l.rotulo}
                    <ArrowUpRight className="size-4 opacity-0 transition group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
              {c.titulo === "Institucional" && contato.site && (
                <li>
                  <a href={contato.site} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1.5 transition hover:text-[#5FE09A]">
                    Site da imobiliária <ArrowUpRight className="size-4" />
                  </a>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="relative border-t border-white/10">
        <div className="lp-container flex flex-col gap-3 py-6 text-[15px] text-white/65 md:flex-row md:items-center md:justify-between">
          <p>© {ano} Arini Negócios Imobiliários. Todos os direitos reservados.</p>
          <p>
            Dados pessoais tratados conforme a LGPD ·{" "}
            <Link href="/termos" className="underline-offset-4 hover:text-white hover:underline">Termos e privacidade</Link>
          </p>
        </div>
      </div>

      {/* marca d'água do nome, como no rodapé de referência */}
      <p aria-hidden="true" className="lp-display pointer-events-none select-none whitespace-nowrap text-center text-[22vw] leading-[0.8] text-white/[0.03]">
        ARINI
      </p>
    </footer>
  );
}
