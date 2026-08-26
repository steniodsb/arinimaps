import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea } from "@/lib/format";

export const revalidate = 300;

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

async function destaques() {
  const { data } = await supabaseAdmin()
    .from("properties")
    .select("codigo, titulo, tipo, valor, municipality:municipalities(nome), geo:property_geometries(area_m2), media:property_media(storage_path, capa)")
    .in("status", ["publicado", "em_negociacao"])
    .order("published_at", { ascending: false })
    .limit(6);
  return data ?? [];
}

export default async function Home() {
  const imoveis = await destaques();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      {/* ---------- hero com imagem real ---------- */}
      <section className="relative text-white overflow-hidden min-h-[88vh] flex items-center">
        <Image
          src="/img/hero-fazenda.jpg"
          alt="Fazenda ao pôr do sol na região do Pontal do Triângulo"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-verde-escuro/95 via-verde-escuro/75 to-verde-escuro/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 w-full">
          <div className="max-w-2xl space-y-6">
            <p className="anima-subir text-ouro font-mono text-xs tracking-[0.25em] uppercase">
              Pontal do Triângulo Mineiro
            </p>
            <h1 className="anima-subir-1 text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.08] text-balance">
              O mercado imobiliário da região,{" "}
              <span className="texto-ouro">visto do mapa</span>
            </h1>
            <p className="anima-subir-2 text-white/85 text-lg max-w-xl">
              Fazendas, sítios, lotes e casas com a divisa real da propriedade sobre o satélite,
              área medida, tour 3D e pontos de interesse ao redor. Toda negociação intermediada
              pela Arini Negócios Imobiliários.
            </p>
            <div className="anima-subir-3 flex flex-wrap gap-3 pt-2">
              <Link href="/mapa" className="btn-ouro px-8 py-4 text-lg">
                Explorar o mapa
              </Link>
              <Link href="/entrar" className="btn-contorno px-8 py-4 text-lg">
                Anunciar meu imóvel
              </Link>
            </div>
            <div className="anima-subir-3 flex flex-wrap gap-8 pt-6 text-sm">
              {[
                ["Divisas reais", "polígono da propriedade no satélite"],
                ["Tour 3D", "sobrevoo com relevo da região"],
                ["Central Arini", "anúncios verificados um a um"],
              ].map(([t, d]) => (
                <div key={t}>
                  <p className="font-semibold texto-ouro">{t}</p>
                  <p className="text-white/60">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- destaques ---------- */}
      {imoveis.length > 0 && (
        <section className="mx-auto max-w-6xl w-full px-4 py-16">
          <div className="flex items-end justify-between mb-7">
            <div>
              <h2 className="text-3xl font-semibold text-verde-escuro">
                Últimos <span className="texto-ouro">publicados</span>
              </h2>
              <p className="text-sm text-foreground/60 mt-1">Aprovados pela análise da Arini.</p>
            </div>
            <Link href="/mapa" className="text-verde font-medium hover:underline shrink-0">Ver no mapa →</Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((p) => {
              const capa = (p.media as { storage_path: string; capa: boolean }[] | null)
                ?.find((m) => m.capa) ?? (p.media as { storage_path: string }[] | null)?.[0];
              const geo = p.geo as unknown as { area_m2: number | null } | null;
              const mun = p.municipality as unknown as { nome: string } | null;
              return (
                <Link key={p.codigo} href={`/imovel/${p.codigo}`}
                  className="group rounded-2xl overflow-hidden border border-linha bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                  <div className="h-48 bg-areia relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                      alt={p.titulo}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <span className="absolute top-3 left-3 text-xs rounded-full bg-verde-escuro/85 text-white px-3 py-1 capitalize backdrop-blur">
                      {p.tipo}
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="font-semibold text-verde-escuro leading-snug">{p.titulo}</p>
                    <p className="text-sm text-foreground/60">{mun?.nome}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="texto-ouro font-bold text-lg">{formatBRL(p.valor)}</span>
                      <span className="text-xs text-foreground/50">
                        {formatArea(geo?.area_m2 ?? null, p.tipo as "urbano" | "rural")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- como funciona ---------- */}
      <section className="bg-verde-escuro text-white relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "repeating-radial-gradient(circle at 80% 30%, transparent 0 46px, rgba(212,175,55,.6) 46px 47px)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-semibold text-center mb-12">
            Como <span className="texto-ouro">funciona</span>
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["1", "Encontre no mapa", "Navegue por satélite, filtre por tipo e preço, e veja a divisa real de cada propriedade."],
              ["2", "Demonstre interesse", "Um clique e a central da Arini recebe seu contato na hora — sem burocracia."],
              ["3", "Negocie com segurança", "A Arini verifica cada anúncio, organiza visitas e conduz a negociação até a escritura."],
            ].map(([n, titulo, texto], i) => (
              <div key={n} className={`text-center space-y-3 anima-subir-${i + 1}`}>
                <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl btn-ouro !shadow-none text-xl font-bold">{n}</span>
                <p className="font-semibold text-lg">{titulo}</p>
                <p className="text-sm text-white/70 max-w-xs mx-auto">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- rural × urbano ---------- */}
      <section className="mx-auto max-w-6xl w-full px-4 py-16 grid gap-6 md:grid-cols-2">
        {[
          {
            img: "/img/aerea-interior.jpg", alt: "Fazenda com celeiro e pastagem",
            titulo: "Imóveis rurais", texto: "Fazendas, sítios e chácaras com área medida por satélite, distância até a cidade e acessos mapeados.",
            href: "/mapa",
          },
          {
            img: "/img/casa-urbana.jpg", alt: "Casa residencial iluminada ao entardecer",
            titulo: "Imóveis urbanos", texto: "Casas, lotes e pontos comerciais sobre a cartografia da cidade, com pontos de interesse ao redor.",
            href: "/mapa",
          },
        ].map((c) => (
          <Link key={c.titulo} href={c.href}
            className="group relative rounded-3xl overflow-hidden h-80 flex items-end hover:shadow-2xl transition-shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.img} alt={c.alt}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-verde-escuro/95 via-verde-escuro/30 to-transparent" />
            <div className="relative p-7 text-white">
              <p className="text-2xl font-semibold texto-ouro">{c.titulo}</p>
              <p className="text-sm text-white/80 mt-1 max-w-sm">{c.texto}</p>
              <p className="mt-3 text-sm font-medium group-hover:translate-x-1 transition-transform inline-block">
                Ver no mapa →
              </p>
            </div>
          </Link>
        ))}
      </section>

      {/* ---------- CTA anunciantes ---------- */}
      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/aerea-campo.jpg" alt="Vista aérea de lavoura"
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-verde-escuro/85" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center text-white space-y-5">
          <h2 className="text-3xl sm:text-4xl font-semibold text-balance">
            Tem um imóvel na região? <span className="texto-ouro">Coloque ele no mapa.</span>
          </h2>
          <p className="text-white/80 max-w-2xl mx-auto">
            Proprietários, imobiliárias e corretores parceiros anunciam com divisa no satélite,
            tour 3D e vídeo automáticos — e recebem interessados qualificados pela central da Arini.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/entrar" className="btn-ouro px-8 py-4">Cadastrar imóvel</Link>
            <Link href="/entrar" className="btn-contorno px-8 py-4">Quero ser parceiro</Link>
          </div>
        </div>
      </section>

      <footer className="bg-verde-escuro border-t border-white/10 text-white/70 text-sm">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-wrap gap-4 items-center justify-between">
          <p>
            <span className="text-white font-semibold">Arini <span className="texto-ouro">Imóveis Brasil</span></span>
            {" "}· Arini Negócios Imobiliários
          </p>
          <nav className="flex gap-5">
            <Link href="/mapa" className="hover:text-ouro">Mapa</Link>
            <Link href="/entrar" className="hover:text-ouro">Anunciar</Link>
            <Link href="/entrar" className="hover:text-ouro">Entrar</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
