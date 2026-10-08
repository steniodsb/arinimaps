import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Database, Grid3x3, House, MapPin, MapPinned, Ruler } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import VitrineConsultas, { type Consulta } from "@/components/home/VitrineConsultas";
import HeroCarrossel, { type SlideHero } from "@/components/landing/HeroCarrossel";
import ComoUsar from "@/components/landing/ComoUsar";
import Municipios, { type MunicipioCartao } from "@/components/landing/Municipios";
import ComoFunciona from "@/components/landing/ComoFunciona";
import FontesMarquee from "@/components/landing/FontesMarquee";
import MosaicoSatelite from "@/components/landing/MosaicoSatelite";
import RodapeSite, { PreRodape } from "@/components/landing/RodapeSite";
import { MaisLink, TituloSecao } from "@/components/landing/Titulo";
import {
  ClipReveal, Counter, Parallax, Reveal, RolagemSuave, SpotlightTracker, Stagger,
} from "@/components/landing/movimento";
import { CENTRO_REGIAO } from "@/lib/map/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerConfiguracoes, texto } from "@/lib/settings";
import { formatBRL, formatArea } from "@/lib/format";

/**
 * Página inicial = site institucional: apresenta a ferramenta e a empresa e
 * leva para a área de consultas (/mapa, /imoveis, /relatorios), que é onde a
 * sidebar do AppShell existe. Aqui não há sidebar.
 *
 * Visual no molde do site de referência (grupocordeiro): carrossel de tela
 * cheia, faixas claras e escuras alternadas, títulos grandes em Urbanist,
 * entradas ao rolar. Faixas escuras usam `.lp-escuro` (ver globals.css) e
 * ficam legíveis nos dois temas.
 */
export const dynamic = "force-dynamic";

// fonte de display só dos títulos da landing (o resto do sistema segue em Geist)

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

const temBanco = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

async function destaques() {
  if (!temBanco()) return [];
  try {
    const { data } = await supabaseAdmin()
      .from("properties")
      .select("codigo, titulo, tipo, valor, modalidade, municipality:municipalities(nome), geo:property_geometries(area_m2), media:property_media(storage_path, capa)")
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
  const vazio = { municipios: 0, plantas: 0, fontes: 0, imoveis: 0, lotes: 0 };
  if (!temBanco()) return vazio;
  try {
    const admin = supabaseAdmin();
    const [mun, plantas, fontes, imoveis, lotes] = await Promise.all([
      admin.from("municipalities").select("id", { count: "exact", head: true }).eq("ativo", true),
      admin.from("cartography_layers").select("id", { count: "exact", head: true }).eq("status", "pronto"),
      admin.from("fontes_externas").select("id", { count: "exact", head: true }).eq("ativa", true),
      admin.from("properties").select("id", { count: "exact", head: true }).in("status", ["publicado", "em_negociacao", "vendido"]),
      admin.from("urban_lots").select("id", { count: "exact", head: true }),
    ]);
    return {
      municipios: mun.count ?? 0,
      plantas: plantas.count ?? 0,
      fontes: fontes.count ?? 0,
      imoveis: imoveis.count ?? 0,
      lotes: lotes.count ?? 0,
    };
  } catch {
    return vazio;
  }
}

/** Municípios ativos com a sede (para o satélite), imóveis publicados e lotes mapeados. */
async function municipiosAtendidos(): Promise<MunicipioCartao[]> {
  if (!temBanco()) return [];
  try {
    const admin = supabaseAdmin();
    const [{ data: muns }, { data: props }] = await Promise.all([
      admin.from("municipalities").select("id, nome, uf, sede").eq("ativo", true).order("nome"),
      admin.from("properties").select("municipality_id").in("status", ["publicado", "em_negociacao"]),
    ]);
    if (!muns?.length) return [];
    const lotes = await Promise.all(
      muns.map((m) =>
        admin.from("urban_lots").select("id", { count: "exact", head: true }).eq("municipality_id", m.id)
          .then((r) => r.count ?? 0, () => 0),
      ),
    );
    const porMun = new Map<string, number>();
    for (const p of props ?? []) {
      if (p.municipality_id) porMun.set(p.municipality_id, (porMun.get(p.municipality_id) ?? 0) + 1);
    }
    return muns.map((m, k) => {
      // PostgREST devolve a geometria como GeoJSON
      const c = (m.sede as { coordinates?: [number, number] } | null)?.coordinates;
      const [lng, lat] = Array.isArray(c) && c.length >= 2 ? c : CENTRO_REGIAO;
      return { id: m.id, nome: m.nome, uf: m.uf, lng, lat, imoveis: porMun.get(m.id) ?? 0, lotes: lotes[k] };
    });
  } catch (e) {
    console.error("municípios da home falharam:", e);
    return [];
  }
}

const CONSULTAS: Consulta[] = [
  { rotulo: "Mapa interativo", desc: "Satélite, plantas das cidades e todos os imóveis publicados.", href: "/mapa", icone: "mapa", destaque: true },
  { rotulo: "Consultar CAR", desc: "Cadastro Ambiental Rural sobre a divisa.", href: "/mapa?camada=car", icone: "car" },
  { rotulo: "Embargos ambientais", desc: "Áreas embargadas pelo IBAMA.", href: "/mapa?camada=ibama_embargos", icone: "embargo" },
  { rotulo: "Focos de queimadas", desc: "Histórico do INPE por ano.", href: "/mapa?camada=inpe_queimadas", icone: "fogo" },
  { rotulo: "Processos minerários", desc: "Requerimentos e concessões da ANM.", href: "/mapa?camada=anm", icone: "mineracao" },
  { rotulo: "Buscar imóveis", desc: "Filtros por tipo, município e preço.", href: "/imoveis", icone: "busca" },
  { rotulo: "Relatórios territoriais", desc: "Todos os rurais com as incidências consultadas.", href: "/relatorios", icone: "relatorio" },
];

const mil = (v: number) => v.toLocaleString("pt-BR");

export default async function Home() {
  const [imoveis, cfg, n, municipios] = await Promise.all([destaques(), lerConfiguracoes(), numeros(), municipiosAtendidos()]);
  const marca = texto(cfg, "nome_sistema", "Arini Imóveis Brasil");
  const siteArini = texto(cfg, "sobre_site");
  const paragrafosSobre = texto(cfg, "sobre_texto").split("\n").map((p) => p.trim()).filter(Boolean);
  const contato = {
    whatsapp: texto(cfg, "whatsapp_central") || undefined,
    email: texto(cfg, "email_contato") || undefined,
    telefone: texto(cfg, "telefone_contato") || undefined,
    site: siteArini || undefined,
  };

  const heroTitulo = texto(cfg, "hero_titulo", "O mercado imobiliário da região,");
  const heroDestaque = texto(cfg, "hero_destaque", "visto do mapa");

  const slides: SlideHero[] = [
    {
      id: "rural", aba: "Fazendas e sítios",
      eyebrow: texto(cfg, "hero_eyebrow", "Pontal do Triângulo Mineiro"),
      titulo: heroTitulo, destaque: heroDestaque,
      subtitulo: texto(cfg, "hero_subtitulo",
        "Fazendas, sítios, lotes e casas com a divisa real da propriedade sobre o satélite, área medida, tour 3D e pontos de interesse ao redor."),
      cta: { rotulo: "Ver fazendas e sítios", href: "/imoveis?tipo=rural" },
      cta2: { rotulo: "Abrir o mapa", href: "/mapa" },
      midia: { tipo: "mapa", cena: 0, poster: "/img/hero-fazenda.jpg" },
    },
    {
      id: "urbano", aba: "Lotes urbanos",
      eyebrow: "Iturama, lote a lote",
      titulo: "Cada lote da cidade", destaque: "na planta oficial",
      subtitulo: n.lotes > 0
        ? `Quadras, lotes e ruas georreferenciados sobre o satélite, com a medida de cada lado. ${mil(n.lotes)} lotes já estão no mapa.`
        : "Quadras, lotes e ruas georreferenciados sobre o satélite, com a medida de cada lado.",
      cta: { rotulo: "Ver imóveis urbanos", href: "/imoveis?tipo=urbano" },
      cta2: { rotulo: "Abrir o mapa", href: "/mapa" },
      midia: { tipo: "mapa", cena: 1, poster: "/img/casa-urbana.jpg" },
    },
    {
      id: "leilao", aba: "Imóveis em leilão",
      eyebrow: "Oportunidades",
      titulo: "Imóveis em leilão,", destaque: "com a divisa conferida",
      subtitulo: "Leilões da região reunidos num só lugar, com a área medida no satélite e as consultas ambientais prontas antes do lance.",
      cta: { rotulo: "Ver imóveis em leilão", href: "/imoveis?tipo=leilao" },
      midia: { tipo: "foto", src: "/img/fazenda-gado.jpg" },
    },
    {
      id: "consulta", aba: "Consulta territorial",
      eyebrow: "Fontes oficiais",
      titulo: "Consulte a área", destaque: "antes de negociar",
      subtitulo: "CAR, embargos do IBAMA, queimadas do INPE, processos da ANM, terras indígenas e unidades de conservação cruzados com a divisa do imóvel.",
      cta: { rotulo: "Ver relatórios territoriais", href: "/relatorios" },
      cta2: { rotulo: "Consultar no mapa", href: "/mapa?camada=car" },
      midia: { tipo: "foto", src: "/img/aerea-campo.jpg" },
    },
    {
      id: "anuncie", aba: "Anuncie seu imóvel",
      eyebrow: "Para proprietários e corretores",
      titulo: "Coloque seu imóvel", destaque: "no mapa",
      subtitulo: "Divisa no satélite, tour 3D e vídeo automáticos, e interessados qualificados pela central da Arini.",
      cta: { rotulo: "Anunciar imóvel", href: "/painel/novo" },
      cta2: { rotulo: "Ver planos", href: "/planos" },
      midia: { tipo: "foto", src: "/img/aerea-interior.jpg" },
    },
  ];

  const faixa = [
    { icone: House, valor: n.imoveis, rotulo: "imóveis publicados" },
    { icone: MapPinned, valor: n.municipios, rotulo: "municípios no mapa" },
    { icone: Grid3x3, valor: n.lotes, rotulo: "lotes urbanos mapeados" },
    { icone: Database, valor: n.fontes, rotulo: "fontes oficiais ao vivo" },
  ].filter((f) => f.valor > 0);

  const porQue = [
    n.fontes > 0 && { valor: String(n.fontes), rotulo: "fontes oficiais cruzadas com a divisa de cada imóvel" },
    n.plantas > 0
      ? { valor: String(n.plantas), rotulo: "plantas urbanas oficiais georreferenciadas sobre o satélite" }
      : n.lotes > 0 && { valor: mil(n.lotes), rotulo: "lotes urbanos com a medida de cada lado" },
    { valor: "100%", rotulo: "dos anúncios conferidos pela Arini antes de ir ao ar" },
    { valor: "1%", rotulo: "de comissão, só na venda concluída" },
  ].filter(Boolean) as { valor: string; rotulo: string }[];

  return (
    <div className={`flex min-h-screen flex-col bg-fundo text-texto`}>
      <RolagemSuave />
      <SpotlightTracker />
      <SiteHeader sobreHero />

      <main className="flex-1">
        <HeroCarrossel slides={slides} h1={`${marca}: ${heroTitulo} ${heroDestaque}`} />

        {/* ---------- faixa de números ---------- */}
        {faixa.length > 0 && (
          <section aria-label="A Arini em números" className="lp-escuro border-t border-white/10 bg-[#07130E]">
            <div className="lp-container grid grid-cols-2 lg:grid-cols-4">
              {faixa.map((f, k) => (
                <div
                  key={f.rotulo}
                  className={`flex flex-col items-start gap-3 py-6 md:flex-row md:items-center md:gap-4 md:py-8 ${
                    k % 2 ? "border-l border-white/10 pl-5" : "pr-4"
                  } ${k > 1 ? "border-t border-white/10 lg:border-t-0" : ""} ${k ? "lg:border-l lg:pl-7" : "lg:pl-0"}`}
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#3FCF7F]/15 text-[#3FCF7F] ring-1 ring-[#3FCF7F]/25">
                    <f.icone className="size-6" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <Counter value={mil(f.valor)} className="lp-display block text-3xl leading-none text-white md:text-[2.2rem]" />
                    <p className="mt-2 text-base leading-snug text-white/80">{f.rotulo}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- a ferramenta: como você usa ---------- */}
        <section id="ferramenta" className="lp-clara scroll-mt-24 py-24 md:py-28">
          <div className="lp-container">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <TituloSecao
                eyebrow="A ferramenta"
                titulo="Como você usa a Arini"
                destaque={1}
                subtitulo={`O ${marca} reúne num só lugar o que hoje exige dezenas de sites e visitas: a divisa do imóvel, a cartografia oficial da cidade e as consultas aos órgãos públicos.`}
              />
              <MaisLink href="/mapa">Abrir o mapa</MaisLink>
            </div>
            <div className="mt-12"><ComoUsar /></div>
          </div>
        </section>

        {/* ---------- municípios atendidos ---------- */}
        {municipios.length > 0 && (
          <section id="municipios" className="lp-branca scroll-mt-24 py-24 md:py-28">
            <div className="lp-container">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <TituloSecao
                  titulo="Municípios atendidos"
                  subtitulo="O Pontal do Triângulo Mineiro inteiro no satélite, com a malha do CAR e as plantas urbanas oficiais."
                />
                <MaisLink href="/imoveis">Todos os imóveis</MaisLink>
              </div>
              <div className="mt-12"><Municipios municipios={municipios} /></div>
            </div>
          </section>
        )}

        {/* ---------- consultas (mapa ao vivo + atalhos) ---------- */}
        <VitrineConsultas consultas={CONSULTAS} />

        {/* ---------- por que a Arini ---------- */}
        <section className="lp-clara overflow-hidden py-24 md:py-32">
          <div className="lp-container grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <TituloSecao
                titulo="Por que a Arini"
                subtitulo="Território conferido antes da negociação: divisa medida, cartografia oficial e consulta aos órgãos públicos, com uma imobiliária da região conduzindo do primeiro contato à escritura."
              />
              <Stagger className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10" gap={0.12}>
                {porQue.map((s) => (
                  <div key={s.rotulo} className="border-l-4 border-verde pl-5">
                    <Counter value={s.valor} className="lp-display block text-4xl text-texto xl:text-5xl" />
                    <p className="mt-2 text-base leading-snug text-texto-2 md:text-[17px]">{s.rotulo}</p>
                  </div>
                ))}
              </Stagger>
              <Reveal delay={0.2}>
                <Link href="/mapa" className="lp-btn lp-btn-verde mt-12">Conhecer a ferramenta <ArrowRight /></Link>
              </Reveal>
            </div>
            <div className="relative">
              <div className="absolute -right-4 -top-4 h-40 w-40 rounded-xl bg-ouro md:-right-6 md:-top-6" aria-hidden="true" />
              <ClipReveal from="right" className="relative overflow-hidden rounded-xl">
                <Parallax className="aspect-[5/5.4]" strength={50}>
                  <Image src="/img/fazenda-gado.jpg" alt="Propriedade rural na região de Iturama" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
                </Parallax>
              </ClipReveal>
              {n.municipios > 0 && (
                <Reveal delay={0.4} className="absolute -bottom-8 -left-2 md:-left-10">
                  <div className="rounded-xl bg-superficie p-6 shadow-2xl ring-1 ring-linha">
                    <Counter value={String(n.municipios)} className="lp-display block text-5xl text-texto" />
                    <p className="mt-1 text-base font-semibold text-texto-2">municípios do Pontal no mapa</p>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </section>

        {/* ---------- últimos publicados ---------- */}
        <section id="imoveis" className="lp-branca scroll-mt-24 py-24 md:py-28">
          <div className="lp-container">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
              <TituloSecao titulo="Últimos publicados" destaque={1} subtitulo="Imóveis aprovados pela conferência da Arini." />
              <MaisLink href="/imoveis">Ver todos os imóveis</MaisLink>
            </div>
            {imoveis.length > 0 ? (
              <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" gap={0.1} itemClassName="h-full">
                {imoveis.map((p) => {
                  const capa = (p.media as { storage_path: string; capa: boolean }[] | null)?.find((m) => m.capa)
                    ?? (p.media as { storage_path: string }[] | null)?.[0];
                  const geo = p.geo as unknown as { area_m2: number | null } | null;
                  const mun = p.municipality as unknown as { nome: string } | null;
                  const leilao = (p as { modalidade?: string | null }).modalidade === "leilao";
                  return (
                    <Link
                      key={p.codigo}
                      href={`/imovel/${p.codigo}`}
                      className="spotlight lp-lift group flex h-full flex-col overflow-hidden rounded-xl bg-superficie ring-1 ring-linha hover:ring-verde/60"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-superficie-2">
                        {/* foto enviada pelo anunciante (Storage do Supabase): <img> com proporção fixa, sem salto */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/casa-urbana.jpg"}
                          alt={p.titulo}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.07]"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
                        <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur">
                          {p.tipo === "rural" ? "Rural" : "Urbano"}
                        </span>
                        {leilao && (
                          <span className="absolute right-4 top-4 rounded-md bg-[#B18CFF] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#160B2E]">
                            Leilão
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <h3 className="lp-display text-xl leading-snug text-texto transition group-hover:text-verde">{p.titulo}</h3>
                        {mun?.nome && (
                          <p className="mt-2 flex items-center gap-1.5 text-base text-texto-2">
                            <MapPin className="size-4 text-verde" /> {mun.nome}
                          </p>
                        )}
                        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                          <span className="lp-display text-2xl text-verde">{formatBRL(p.valor)}</span>
                          <span className="flex items-center gap-1.5 text-[15px] text-texto-2">
                            <Ruler className="size-4" /> {formatArea(geo?.area_m2 ?? null, p.tipo as "urbano" | "rural")}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </Stagger>
            ) : (
              <p className="rounded-xl border border-dashed border-linha p-10 text-center text-lg text-texto-2">
                Os imóveis aprovados pela Arini aparecem aqui. Enquanto isso,{" "}
                <Link href="/mapa" className="font-semibold text-verde hover:underline">explore o mapa</Link>.
              </p>
            )}
          </div>
        </section>

        {/* ---------- como funciona ---------- */}
        <section id="como-funciona" className="lp-escuro lp-malha-escura relative isolate scroll-mt-24 overflow-hidden py-24 md:py-32">
          <div className="lp-grade pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className="lp-container">
            <TituloSecao
              claro
              eyebrow="Do cadastro à escritura"
              titulo="Como funciona"
              subtitulo="Cada anúncio passa pela Arini antes de ir ao ar, e cada interessado passa pela central antes de chegar ao proprietário."
            />
            <div className="mt-16"><ComoFunciona /></div>
          </div>
        </section>

        {/* ---------- fontes oficiais ---------- */}
        <section aria-labelledby="titulo-fontes" className="lp-clara border-b border-linha py-14 md:py-16">
          <div className="lp-container mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="titulo-fontes" className="lp-display text-2xl text-texto md:text-3xl">Fontes oficiais consultadas</h2>
            <p className="text-base text-texto-2">Fonte fora do ar aparece como indisponível, nunca como &ldquo;nada encontrado&rdquo;.</p>
          </div>
          <FontesMarquee />
        </section>

        {/* ---------- sobre a Arini ---------- */}
        <section id="sobre" className="lp-branca scroll-mt-24 overflow-hidden py-24 md:py-32">
          <div className="lp-container grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div className="relative order-2 lg:order-1">
              <ClipReveal from="left" className="relative aspect-[4/3.4] overflow-hidden rounded-xl ring-1 ring-linha">
                <MosaicoSatelite lng={-50.196} lat={-19.728} z={14} alt="Iturama vista do satélite" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="lp-escuro absolute bottom-0 p-7">
                  <p className="lp-display text-2xl text-white">Arini Negócios Imobiliários</p>
                  <p className="mt-1 text-base text-white/80">Iturama · Pontal do Triângulo Mineiro</p>
                </div>
              </ClipReveal>
            </div>
            <div className="order-1 lg:order-2">
              <TituloSecao eyebrow="A Arini" titulo={texto(cfg, "sobre_titulo", "Quem está por trás do mapa")} />
              <Reveal delay={0.15}>
                <div className="mt-6 space-y-4 text-lg leading-relaxed text-texto-2">
                  {paragrafosSobre.map((p, i) => <p key={i}>{p}</p>)}
                </div>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/suporte" className="lp-btn lp-btn-verde">Falar com a Arini <ArrowRight /></Link>
                  {siteArini && (
                    <a href={siteArini} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-contorno">
                      Site da imobiliária
                    </a>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <PreRodape contato={contato} />
      <RodapeSite marca={marca} contato={contato} />
    </div>
  );
}
