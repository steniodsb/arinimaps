import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, FileText, MapPin, Ruler } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import { BotaoLink, CabecalhoPagina, Conteudo, Etiqueta, Vazio } from "@/components/ui/Pagina";
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
    <AppShell usuario={usuario} semPadding>
      <CabecalhoPagina
        variante="faixa"
        eyebrow="Inteligência territorial"
        titulo="Relatórios"
        destaque="territoriais"
        subtitulo="Cruzamento da área do imóvel com mineração, terras indígenas, desmatamento e entorno. Cada relatório mostra a origem e a data de cada dado."
        acoes={<BotaoLink href="/mapa" variante="ouro">Abrir o mapa</BotaoLink>}
      />

      <Conteudo className="space-y-8 py-12 md:py-16">
        {!imoveis?.length ? (
          <Vazio
            icone={FileText}
            titulo="Nenhum imóvel rural publicado ainda."
            acao={<BotaoLink href="/mapa" variante="contorno">Abrir o mapa</BotaoLink>}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {imoveis.map((p) => {
              const info = porImovel.get(p.id);
              const mun = p.municipality as unknown as { nome: string } | null;
              const area = (p.geo as unknown as { area_m2: number | null } | null)?.area_m2 ?? null;
              return (
                <Link key={p.codigo} href={`/imovel/${p.codigo}/relatorio`}
                  className="cartao cartao-link group flex items-center gap-5 p-5 md:p-6">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde">
                    <FileText className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="lp-display truncate text-lg text-texto transition group-hover:text-verde">{p.titulo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-2">
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-verde" /> {mun?.nome ?? "—"}</span>
                      <span className="inline-flex items-center gap-1"><Ruler className="size-3.5" /> {formatArea(area, "rural")}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {info ? (
                        <>
                          <Etiqueta tom={info.incidencias ? "ouro" : "verde"} className="!whitespace-normal">
                            {info.incidencias
                              ? `${info.incidencias} incidência(s) em ${info.fontes} fonte(s)`
                              : `sem incidências em ${info.fontes} fonte(s)`}
                          </Etiqueta>
                          {info.ultima && (
                            <span className="text-xs text-texto-2">
                              {new Date(info.ultima).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </>
                      ) : (
                        <Etiqueta tom="neutro" className="!whitespace-normal">consulta territorial ainda não executada</Etiqueta>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-texto-2 transition group-hover:translate-x-0.5 group-hover:text-verde" />
                </Link>
              );
            })}
          </div>
        )}

        <p className="max-w-3xl text-sm leading-relaxed text-texto-2">
          A consulta territorial é executada pela equipe Arini na análise do imóvel.
          O relatório sempre mostra a data de cada fonte — dado antigo é sinalizado, nunca apresentado como atual.
        </p>
      </Conteudo>
    </AppShell>
  );
}
