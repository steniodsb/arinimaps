import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Ruler, Search, SearchX, SlidersHorizontal } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import { BotaoLink, CabecalhoPagina, CAMPO, Conteudo, ROTULO, Vazio } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import { imoveisDaVitrine } from "@/lib/imovel/vitrine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar Imóveis",
  description: "Fazendas, sítios, lotes e casas à venda na região, com área medida e divisa no mapa.",
};

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

export default async function BuscarImoveis({ searchParams }: PageProps<"/imoveis">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "todos";
  const municipio = typeof sp.municipio === "string" ? sp.municipio : "";
  const ordem = typeof sp.ordem === "string" ? sp.ordem : "recentes";

  const admin = supabaseAdmin();
  const [{ data: bruto }, { data: municipios }, user] = await Promise.all([
    imoveisDaVitrine(), // mesma consulta que o assistente de IA usa

    admin.from("municipalities").select("id, nome").eq("ativo", true).order("nome"),
    currentUser(),
  ]);

  type Linha = NonNullable<typeof bruto>[number];
  const areaDe = (p: Linha) => (p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? 0;
  const munDe = (p: Linha) => p.municipality as unknown as { id: string; nome: string; uf: string } | null;

  let lista = (bruto ?? []).filter((p) => {
    if (tipo === "leilao") { if (p.modalidade !== "leilao") return false; }
    else if (tipo !== "todos" && p.tipo !== tipo) return false;
    if (municipio && munDe(p)?.id !== municipio) return false;
    if (q) {
      const alvo = norm(`${p.titulo} ${p.codigo} ${munDe(p)?.nome ?? ""}`);
      if (!alvo.includes(norm(q))) return false;
    }
    return true;
  });

  lista = lista.sort((a, b) => {
    if (ordem === "menor") return (a.valor ?? Infinity) - (b.valor ?? Infinity);
    if (ordem === "maior") return (b.valor ?? 0) - (a.valor ?? 0);
    if (ordem === "area") return areaDe(b) - areaDe(a);
    return String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""));
  });

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;
  return (
    <AppShell usuario={usuario} semPadding>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Imóveis à venda"
        titulo="Encontre seu"
        destaque="imóvel"
        subtitulo={`${lista.length} ${lista.length === 1 ? "imóvel encontrado" : "imóveis encontrados"} na região, com área medida e divisa no mapa.`}
        acoes={<BotaoLink href="/mapa" variante="ouro">Ver no mapa</BotaoLink>}
      >
        {/* ---------- filtros (GET, funcionam sem JS) ---------- */}
        <form className="grid gap-4 rounded-2xl border border-linha bg-superficie/70 p-5 backdrop-blur sm:grid-cols-2 md:p-6 xl:grid-cols-[minmax(0,1fr)_9rem_11rem_10rem_auto] xl:items-end">
          <div className="sm:col-span-2 xl:col-span-1">
            <label htmlFor="q" className={ROTULO}>Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-texto-2" aria-hidden />
              <input id="q" name="q" defaultValue={q} placeholder="Nome do imóvel, município ou código"
                className={`${CAMPO} pl-10`} />
            </div>
          </div>
          <div>
            <label htmlFor="tipo" className={ROTULO}>Tipo</label>
            <select id="tipo" name="tipo" defaultValue={tipo} className={CAMPO}>
              <option value="todos">Todos</option>
              <option value="rural">Rural</option>
              <option value="urbano">Urbano</option>
              <option value="leilao">Leilão</option>
            </select>
          </div>
          <div>
            <label htmlFor="municipio" className={ROTULO}>Município</label>
            <select id="municipio" name="municipio" defaultValue={municipio} className={CAMPO}>
              <option value="">Todos</option>
              {(municipios ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ordem" className={ROTULO}>Ordenar</label>
            <select id="ordem" name="ordem" defaultValue={ordem} className={CAMPO}>
              {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
          </div>
          <button className="lp-btn lp-btn-verde !py-3 self-end text-[0.95rem]">
            <SlidersHorizontal /> Filtrar
          </button>
        </form>
      </CabecalhoPagina>

      {/* ---------- resultados ---------- */}
      <Conteudo className="py-12 md:py-16">
        {!lista.length ? (
          <Vazio
            icone={SearchX}
            titulo="Nenhum imóvel com esses filtros."
            texto="Tente ampliar a busca ou veja tudo no mapa."
            acao={<BotaoLink href="/mapa" variante="contorno">Abrir o mapa</BotaoLink>}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((p) => {
              const capa = (p.media as { storage_path: string; capa: boolean }[] | null)?.find((m) => m.capa)
                ?? (p.media as { storage_path: string }[] | null)?.[0];
              const mun = munDe(p);
              const vendido = p.status === "vendido";
              const leilao = p.modalidade === "leilao" && !vendido;
              return (
                <Link key={p.codigo} href={`/imovel/${p.codigo}`}
                  className="lp-lift group flex h-full flex-col overflow-hidden rounded-[20px] bg-superficie ring-1 ring-linha hover:ring-verde/60">
                  <div className="relative aspect-[16/10] overflow-hidden bg-superficie-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                      alt={p.titulo}
                      loading="lazy"
                      decoding="async"
                      className={"absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06] " + (vendido ? "grayscale" : "")} />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
                    {leilao ? (
                      <span className="absolute left-4 top-4 rounded-md bg-[#B18CFF] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#160B2E]">
                        Leilão
                      </span>
                    ) : (
                      <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur">
                        {p.tipo === "rural" ? "Rural" : p.tipo === "urbano" ? "Urbano" : p.tipo}
                      </span>
                    )}
                    {vendido && (
                      <span className="absolute right-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white/85 backdrop-blur">
                        {STATUS_LABEL[p.status]}
                      </span>
                    )}
                    <span className="absolute bottom-3 right-4 font-mono text-xs text-white/80">{p.codigo}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="lp-display text-xl leading-snug text-texto transition group-hover:text-verde">{p.titulo}</h2>
                    <p className="mt-2 flex items-center gap-1.5 text-base text-texto-2">
                      <MapPin className="size-4 shrink-0 text-verde" /> {mun ? `${mun.nome} / ${mun.uf}` : "—"}
                    </p>
                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                      <span className={"lp-display text-2xl " + (vendido ? "text-texto-2 line-through" : "text-verde")}>
                        {formatBRL(p.valor)}
                      </span>
                      <span className="flex items-center gap-1.5 text-[15px] text-texto-2">
                        <Ruler className="size-4" /> {formatArea(areaDe(p) || null, p.tipo as "urbano" | "rural")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Conteudo>
    </AppShell>
  );
}
