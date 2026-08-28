import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";

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
    admin.from("properties")
      .select(`
        codigo, titulo, tipo, status, valor, published_at,
        municipality:municipalities(id, nome, uf),
        geo:property_geometries(area_m2),
        media:property_media(storage_path, capa)
      `)
      .in("status", ["publicado", "em_negociacao", "vendido"]),
    admin.from("municipalities").select("id, nome").eq("ativo", true).order("nome"),
    currentUser(),
  ]);

  type Linha = NonNullable<typeof bruto>[number];
  const areaDe = (p: Linha) => (p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? 0;
  const munDe = (p: Linha) => p.municipality as unknown as { id: string; nome: string; uf: string } | null;

  let lista = (bruto ?? []).filter((p) => {
    if (tipo !== "todos" && p.tipo !== tipo) return false;
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

  const chip = (ativo: boolean) =>
    "chip px-4 py-2 text-xs whitespace-nowrap" + (ativo ? "" : "");

  return (
    <AppShell usuario={usuario}>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-texto">Buscar imóveis</h1>
        <p className="text-sm text-texto-2">
          {lista.length} {lista.length === 1 ? "imóvel encontrado" : "imóveis encontrados"} na região.
        </p>
      </div>

      {/* ---------- filtros (GET, funcionam sem JS) ---------- */}
      <form className="cartao p-4 mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] items-end">
        <div>
          <label htmlFor="q" className="block text-xs text-texto-2 mb-1">Buscar</label>
          <input id="q" name="q" defaultValue={q} placeholder="Nome do imóvel, município ou código"
            className="w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde transition" />
        </div>
        <div>
          <label htmlFor="tipo" className="block text-xs text-texto-2 mb-1">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={tipo}
            className="rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde">
            <option value="todos">Todos</option>
            <option value="rural">Rural</option>
            <option value="urbano">Urbano</option>
          </select>
        </div>
        <div>
          <label htmlFor="municipio" className="block text-xs text-texto-2 mb-1">Município</label>
          <select id="municipio" name="municipio" defaultValue={municipio}
            className="rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde">
            <option value="">Todos</option>
            {(municipios ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div>
            <label htmlFor="ordem" className="block text-xs text-texto-2 mb-1">Ordenar</label>
            <select id="ordem" name="ordem" defaultValue={ordem}
              className="rounded-xl border border-linha bg-superficie-2 px-3 py-2.5 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde">
              {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
          </div>
          <button className="btn-verde px-5 py-2.5 text-sm self-end">Filtrar</button>
        </div>
      </form>

      {/* ---------- resultados ---------- */}
      {!lista.length ? (
        <div className="cartao p-10 text-center">
          <p className="text-texto">Nenhum imóvel com esses filtros.</p>
          <p className="text-sm text-texto-2 mt-1">Tente ampliar a busca ou veja tudo no mapa.</p>
          <Link href="/mapa" className="btn-contorno inline-block mt-4 px-5 py-2.5 text-sm">Abrir o mapa</Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const capa = (p.media as { storage_path: string; capa: boolean }[] | null)?.find((m) => m.capa)
              ?? (p.media as { storage_path: string }[] | null)?.[0];
            const mun = munDe(p);
            const vendido = p.status === "vendido";
            return (
              <Link key={p.codigo} href={`/imovel/${p.codigo}`}
                className="cartao overflow-hidden hover:border-verde/50 hover:-translate-y-1 transition group">
                <div className="h-44 relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/fazenda-gado.jpg"}
                    alt={p.titulo}
                    className={"w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 " + (vendido ? "grayscale" : "")} />
                  <span className="absolute top-3 left-3 text-[11px] rounded-full bg-fundo/85 text-texto px-3 py-1 capitalize backdrop-blur">
                    {p.tipo}
                  </span>
                  {vendido && (
                    <span className="absolute top-3 right-3 text-[11px] rounded-full bg-fundo/85 text-texto-2 px-3 py-1">
                      {STATUS_LABEL[p.status]}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-medium text-texto leading-snug">{p.titulo}</p>
                  <p className="text-xs text-texto-2">
                    {mun ? `${mun.nome} / ${mun.uf}` : "—"} · <span className="font-mono">{p.codigo}</span>
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className={vendido ? "text-texto-2 line-through" : "text-verde font-semibold"}>
                      {formatBRL(p.valor)}
                    </span>
                    <span className="text-[11px] text-texto-2">
                      {formatArea(areaDe(p) || null, p.tipo as "urbano" | "rural")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
