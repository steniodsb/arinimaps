import Link from "next/link";
import type { Metadata } from "next";
import {
  Box, Camera, LayoutGrid, List, Map as MapaIcone, MapPin, Ruler, Search, SearchX, ShieldCheck,
  SlidersHorizontal, Video, X,
} from "lucide-react";
import Moldura from "@/components/shell/Moldura";
import MiniaturaDivisa, { type GeoDivisa } from "@/components/imovel/MiniaturaDivisa";
import { BotaoLink, CabecalhoPagina, CAMPO, Conteudo, ROTULO, Vazio } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import { imoveisDaVitrine, STATUS_VITRINE } from "@/lib/imovel/vitrine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar Imóveis",
  description: "Fazendas, sítios, lotes e casas à venda na região, com área medida e divisa no mapa.",
};

const TIPOS = [
  { id: "todos", rotulo: "Todos" },
  { id: "rural", rotulo: "Rural" },
  { id: "urbano", rotulo: "Urbano" },
  { id: "leilao", rotulo: "Leilão" },
] as const;

const ORDENS = [
  { id: "recentes", rotulo: "Mais recentes" },
  { id: "menor", rotulo: "Menor preço" },
  { id: "maior", rotulo: "Maior preço" },
  { id: "area", rotulo: "Maior área" },
] as const;

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** "400.000", "R$ 400000" → 400000; vazio → null */
const numero = (v: unknown) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const milhar = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

type Extra = {
  car_codigo: string | null;
  geo: { geom: GeoDivisa } | null;
  versoes: { situacao: string }[];
  media: { tipo: string }[];
};

export default async function BuscarImoveis({ searchParams }: PageProps<"/imoveis">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q");
  const tipo = str("tipo") || "todos";
  const municipio = str("municipio");
  const ordem = str("ordem") || "recentes";
  const vista = str("vista") === "lista" ? "lista" : "grade";
  const precoMin = numero(sp.preco_min), precoMax = numero(sp.preco_max);
  const areaMin = numero(sp.area_min), areaMax = numero(sp.area_max);
  // área digitada em m² na busca de urbanos; nas demais, em hectares
  const unidadeArea = tipo === "urbano" ? "m²" : "ha";
  const fatorArea = tipo === "urbano" ? 1 : 10000;

  const admin = supabaseAdmin();
  const [{ data: bruto }, { data: municipios }, { data: extras }, user] = await Promise.all([
    imoveisDaVitrine(), // mesma consulta que o assistente de IA usa
    admin.from("municipalities").select("id, nome").eq("ativo", true).order("nome"),
    // divisa, CAR e validação: só para o cartão (a vitrine da IA não precisa)
    admin.from("properties")
      .select("codigo, car_codigo, geo:property_geometries(geom), versoes:property_geometry_versions(situacao), media:property_media(tipo)")
      .in("status", [...STATUS_VITRINE]),
    currentUser(),
  ]);
  const extraDe = new Map((extras ?? []).map((e) => [e.codigo, e as unknown as Extra]));

  type Linha = NonNullable<typeof bruto>[number];
  const areaDe = (p: Linha) => (p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? 0;
  const munDe = (p: Linha) => p.municipality as unknown as { id: string; nome: string; uf: string } | null;

  const filtrados = (bruto ?? []).filter((p) => {
    if (tipo === "leilao") { if (p.modalidade !== "leilao") return false; }
    else if (tipo !== "todos" && p.tipo !== tipo) return false;
    if (municipio && munDe(p)?.id !== municipio) return false;
    if (q) {
      const alvo = norm(`${p.titulo} ${p.codigo} ${munDe(p)?.nome ?? ""}`);
      if (!alvo.includes(norm(q))) return false;
    }
    if (precoMin && (p.valor ?? 0) < precoMin) return false;
    if (precoMax && (p.valor == null || p.valor > precoMax)) return false;
    if (areaMin && areaDe(p) < areaMin * fatorArea) return false;
    if (areaMax && areaDe(p) > areaMax * fatorArea) return false;
    return true;
  }).sort((a, b) => {
    if (ordem === "menor") return (a.valor ?? Infinity) - (b.valor ?? Infinity);
    if (ordem === "maior") return (b.valor ?? 0) - (a.valor ?? 0);
    if (ordem === "area") return areaDe(b) - areaDe(a);
    return String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""));
  });
  // vendidos não se misturam com os disponíveis
  const disponiveis = filtrados.filter((p) => p.status !== "vendido");
  const vendidos = filtrados.filter((p) => p.status === "vendido");

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  // links que mexem num parâmetro e mantêm os outros
  const atuais: Record<string, string> = {};
  for (const k of ["q", "tipo", "municipio", "ordem", "vista", "preco_min", "preco_max", "area_min", "area_max"]) {
    if (str(k)) atuais[k] = str(k);
  }
  const com = (muda: Record<string, string | null>) => {
    const p = new URLSearchParams(atuais);
    for (const [k, v] of Object.entries(muda)) {
      const padrao = (k === "tipo" && v === "todos") || (k === "ordem" && v === "recentes") || (k === "vista" && v === "grade");
      if (v == null || v === "" || padrao) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/imoveis?${s}` : "/imoveis";
  };

  const munNome = (municipios ?? []).find((m) => m.id === municipio)?.nome;
  const ativos: { rotulo: string; remove: Record<string, null> }[] = [
    ...(q ? [{ rotulo: `“${q}”`, remove: { q: null } }] : []),
    ...(tipo !== "todos" ? [{ rotulo: TIPOS.find((t) => t.id === tipo)?.rotulo ?? tipo, remove: { tipo: null, area_min: null, area_max: null } }] : []),
    ...(munNome ? [{ rotulo: munNome, remove: { municipio: null } }] : []),
    ...(precoMin ? [{ rotulo: `a partir de R$ ${milhar(precoMin)}`, remove: { preco_min: null } }] : []),
    ...(precoMax ? [{ rotulo: `até R$ ${milhar(precoMax)}`, remove: { preco_max: null } }] : []),
    ...(areaMin ? [{ rotulo: `mín. ${milhar(areaMin)} ${unidadeArea}`, remove: { area_min: null } }] : []),
    ...(areaMax ? [{ rotulo: `máx. ${milhar(areaMax)} ${unidadeArea}`, remove: { area_max: null } }] : []),
  ];

  const cartao = (p: Linha) => (
    <CartaoImovel key={p.codigo} p={p} extra={extraDe.get(p.codigo)} area={areaDe(p)} mun={munDe(p)} lista={vista === "lista"} />
  );
  const grade = vista === "lista" ? "grid gap-4" : "grid gap-6 sm:grid-cols-2 xl:grid-cols-3";
  const botaoBarra = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-verde/15 text-verde" : "text-texto-2 hover:text-texto"}`;

  return (
    <Moldura usuario={usuario}>
      <CabecalhoPagina
        variante="faixa"
        compacta
        eyebrow="Imóveis à venda"
        titulo="Encontre seu"
        destaque="imóvel"
        subtitulo="Fazendas, sítios e lotes da região com a área medida e a divisa conferida no mapa."
        acoes={<BotaoLink href="/mapa" variante="ouro">Ver no mapa</BotaoLink>}
      >
        {/* tipo: pílulas que filtram na hora (link, sem JS) */}
        <nav aria-label="Tipo de imóvel" className="mb-4 flex flex-wrap gap-2">
          {TIPOS.map((t) => {
            const on = tipo === t.id;
            return (
              <Link key={t.id} href={com({ tipo: t.id, area_min: null, area_max: null })} aria-current={on ? "true" : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${on
                  ? "border-verde bg-verde text-[#06140D]"
                  : "border-linha-forte bg-superficie/60 text-texto-3 hover:border-verde/60 hover:text-texto"}`}>
                {t.rotulo}
              </Link>
            );
          })}
        </nav>

        {/* demais filtros (GET, funcionam sem JS) */}
        <form className="grid gap-4 rounded-2xl border border-linha bg-superficie/70 p-5 backdrop-blur sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto] lg:items-end">
          {tipo !== "todos" && <input type="hidden" name="tipo" value={tipo} />}
          {ordem !== "recentes" && <input type="hidden" name="ordem" value={ordem} />}
          {vista !== "grade" && <input type="hidden" name="vista" value={vista} />}
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="q" className={ROTULO}>Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-texto-2" aria-hidden />
              <input id="q" name="q" defaultValue={q} placeholder="Nome, município ou código" className={`${CAMPO} pl-10`} />
            </div>
          </div>
          <div>
            <label htmlFor="municipio" className={ROTULO}>Município</label>
            <select id="municipio" name="municipio" defaultValue={municipio} className={CAMPO}>
              <option value="">Todos</option>
              {(municipios ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <fieldset className="min-w-0">
            <legend className={ROTULO}>Preço (R$)</legend>
            <div className="flex items-center gap-2">
              <input name="preco_min" inputMode="numeric" defaultValue={str("preco_min")} placeholder="mín." aria-label="Preço mínimo" className={CAMPO} />
              <span className="text-texto-2">–</span>
              <input name="preco_max" inputMode="numeric" defaultValue={str("preco_max")} placeholder="máx." aria-label="Preço máximo" className={CAMPO} />
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className={ROTULO}>Área ({unidadeArea})</legend>
            <div className="flex items-center gap-2">
              <input name="area_min" inputMode="decimal" defaultValue={str("area_min")} placeholder="mín." aria-label={`Área mínima em ${unidadeArea}`} className={CAMPO} />
              <span className="text-texto-2">–</span>
              <input name="area_max" inputMode="decimal" defaultValue={str("area_max")} placeholder="máx." aria-label={`Área máxima em ${unidadeArea}`} className={CAMPO} />
            </div>
          </fieldset>
          <button className="lp-btn lp-btn-verde !py-3 self-end text-[0.95rem]">
            <SlidersHorizontal /> Filtrar
          </button>
        </form>
      </CabecalhoPagina>

      <Conteudo className="py-8 md:py-10">
        {/* barra de resultados: contagem e filtros ativos à esquerda, ordem e visualização à direita */}
        <div className="mb-7 flex flex-col gap-4 border-b border-linha pb-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 font-display text-lg font-bold text-texto">
              {disponiveis.length} {disponiveis.length === 1 ? "imóvel disponível" : "imóveis disponíveis"}
            </p>
            {ativos.map((a) => (
              <Link key={a.rotulo} href={com(a.remove)} aria-label={`Remover filtro ${a.rotulo}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-verde/30 bg-verde/10 py-1 pl-3 pr-2 text-sm font-semibold text-verde transition hover:bg-verde/20">
                {a.rotulo} <X className="size-3.5" />
              </Link>
            ))}
            {ativos.length > 0 && (
              <Link href={com({ q: null, tipo: null, municipio: null, preco_min: null, preco_max: null, area_min: null, area_max: null })}
                className="text-sm font-semibold text-texto-2 underline-offset-4 hover:text-texto hover:underline">
                Limpar filtros
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Ordenar" className="flex flex-wrap gap-1 rounded-xl border border-linha bg-superficie p-1">
              {ORDENS.map((o) => (
                <Link key={o.id} href={com({ ordem: o.id })} aria-current={ordem === o.id ? "true" : undefined} className={botaoBarra(ordem === o.id)}>
                  {o.rotulo}
                </Link>
              ))}
            </nav>
            <nav aria-label="Visualização" className="flex gap-1 rounded-xl border border-linha bg-superficie p-1">
              <Link href={com({ vista: "grade" })} aria-current={vista === "grade" ? "true" : undefined} title="Grade" className={botaoBarra(vista === "grade")}>
                <LayoutGrid className="size-4" /> <span className="hidden sm:inline">Grade</span>
              </Link>
              <Link href={com({ vista: "lista" })} aria-current={vista === "lista" ? "true" : undefined} title="Lista" className={botaoBarra(vista === "lista")}>
                <List className="size-4" /> <span className="hidden sm:inline">Lista</span>
              </Link>
              <Link href="/mapa" title="Mapa" className={botaoBarra(false)}>
                <MapaIcone className="size-4" /> <span className="hidden sm:inline">Mapa</span>
              </Link>
            </nav>
          </div>
        </div>

        {!filtrados.length ? (
          <Vazio
            icone={SearchX}
            titulo="Nenhum imóvel com esses filtros."
            texto="Tente ampliar a busca ou veja tudo no mapa."
            acao={<BotaoLink href="/imoveis" variante="contorno">Limpar filtros</BotaoLink>}
          />
        ) : (
          <div className="space-y-14">
            {disponiveis.length > 0 && <div className={grade}>{disponiveis.map(cartao)}</div>}
            {vendidos.length > 0 && (
              <section aria-labelledby="titulo-vendidos" className="space-y-5">
                <h2 id="titulo-vendidos" className="lp-display text-2xl text-texto">Vendidos recentemente</h2>
                <div className={grade}>{vendidos.map(cartao)}</div>
              </section>
            )}
          </div>
        )}
      </Conteudo>
    </Moldura>
  );
}

function CartaoImovel({ p, extra, area, mun, lista }: {
  p: { codigo: string; titulo: string; tipo: string; status: string; valor: number | null; modalidade: string | null; media: unknown };
  extra?: Extra;
  area: number;
  mun: { nome: string; uf: string } | null;
  lista: boolean;
}) {
  const media = (p.media as { storage_path: string; capa: boolean }[] | null) ?? [];
  const capa = media.find((m) => m.capa) ?? media[0];
  const vendido = p.status === "vendido";
  const leilao = p.modalidade === "leilao" && !vendido;
  const rural = p.tipo === "rural";
  const geom = extra?.geo?.geom;
  const fotos = extra?.media.filter((m) => m.tipo !== "video").length ?? 0;
  const video = extra?.media.some((m) => m.tipo === "video") ?? false;
  const validada = extra?.versoes.some((v) => v.situacao === "validada") ?? false;
  const porUnidade = p.valor && area
    ? rural
      ? `R$ ${Math.round(p.valor / (area / 10000)).toLocaleString("pt-BR")}/ha`
      : `R$ ${Math.round(p.valor / area).toLocaleString("pt-BR")}/m²`
    : null;

  const selos = [
    validada && { icone: ShieldCheck, rotulo: "Divisa validada" },
    extra?.car_codigo && { icone: ShieldCheck, rotulo: "CAR conferido" },
    geom && { icone: Box, rotulo: "Tour 3D" },
    video && { icone: Video, rotulo: "Vídeo" },
    fotos > 0 && { icone: Camera, rotulo: `${fotos} ${fotos === 1 ? "foto" : "fotos"}` },
  ].filter(Boolean) as { icone: typeof ShieldCheck; rotulo: string }[];

  return (
    <Link href={`/imovel/${p.codigo}`}
      className={`lp-lift group flex h-full overflow-hidden rounded-[20px] bg-superficie ring-1 ring-linha hover:ring-verde/60 ${lista ? "flex-col sm:flex-row" : "flex-col"}`}>
      <div className={`relative shrink-0 overflow-hidden bg-superficie-2 ${lista ? "aspect-[16/10] sm:aspect-auto sm:min-h-52 sm:w-80" : "aspect-[16/10]"}`}>
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(capa.storage_path)} alt={p.titulo} loading="lazy" decoding="async"
            className={"absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06] " + (vendido ? "grayscale" : "")} />
        ) : geom ? (
          // sem foto: o próprio terreno visto do satélite, com a divisa
          <MiniaturaDivisa geom={geom}
            className={"absolute inset-0 h-full w-full transition duration-700 ease-out group-hover:scale-[1.04] " + (vendido ? "grayscale" : "")} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rural ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        {leilao ? (
          <span className="absolute left-4 top-4 rounded-md bg-[#B18CFF] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#160B2E]">Leilão</span>
        ) : (
          <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur">
            {rural ? "Rural" : p.tipo === "urbano" ? "Urbano" : p.tipo}
          </span>
        )}
        {vendido && (
          <span className="absolute right-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white/85 backdrop-blur">
            {STATUS_LABEL[p.status]}
          </span>
        )}
        {/* com foto, o formato do terreno vai num selo no canto */}
        {capa && geom && (
          <span className="absolute bottom-3 left-3 grid size-12 place-items-center rounded-lg bg-black/55 p-1.5 backdrop-blur" title="Formato do terreno">
            <MiniaturaDivisa geom={geom} soContorno proporcao={1} className="size-full" />
          </span>
        )}
        <span className="absolute bottom-3 right-4 font-mono text-xs text-white/85">{p.codigo}</span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="lp-display text-xl leading-snug text-texto transition group-hover:text-verde">{p.titulo}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-base text-texto-2">
          <MapPin className="size-4 shrink-0 text-verde" /> {mun ? `${mun.nome} / ${mun.uf}` : "—"}
        </p>
        {selos.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {selos.map(({ icone: Icone, rotulo }) => (
              <li key={rotulo} className="inline-flex items-center gap-1 rounded-md bg-superficie-2 px-2 py-1 text-xs font-semibold text-texto-2">
                <Icone className="size-3.5 text-verde" /> {rotulo}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            <span className={"lp-display block text-2xl " + (vendido ? "text-texto-2 line-through" : p.valor == null ? "text-texto" : "text-verde")}>
              {formatBRL(p.valor)}
            </span>
            {porUnidade && !vendido && <span className="mt-0.5 block text-sm text-texto-2">{porUnidade}</span>}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-right text-[15px] font-semibold text-texto">
            <Ruler className="size-4 text-texto-2" /> {formatArea(area || null, rural ? "rural" : "urbano")}
          </span>
        </div>
      </div>
    </Link>
  );
}
