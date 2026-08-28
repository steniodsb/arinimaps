import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { lerConfiguracoes, texto } from "@/lib/settings";
import { formatBRL, formatArea } from "@/lib/format";
import AppShell from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

async function destaques() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
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

const ACOES = [
  { href: "/mapa", icone: "🗺", rotulo: "Mapa Interativo", desc: "Divisas no satélite" },
  { href: "/imoveis", icone: "⌕", rotulo: "Buscar Imóveis", desc: "Filtros e região" },
  { href: "/relatorios", icone: "▤", rotulo: "Análises", desc: "Cruzamento de dados" },
  { href: "/relatorios", icone: "▦", rotulo: "Relatórios", desc: "Territorial em PDF" },
  { href: "/painel", icone: "◔", rotulo: "Alertas", desc: "Monitoramento" },
  { href: "/painel", icone: "♡", rotulo: "Favoritos", desc: "Seus imóveis" },
];

const ATALHOS = [
  { rotulo: "Consultar CAR", href: "/mapa?camada=car" },
  { rotulo: "Embargos Ambientais", href: "/mapa?camada=ibama_embargos" },
  { rotulo: "Focos de Queimadas", href: "/mapa?camada=inpe_queimadas" },
  { rotulo: "Processos Minerários", href: "/mapa?camada=anm" },
];

export default async function Home() {
  const [imoveis, cfg, user] = await Promise.all([destaques(), lerConfiguracoes(), currentUser()]);
  const usuario = user ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" } : null;

  return (
    <AppShell usuario={usuario}>
      {/* ---------- abertura ---------- */}
      <section className="relative overflow-hidden rounded-3xl border border-linha mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hero-fazenda.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-r from-fundo via-fundo/92 to-fundo/50" />
        <div className="relative p-7 lg:p-12 max-w-3xl">
          <p className="anima-subir text-ouro font-mono text-[11px] tracking-[0.28em] uppercase">
            {texto(cfg, "hero_eyebrow", "Pontal do Triângulo Mineiro")}
          </p>
          <h1 className="anima-subir-1 text-3xl lg:text-5xl font-semibold leading-[1.1] mt-3 text-balance">
            Inteligência territorial<br />
            para melhores <span className="texto-verde">decisões</span>
          </h1>
          <p className="anima-subir-2 text-texto-2 mt-4 max-w-xl">
            {texto(cfg, "hero_subtitulo",
              "Fazendas, sítios, lotes e casas com a divisa real da propriedade sobre o satélite, área medida, tour 3D e pontos de interesse ao redor.")}
          </p>
          <div className="anima-subir-3 flex flex-wrap gap-3 mt-6">
            <Link href="/mapa" className="btn-verde px-7 py-3.5">Explorar o mapa</Link>
            <Link href="/entrar" className="btn-contorno px-7 py-3.5">Anunciar meu imóvel</Link>
          </div>
        </div>
      </section>

      {/* ---------- ações principais ---------- */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-7">
        {ACOES.map((a) => (
          <Link key={a.rotulo} href={a.href}
            className="cartao p-4 hover:border-verde/50 hover:-translate-y-0.5 transition group">
            <span className="text-xl block">{a.icone}</span>
            <p className="font-medium text-sm text-texto mt-2 group-hover:text-verde transition">{a.rotulo}</p>
            <p className="text-[11px] text-texto-2 mt-0.5">{a.desc}</p>
          </Link>
        ))}
      </section>

      {/* ---------- acesso rápido ---------- */}
      <section className="mb-7">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-verde mb-3">Acesso rápido</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {ATALHOS.map((a) => (
            <Link key={a.rotulo} href={a.href}
              className="flex items-center justify-between cartao px-4 py-3 text-sm text-texto-2 hover:text-texto hover:border-verde/40 transition">
              {a.rotulo} <span>›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- imóveis publicados ---------- */}
      {imoveis.length > 0 && (
        <section className="mb-7">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-texto">
                Últimos <span className="texto-verde">publicados</span>
              </h2>
              <p className="text-xs text-texto-2 mt-0.5">Aprovados pela análise da Arini.</p>
            </div>
            <Link href="/mapa" className="text-verde text-sm font-medium hover:underline shrink-0">Ver no mapa →</Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((p) => {
              const capa = (p.media as { storage_path: string; capa: boolean }[] | null)?.find((m) => m.capa)
                ?? (p.media as { storage_path: string }[] | null)?.[0];
              const geo = p.geo as unknown as { area_m2: number | null } | null;
              const mun = p.municipality as unknown as { nome: string } | null;
              return (
                <Link key={p.codigo} href={`/imovel/${p.codigo}`}
                  className="cartao overflow-hidden hover:border-verde/50 hover:-translate-y-1 transition group">
                  <div className="h-44 relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                      alt={p.titulo}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute top-3 left-3 text-[11px] rounded-full bg-fundo/85 text-texto px-3 py-1 capitalize backdrop-blur">
                      {p.tipo}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-medium text-texto leading-snug">{p.titulo}</p>
                    <p className="text-xs text-texto-2">{mun?.nome}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-verde font-semibold">{formatBRL(p.valor)}</span>
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

      {/* ---------- como funciona ---------- */}
      <section className="cartao p-6 lg:p-8 mb-7">
        <h2 className="text-xl font-semibold text-texto text-center mb-8">
          Como <span className="texto-verde">funciona</span>
        </h2>
        <div className="grid gap-7 md:grid-cols-3">
          {[
            ["1", "Encontre no mapa", "Navegue por satélite, filtre por tipo e preço, e veja a divisa real de cada propriedade."],
            ["2", "Demonstre interesse", "Um clique e a central da Arini recebe seu contato na hora."],
            ["3", "Negocie com segurança", "A Arini verifica cada anúncio, organiza visitas e conduz até a escritura."],
          ].map(([n, titulo, desc], i) => (
            <div key={n} className={"text-center space-y-2 anima-subir-" + (i + 1)}>
              <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl bg-verde/12 text-verde text-lg font-bold">
                {n}
              </span>
              <p className="font-medium text-texto">{titulo}</p>
              <p className="text-sm text-texto-2 max-w-xs mx-auto">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-linha pt-5 pb-2 flex flex-wrap gap-3 items-center justify-between text-xs text-texto-2">
        <p>
          <span className="text-texto font-medium">{texto(cfg, "nome_sistema", "Arini Imóveis Brasil")}</span>
          {" "}· Arini Negócios Imobiliários
          {texto(cfg, "telefone_contato") && <> · {texto(cfg, "telefone_contato")}</>}
          {texto(cfg, "email_contato") && <> · {texto(cfg, "email_contato")}</>}
        </p>
        <nav className="flex gap-4">
          <Link href="/mapa" className="hover:text-verde">Mapa</Link>
          <Link href="/entrar" className="hover:text-verde">Anunciar</Link>
          <Link href="/entrar" className="hover:text-verde">Entrar</Link>
        </nav>
      </footer>
    </AppShell>
  );
}
