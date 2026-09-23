import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerConfiguracoes, texto } from "@/lib/settings";
import { formatBRL, formatArea } from "@/lib/format";

/**
 * Página inicial = site institucional: apresenta a ferramenta e a empresa e
 * leva para a área de consultas (/mapa, /imoveis, /relatorios), que é onde a
 * sidebar do AppShell existe. Aqui não há sidebar.
 */
export const dynamic = "force-dynamic";

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

const temBanco = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function destaques() {
  if (!temBanco()) return [];
  try {
    const { data } = await supabaseAdmin()
      .from("properties")
      .select("codigo, titulo, tipo, valor, municipality:municipalities(nome), geo:property_geometries(area_m2), media:property_media(storage_path, capa)")
      .in("status", ["publicado", "em_negociacao"])
      .order("published_at", { ascending: false })
      .limit(6);
    return data ?? [];
  } catch (e) {
    console.error("destaques da home falharam:", e);
    return [];
  }
}

/** Números reais do sistema para a faixa de credibilidade. Nunca derruba a página. */
async function numeros() {
  const vazio = { municipios: 0, plantas: 0, fontes: 0, imoveis: 0 };
  if (!temBanco()) return vazio;
  try {
    const admin = supabaseAdmin();
    const [mun, plantas, fontes, imoveis] = await Promise.all([
      admin.from("municipalities").select("id", { count: "exact", head: true }),
      admin.from("cartography_layers").select("id", { count: "exact", head: true }).eq("status", "pronto"),
      admin.from("fontes_externas").select("id", { count: "exact", head: true }).eq("ativa", true),
      admin.from("properties").select("id", { count: "exact", head: true }).in("status", ["publicado", "em_negociacao", "vendido"]),
    ]);
    return {
      municipios: mun.count ?? 0,
      plantas: plantas.count ?? 0,
      fontes: fontes.count ?? 0,
      imoveis: imoveis.count ?? 0,
    };
  } catch {
    return vazio;
  }
}

const FERRAMENTA = [
  { icone: "🗺", titulo: "Divisa real sobre o satélite",
    desc: "Cada imóvel entra com o polígono da propriedade, área medida por PostGIS e alerta quando a área declarada diverge da medida." },
  { icone: "🏙", titulo: "Plantas urbanas oficiais",
    desc: "A cartografia georreferenciada das prefeituras aparece sobre o satélite: quadras, lotes e ruas com a numeração do loteamento." },
  { icone: "⚖", titulo: "Consulta rural a fontes oficiais",
    desc: "Processos minerários, terras indígenas, desmatamento, queimadas, unidades de conservação, corpos d'água e energia, cruzados com a divisa do imóvel." },
  { icone: "▤", titulo: "Relatório territorial em PDF",
    desc: "Um documento com órgão, quantidade, data da consulta e raio de cada incidência. Fonte fora do ar aparece como indisponível, nunca como \"nada encontrado\"." },
  { icone: "◈", titulo: "Tour 3D e vídeo automático",
    desc: "Sobrevoo com relevo real da região, roteiro de câmera pronto e vídeo gerado para compartilhar o imóvel." },
  { icone: "✓", titulo: "Central Arini",
    desc: "Nenhum anúncio vai ao ar sem verificação. Todo interessado passa pela central antes de chegar ao proprietário ou parceiro." },
];

const CONSULTAS = [
  { rotulo: "Mapa interativo", desc: "Satélite, plantas das cidades e todos os imóveis publicados.", href: "/mapa", destaque: true },
  { rotulo: "Consultar CAR", desc: "Cadastro Ambiental Rural sobre a divisa.", href: "/mapa?camada=car" },
  { rotulo: "Embargos ambientais", desc: "Áreas embargadas pelo IBAMA.", href: "/mapa?camada=ibama_embargos" },
  { rotulo: "Focos de queimadas", desc: "Histórico do INPE por ano.", href: "/mapa?camada=inpe_queimadas" },
  { rotulo: "Processos minerários", desc: "Requerimentos e concessões da ANM.", href: "/mapa?camada=anm" },
  { rotulo: "Buscar imóveis", desc: "Filtros por tipo, município e preço.", href: "/imoveis" },
  { rotulo: "Relatórios territoriais", desc: "Todos os rurais com as incidências consultadas.", href: "/relatorios" },
];

export default async function Home() {
  const [imoveis, cfg, n] = await Promise.all([destaques(), lerConfiguracoes(), numeros()]);
  const marca = texto(cfg, "nome_sistema", "Arini Imóveis Brasil");
  const siteArini = texto(cfg, "sobre_site");
  const paragrafosSobre = texto(cfg, "sobre_texto").split("\n").map((p) => p.trim()).filter(Boolean);

  const faixa = [
    n.fontes > 0 && [String(n.fontes), "fontes oficiais consultadas ao vivo"],
    n.municipios > 0 && [String(n.municipios), "municípios do Pontal do Triângulo"],
    n.plantas > 0 && [String(n.plantas), "plantas urbanas sobre o satélite"],
    ["1%", "de comissão, só na venda concluída"],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="min-h-screen flex flex-col bg-fundo text-texto">
      <SiteHeader />

      {/* ---------- abertura ---------- */}
      <section className="relative overflow-hidden min-h-[82vh] flex items-center">
        <Image src="/img/hero-fazenda.jpg" alt="" fill priority className="object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-fundo via-fundo/90 to-fundo/40" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-fundo to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 w-full">
          <div className="max-w-2xl space-y-6">
            <p className="anima-subir text-ouro font-mono text-[11px] tracking-[0.28em] uppercase">
              {texto(cfg, "hero_eyebrow", "Pontal do Triângulo Mineiro")}
            </p>
            <h1 className="anima-subir-1 text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.08] text-balance">
              {texto(cfg, "hero_titulo", "O mercado imobiliário da região,")}{" "}
              <span className="texto-verde">{texto(cfg, "hero_destaque", "visto do mapa")}</span>
            </h1>
            <p className="anima-subir-2 text-texto-2 text-lg max-w-xl">
              {texto(cfg, "hero_subtitulo",
                "Fazendas, sítios, lotes e casas com a divisa real da propriedade sobre o satélite, área medida, tour 3D e pontos de interesse ao redor.")}
            </p>
            <div className="anima-subir-3 flex flex-wrap gap-3 pt-2">
              <Link href="/mapa" className="btn-verde px-8 py-4 text-base">Abrir as consultas</Link>
              <Link href="/entrar" className="btn-contorno px-8 py-4 text-base">Anunciar meu imóvel</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- faixa de números ---------- */}
      <section className="mx-auto max-w-7xl w-full px-4 -mt-6 relative">
        <div className="cartao grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-linha">
          {faixa.map(([valor, rotulo]) => (
            <div key={rotulo} className="p-5 lg:p-6">
              <p className="text-3xl font-semibold texto-verde">{valor}</p>
              <p className="text-xs text-texto-2 mt-1">{rotulo}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- a ferramenta ---------- */}
      <section id="ferramenta" className="mx-auto max-w-7xl w-full px-4 py-20 scroll-mt-20">
        <div className="max-w-2xl mb-10">
          <p className="text-verde font-mono text-[11px] tracking-[0.25em] uppercase">A ferramenta</p>
          <h2 className="text-3xl sm:text-4xl font-semibold mt-3 text-balance">
            Inteligência territorial para <span className="texto-verde">decidir com segurança</span>
          </h2>
          <p className="text-texto-2 mt-4">
            O {marca} reúne, num só lugar, o que hoje exige dezenas de sites e visitas: a divisa do imóvel,
            a cartografia oficial da cidade e as consultas aos órgãos públicos que pesam numa negociação de terra.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FERRAMENTA.map((f) => (
            <div key={f.titulo} className="cartao p-6 hover:border-verde/40 transition">
              <span className="inline-grid w-11 h-11 place-items-center rounded-xl bg-verde/12 text-verde text-xl">{f.icone}</span>
              <p className="font-semibold text-lg mt-4">{f.titulo}</p>
              <p className="text-sm text-texto-2 mt-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- consultas ---------- */}
      <section id="consultas" className="bg-superficie border-y border-linha scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div className="max-w-2xl">
              <p className="text-verde font-mono text-[11px] tracking-[0.25em] uppercase">Consultas</p>
              <h2 className="text-3xl sm:text-4xl font-semibold mt-3 text-balance">
                Entre na área de <span className="texto-verde">consultas</span>
              </h2>
              <p className="text-texto-2 mt-4">
                Mapa, busca de imóveis e relatórios ficam numa área própria, com menu lateral e atalhos para cada camada oficial.
              </p>
            </div>
            <Link href="/mapa" className="btn-verde px-6 py-3">Abrir o mapa</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CONSULTAS.map((c) => (
              <Link key={c.rotulo} href={c.href}
                className={
                  "group rounded-2xl border p-5 transition hover:-translate-y-0.5 " +
                  (c.destaque
                    ? "border-verde/50 bg-verde-escuro/70 sm:col-span-2 lg:col-span-1"
                    : "border-linha bg-superficie-2 hover:border-verde/40")
                }>
                <p className="font-medium flex items-center justify-between">
                  {c.rotulo} <span className="text-verde group-hover:translate-x-0.5 transition">›</span>
                </p>
                <p className="text-xs text-texto-2 mt-1.5">{c.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- imóveis publicados ---------- */}
      {imoveis.length > 0 && (
        <section className="mx-auto max-w-7xl w-full px-4 py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-verde font-mono text-[11px] tracking-[0.25em] uppercase">Imóveis</p>
              <h2 className="text-3xl font-semibold mt-3">
                Últimos <span className="texto-verde">publicados</span>
              </h2>
              <p className="text-sm text-texto-2 mt-1">Aprovados pela análise da Arini.</p>
            </div>
            <Link href="/imoveis" className="text-verde text-sm font-medium hover:underline shrink-0">Ver todos →</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((p) => {
              const capa = (p.media as { storage_path: string; capa: boolean }[] | null)?.find((m) => m.capa)
                ?? (p.media as { storage_path: string }[] | null)?.[0];
              const geo = p.geo as unknown as { area_m2: number | null } | null;
              const mun = p.municipality as unknown as { nome: string } | null;
              return (
                <Link key={p.codigo} href={`/imovel/${p.codigo}`}
                  className="cartao overflow-hidden hover:border-verde/50 hover:-translate-y-1 transition group">
                  <div className="h-48 relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                      alt={p.titulo}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute top-3 left-3 text-[11px] rounded-full bg-fundo/85 text-texto px-3 py-1 capitalize backdrop-blur">
                      {p.tipo}
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="font-medium leading-snug">{p.titulo}</p>
                    <p className="text-xs text-texto-2">{mun?.nome}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-verde font-semibold text-lg">{formatBRL(p.valor)}</span>
                      <span className="text-[11px] text-texto-2">
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

      {/* ---------- rural × urbano ---------- */}
      <section className="mx-auto max-w-7xl w-full px-4 pb-20 grid gap-5 md:grid-cols-2">
        {[
          { img: "/img/aerea-interior.jpg", titulo: "Imóveis rurais",
            desc: "Fazendas, sítios e chácaras com área medida por satélite, distância até a cidade, acessos e consultas ambientais prontas.",
            href: "/imoveis?tipo=rural" },
          { img: "/img/casa-urbana.jpg", titulo: "Imóveis urbanos",
            desc: "Casas, lotes e pontos comerciais sobre a planta oficial da cidade, com pontos de interesse ao redor.",
            href: "/imoveis?tipo=urbano" },
        ].map((c) => (
          <Link key={c.titulo} href={c.href}
            className="group relative rounded-3xl overflow-hidden h-80 flex items-end border border-linha">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.img} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-fundo via-fundo/40 to-transparent" />
            <div className="relative p-7">
              <p className="text-2xl font-semibold texto-verde">{c.titulo}</p>
              <p className="text-sm text-texto-2 mt-1 max-w-sm">{c.desc}</p>
              <p className="mt-3 text-sm font-medium group-hover:translate-x-1 transition-transform inline-block">Ver imóveis →</p>
            </div>
          </Link>
        ))}
      </section>

      {/* ---------- como funciona ---------- */}
      <section className="bg-superficie border-y border-linha">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <h2 className="text-3xl font-semibold text-center mb-12">
            Como <span className="texto-verde">funciona</span>
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["1", "Encontre no mapa", "Navegue por satélite, filtre por tipo e preço, e veja a divisa real de cada propriedade."],
              ["2", "Demonstre interesse", "Um clique e a central da Arini recebe seu contato na hora."],
              ["3", "Negocie com segurança", "A Arini verifica cada anúncio, organiza visitas e conduz até a escritura."],
            ].map(([num, titulo, desc]) => (
              <div key={num} className="text-center space-y-3">
                <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-verde/12 text-verde text-xl font-bold">{num}</span>
                <p className="font-semibold text-lg">{titulo}</p>
                <p className="text-sm text-texto-2 max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- sobre a empresa ---------- */}
      <section id="sobre" className="mx-auto max-w-7xl w-full px-4 py-20 grid gap-10 lg:grid-cols-2 items-center scroll-mt-20">
        <div>
          <p className="text-verde font-mono text-[11px] tracking-[0.25em] uppercase">A Arini</p>
          <h2 className="text-3xl sm:text-4xl font-semibold mt-3 text-balance">
            {texto(cfg, "sobre_titulo", "Quem está por trás do mapa")}
          </h2>
          <div className="text-texto-2 mt-5 space-y-4 leading-relaxed">
            {paragrafosSobre.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link href="/entrar" className="btn-ouro px-6 py-3">Falar com a Arini</Link>
            {siteArini && (
              <a href={siteArini} target="_blank" rel="noopener noreferrer" className="btn-contorno px-6 py-3">
                Site da imobiliária
              </a>
            )}
          </div>
        </div>
        <div className="relative rounded-3xl overflow-hidden border border-linha h-80 lg:h-[26rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/fazenda-gado.jpg" alt="Propriedade rural na região de Iturama" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-fundo/90 to-transparent" />
          <div className="absolute bottom-0 p-7">
            <p className="font-semibold">Arini Negócios Imobiliários</p>
            <p className="text-sm text-texto-2">Iturama · Pontal do Triângulo Mineiro</p>
          </div>
        </div>
      </section>

      {/* ---------- CTA anunciantes ---------- */}
      <section className="relative overflow-hidden border-y border-linha">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/aerea-campo.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-verde-escuro/80" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center space-y-5">
          <h2 className="text-3xl sm:text-4xl font-semibold text-balance">
            Tem um imóvel na região? <span className="texto-verde">Coloque ele no mapa.</span>
          </h2>
          <p className="text-texto-2 max-w-2xl mx-auto">
            Proprietários, imobiliárias e corretores parceiros anunciam com divisa no satélite,
            tour 3D e vídeo automáticos, e recebem interessados qualificados pela central da Arini.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/entrar" className="btn-verde px-8 py-4">Cadastrar imóvel</Link>
            <Link href="/entrar" className="btn-contorno px-8 py-4">Quero ser parceiro</Link>
          </div>
        </div>
      </section>

      <footer className="bg-superficie text-sm text-texto-2">
        <div className="mx-auto max-w-7xl px-4 py-8 flex flex-wrap gap-4 items-center justify-between">
          <p>
            <span className="text-texto font-medium">{marca}</span>
            {" "}· Arini Negócios Imobiliários
            {texto(cfg, "telefone_contato") && <> · {texto(cfg, "telefone_contato")}</>}
            {texto(cfg, "email_contato") && <> · {texto(cfg, "email_contato")}</>}
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/mapa" className="hover:text-verde">Consultas</Link>
            <Link href="/imoveis" className="hover:text-verde">Imóveis</Link>
            <Link href="/entrar" className="hover:text-verde">Anunciar</Link>
            <Link href="/entrar" className="hover:text-verde">Entrar</Link>
            <Link href="/termos" className="hover:text-verde">Termos e privacidade</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
