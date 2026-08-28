import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { formatArea } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Relatórios",
  description: "Relatórios territoriais dos imóveis rurais, com incidências de fontes oficiais.",
};

export default async function Relatorios() {
  const admin = supabaseAdmin();
  const [{ data: imoveis }, { data: consultas }, user] = await Promise.all([
    admin.from("properties")
      .select("id, codigo, titulo, tipo, status, municipality:municipalities(nome), geo:property_geometries(area_m2)")
      .eq("tipo", "rural")
      .in("status", ["publicado", "em_negociacao", "vendido"])
      .order("published_at", { ascending: false }),
    admin.from("consultas_rurais").select("property_id, quantidade, incide, erro, consultado_em"),
    currentUser(),
  ]);

  const porImovel = new Map<string, { fontes: number; incidencias: number; ultima: string | null }>();
  for (const c of consultas ?? []) {
    const atual = porImovel.get(c.property_id) ?? { fontes: 0, incidencias: 0, ultima: null };
    atual.fontes += 1;
    if (c.incide) atual.incidencias += c.quantidade;
    if (!atual.ultima || c.consultado_em > atual.ultima) atual.ultima = c.consultado_em;
    porImovel.set(c.property_id, atual);
  }

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  return (
    <AppShell usuario={usuario}>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-texto">Relatórios territoriais</h1>
        <p className="text-sm text-texto-2">
          Cruzamento da área do imóvel com mineração, terras indígenas, desmatamento e entorno.
          Cada relatório mostra a origem e a data de cada dado.
        </p>
      </div>

      {!imoveis?.length ? (
        <div className="cartao p-10 text-center">
          <p className="text-texto">Nenhum imóvel rural publicado ainda.</p>
          <Link href="/mapa" className="btn-contorno inline-block mt-4 px-5 py-2.5 text-sm">Abrir o mapa</Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {imoveis.map((p) => {
            const info = porImovel.get(p.id);
            const mun = p.municipality as unknown as { nome: string } | null;
            const area = (p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? null;
            return (
              <Link key={p.codigo} href={`/imovel/${p.codigo}/relatorio`}
                className="cartao p-4 hover:border-verde/50 transition flex items-center gap-4">
                <span className="w-11 h-11 rounded-xl bg-critico/12 text-critico grid place-items-center text-lg shrink-0">
                  ▤
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-texto truncate">{p.titulo}</p>
                  <p className="text-xs text-texto-2">
                    {mun?.nome ?? "—"} · {formatArea(area, "rural")}
                  </p>
                  <p className="text-[11px] mt-1">
                    {info ? (
                      <>
                        <span className={info.incidencias ? "text-ouro" : "text-verde"}>
                          {info.incidencias
                            ? `${info.incidencias} incidência(s) em ${info.fontes} fonte(s)`
                            : `sem incidências em ${info.fontes} fonte(s)`}
                        </span>
                        {info.ultima && (
                          <span className="text-texto-2">
                            {" "}· {new Date(info.ultima).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-texto-2">consulta territorial ainda não executada</span>
                    )}
                  </p>
                </div>
                <span className="text-texto-2 shrink-0">›</span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-texto-2 mt-6">
        A consulta territorial é executada pela equipe Arini na análise do imóvel.
        O relatório sempre mostra a data de cada fonte — dado antigo é sinalizado, nunca apresentado como atual.
      </p>
    </AppShell>
  );
}
