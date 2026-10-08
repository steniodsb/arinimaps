import type { Metadata } from "next";
import { Geist, Geist_Mono, Urbanist } from "next/font/google";
import "./globals.css";
import { TEMA_SCRIPT } from "@/components/shell/BotaoTema";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// títulos do sistema inteiro na mesma fonte da página inicial (redesign 08/10/2026)
const urbanist = Urbanist({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Arini Imóveis Brasil — imóveis pelo mapa",
    template: "%s · Arini Imóveis Brasil",
  },
  description:
    "Marketplace imobiliário regional: fazendas, sítios e imóveis urbanos direto no mapa, com intermediação da Arini Negócios Imobiliários.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${urbanist.variable} h-full antialiased`}
      // o script do tema escreve data-tema aqui antes da hidratação; sem isto
      // o React reclama de atributo divergente em toda navegação
      suppressHydrationWarning
    >
      <head>
        {/* aplica o tema salvo antes da pintura, senão a tela pisca escura
            antes de virar clara a cada navegação */}
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
