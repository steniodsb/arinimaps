import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, ArrowRight, Bath, BedDouble, Building, CalendarDays, Car, Check, ChevronRight, Cross, DoorOpen,
  ExternalLink, FileText, Fuel, Gavel, GraduationCap, Hash, Hospital, Landmark, MapPin, Navigation, Rotate3d,
  Route, Ruler, ShieldCheck, ShoppingCart, Sprout,
} from "lucide-react";
import Moldura from "@/components/shell/Moldura";
import { Conteudo, Etiqueta, Secao } from "@/components/ui/Pagina";
import { currentUser } from "@/lib/supabase/server";
import MiniMapa from "@/components/map/MiniMapa";
import InteresseForm from "@/components/InteresseForm";
import BotaoCompartilhar from "@/components/BotaoCompartilhar";
import GaleriaImovel, { type Slide } from "@/components/GaleriaImovel";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, formatArea, STATUS_LABEL } from "@/lib/format";
import { registrarEventoImovel, ORIGEM_DADO_LABEL } from "@/lib/imovel/eventos";
import { ator, temRecurso } from "@/lib/authz";
import CartaoAvaliacaoPublico from "@/components/avaliacao/CartaoAvaliacaoPublico";
import { CATEGORIA_POI_LABEL, formatDistancia } from "@/lib/geo/distancia";

type Media = { tipo: string; path: string; capa: boolean };

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

type Leilao = {
  praca1_data?: string | null; praca1_lance?: number | null; praca2_data?: string | null; praca2_lance?: number | null;
  processo?: string | null; comitente?: string | null; site?: string | null; condicoes?: string | null;
};
const quandoPraca = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" }) : null;

async function getImovel(codigo: string) {
  const { data } = await supabaseAdmin().rpc("fn_property_public", { p_codigo: codigo });
  return data as {
    codigo: string; tipo: "urbano" | "rural"; status: string; titulo: string;
    descricao: string; valor: number | null; area_declarada: number | null;
    caracteristicas: Record<string, unknown>; condicoes_venda: string | null;
    aceita_permuta: boolean; aceita_financiamento: boolean;
    municipio: { nome: string; uf: string } | null;
    geometry: GeoJSON.Geometry | null; area_m2: number | null; perimeter_m: number | null;
    media: Media[];
  } | null;
}

export async function generateMetadata(
  { params }: PageProps<"/imovel/[codigo]">
): Promise<Metadata> {
  const { codigo } = await params;
  const imovel = await getImovel(codigo);
  if (!imovel) return { title: "Imóvel não encontrado" };
  const capa = imovel.media.find((m) => m.capa) ?? imovel.media[0];
  return {
    title: `${imovel.titulo} — ${imovel.codigo}`,
    description: imovel.descricao.slice(0, 160),
    openGraph: {
      title: imovel.titulo,
      description: `${formatBRL(imovel.valor)} · ${imovel.municipio?.nome ?? ""} — Arini Imóveis Brasil`,
      images: capa ? [mediaUrl(capa.path)] : [],
    },
  };
}

/** Ficha técnica: mostra só o que o anúncio realmente informou. */
function fichaTecnica(
  c: Record<string, unknown>,
  areaM2: number | null,
  tipo: "urbano" | "rural"
): { rotulo: string; valor: string; icone: LucideIcon }[] {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const itens: { rotulo: string; valor: string; icone: LucideIcon }[] = [];
  const add = (chave: string, rotulo: string, icone: LucideIcon) => {
    const v = c[chave];
    if (v != null && v !== "" && num(v) > 0) itens.push({ rotulo, valor: String(num(v)), icone });
  };
  add("quartos", "Quartos", BedDouble);
  add("suites", "Suítes", DoorOpen);
  add("banheiros", "Banheiros", Bath);
  add("vagas", "Vagas", Car);
  if (areaM2) itens.push({ rotulo: "Área", valor: formatArea(areaM2, tipo), icone: Ruler });
  if (typeof c.zoneamento === "string") itens.push({ rotulo: "Zoneamento", valor: c.zoneamento, icone: Building });
  if (typeof c.solo === "string") itens.push({ rotulo: "Solo", valor: c.solo, icone: Sprout });
  return itens;
}

/** Ícone por categoria de ponto de interesse (os rótulos vêm de lib/geo/distancia). */
const POI_ICONE: Record<string, LucideIcon> = {
  combustivel: Fuel, farmacia: Cross, supermercado: ShoppingCart, hospital: Hospital,
  escola: GraduationCap, centro: Landmark, acesso_rodovia: Route,
};

export default async function PaginaImovel({ params }: PageProps<"/imovel/[codigo]">) {
  const { codigo } = await params;
  const imovel = await getImovel(codigo);
  if (!imovel) notFound();

  const admin = supabaseAdmin();
  const { data: propId } = await admin.from("properties").select("id, modalidade, leilao, owner_id, partner_id").eq("codigo", codigo).single();
  const leilao = propId?.modalidade === "leilao" ? (propId.leilao ?? {}) as Leilao : null;
  const [{ data: tourData }, { data: video }, { data: unidades }, { data: whats }, { data: divisa }, { data: origemCadastro }] = await Promise.all([
    admin.rpc("fn_property_tour", { p_codigo: codigo }),
    admin.from("presentations").select("output_path")
      .eq("tipo", "video").eq("status", "pronto").not("output_path", "is", null)
      .eq("property_id", propId?.id ?? "").maybeSingle(),
    admin.from("properties")
      .select("codigo, titulo, valor, status")
      .eq("parent_property_id", propId?.id ?? "")
      .in("status", ["publicado", "em_negociacao", "vendido"])
      .order("titulo"),
    admin.from("settings").select("valor").eq("chave", "whatsapp_central").maybeSingle(),
    // rastreabilidade (§1.3/§1.5): versão atual da divisa e origem do cadastro
    admin.from("property_geometry_versions").select("versao, situacao, validada_em")
      .eq("property_id", propId?.id ?? "").neq("situacao", "substituida")
      .order("versao", { ascending: false }).limit(1).maybeSingle(),
    admin.from("property_data_sources").select("origem")
      .eq("property_id", propId?.id ?? "").eq("campo", "cadastro")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const pois = ((tourData as { pois?: { nome: string | null; categoria: string; distancia_m: number }[] } | null)?.pois ?? [])
    .slice(0, 10);
  const centroid = (tourData as { centroid?: { lng: number; lat: number } } | null)?.centroid;
  const whatsapp = (typeof whats?.valor === "string" ? whats.valor : null)
    ?? process.env.NEXT_PUBLIC_WHATSAPP_ARINI
    ?? null;

  const fotos = imovel.media.filter((m) => m.tipo === "foto");
  const benfeitorias = (imovel.caracteristicas?.benfeitorias as string[] | undefined) ?? [];
  const ficha = fichaTecnica(imovel.caracteristicas ?? {}, imovel.area_m2, imovel.tipo);
  const vendido = imovel.status === "vendido";

  // slides: fotos → vídeo (se pronto) → tour 3D (se houver geometria)
  const slides: Slide[] = [
    ...fotos.map((f) => ({ tipo: "foto" as const, url: mediaUrl(f.path) })),
    // vídeos enviados pelo anunciante, depois o vídeo automático do sobrevoo
    ...imovel.media.filter((m) => m.tipo === "video").map((v) => ({ tipo: "video" as const, url: mediaUrl(v.path) })),
    ...(video?.output_path ? [{ tipo: "video" as const, url: mediaUrl(video.output_path) }] : []),
    ...(imovel.geometry
      ? [{ tipo: "tour" as const, href: `/imovel/${imovel.codigo}/tour`, poster: fotos[0] ? mediaUrl(fotos[0].path) : null }]
      : []),
  ];

  const user = await currentUser();
  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  // §1.1: abertura da ficha vira evento (nunca derruba a página)
  if (propId?.id) void registrarEventoImovel({ propertyId: propId.id, tipo: "ficha", userId: user?.id, detalhe: { codigo } });

  // histórico completo: dono, parceiro responsável ou quem tem o recurso no plano
  const a = user ? await ator() : null;
  const podeVerHistorico = !!a && !!propId && (
    a.ehArini || temRecurso(a, "historico_imovel") ||
    (!!a.ownerId && propId.owner_id === a.ownerId) || (!!a.partnerId && propId.partner_id === a.partnerId)
  );

  return (
    <Moldura usuario={usuario}>
      {/* ---------- topo em faixa escura: trilha, selos, título e preço ---------- */}
      <header className="lp-escuro lp-malha-escura relative overflow-hidden">
        <div className="lp-grade pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <Conteudo className="relative pt-8 pb-10 md:pt-10 md:pb-14">
          <nav aria-label="Trilha" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-texto-2">
            <Link href="/" className="transition hover:text-verde">Home</Link>
            <ChevronRight className="size-3.5 shrink-0 opacity-60" />
            <Link href="/mapa" className="transition hover:text-verde">Imóveis</Link>
            <ChevronRight className="size-3.5 shrink-0 opacity-60" />
            <span className="min-w-0 truncate font-semibold text-texto">{imovel.titulo}</span>
          </nav>

          <Link href="/mapa" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-texto-2 transition hover:text-verde">
            <ArrowLeft className="size-4" /> Voltar para o mapa
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${vendido ? "bg-white/10 text-texto-2" : leilao ? "bg-[#B18CFF] text-[#160B2E]" : "bg-verde text-[#0A1F14]"}`}>
              {vendido ? "Vendido" : leilao ? "Leilão" : "Disponível"}
            </span>
            <span className="flex items-center gap-1.5 text-[15px] text-texto-2">
              <MapPin className="size-4 text-verde" />
              {imovel.municipio ? `${imovel.municipio.nome} / ${imovel.municipio.uf}` : "Região piloto"}
            </span>
            <span className="flex items-center gap-1 font-mono text-sm text-texto-2">
              <Hash className="size-3.5" />{imovel.codigo}
            </span>
            <span className="rounded-md border border-linha-forte px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-texto-3">
              {imovel.tipo}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <h1 className="lp-display max-w-3xl text-balance text-3xl text-texto sm:text-4xl md:text-[3.25rem]">
              {imovel.titulo}
            </h1>
            <div className="shrink-0 md:text-right">
              <p className="lp-eyebrow !text-xs">{leilao ? "Lance inicial" : "Venda"}</p>
              <p className="lp-display mt-1.5 text-4xl text-[var(--ouro-claro)] md:text-[2.75rem]">{formatBRL(imovel.valor)}</p>
            </div>
          </div>
        </Conteudo>
      </header>

      <Conteudo className="py-10 md:py-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* ---------- coluna principal ---------- */}
          <div className="min-w-0 space-y-12 md:space-y-14">
            {(slides.length > 0 || ficha.length > 0) && (
              <div className="space-y-6">
                {slides.length > 0 && <GaleriaImovel slides={slides} titulo={imovel.titulo} />}

                {ficha.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                    {ficha.map((f) => {
                      const Icone = f.icone;
                      return (
                        <div key={f.rotulo} className="cartao !border-l-4 !border-l-verde p-5">
                          <span className="grid size-10 place-items-center rounded-xl bg-verde/12 text-verde">
                            <Icone className="size-5" />
                          </span>
                          <p className="lp-display mt-4 break-words text-2xl leading-tight text-texto">{f.valor}</p>
                          <p className="mt-1.5 text-sm text-texto-2">{f.rotulo}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {benfeitorias.length > 0 && (
              <Secao eyebrow="Benfeitorias" titulo="Diferenciais">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {benfeitorias.map((b) => (
                    <li key={b} className="cartao flex items-center gap-3 px-5 py-4 text-base">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ouro/15 text-ouro">
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                      <span className="capitalize text-texto">{b}</span>
                    </li>
                  ))}
                </ul>
              </Secao>
            )}

            <Secao titulo="Sobre o imóvel">
              <div className="max-w-[68ch] whitespace-pre-line text-[17px] leading-relaxed text-texto-3">
                {imovel.descricao || "Descrição não informada."}
              </div>
            </Secao>

            {imovel.geometry && (
              <Secao eyebrow="Divisa no mapa" titulo="Localização e área">
                <MiniMapa geometry={imovel.geometry} status={imovel.status}
                  className="h-80 w-full overflow-hidden rounded-[20px] border border-linha md:h-[26rem]" />
                <p className="text-[15px] leading-relaxed text-texto-2">
                  Área medida no mapa: <strong className="text-texto">{formatArea(imovel.area_m2, imovel.tipo)}</strong>
                  {imovel.perimeter_m ? ` · perímetro ${(imovel.perimeter_m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null}
                  {imovel.area_declarada ? ` · área declarada pelo anunciante: ${imovel.area_declarada.toLocaleString("pt-BR")} ${imovel.tipo === "rural" ? "ha" : "m²"}` : null}
                </p>
              </Secao>
            )}

            {/* 5.3/5.4: só com a função ligada pela Diretoria e o recurso no plano */}
            <CartaoAvaliacaoPublico propertyId={propId?.id} tipo={imovel.tipo} status={imovel.status} />

            {!!unidades?.length && (
              <Secao eyebrow="Empreendimento" titulo="Unidades deste empreendimento">
                <div className="cartao divide-y divide-linha overflow-hidden !p-0">
                  {unidades.map((u) => (
                    <Link key={u.codigo} href={`/imovel/${u.codigo}`}
                      className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-superficie-2">
                      <span className="min-w-0 flex-1 font-semibold text-texto transition group-hover:text-verde">{u.titulo}</span>
                      <span className="lp-display text-lg tabular-nums text-verde">{formatBRL(u.valor)}</span>
                      <Etiqueta tom={u.status === "vendido" ? "neutro" : "verde"}>{STATUS_LABEL[u.status]}</Etiqueta>
                    </Link>
                  ))}
                </div>
              </Secao>
            )}

            {pois.length > 0 && (
              <Secao eyebrow="Arredores" titulo="Pontos de interesse próximos"
                subtitulo="Distâncias em linha reta, do centro do imóvel. Fonte: OpenStreetMap, atualizada periodicamente.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {pois.map((p, i) => {
                    const Icone = POI_ICONE[p.categoria] ?? MapPin;
                    return (
                      <div key={i} className="cartao flex items-center gap-3.5 px-4 py-3.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde">
                          <Icone className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-texto">
                            {p.nome ?? CATEGORIA_POI_LABEL[p.categoria] ?? p.categoria}
                          </span>
                          {p.nome && <span className="block text-xs text-texto-2">{CATEGORIA_POI_LABEL[p.categoria] ?? p.categoria}</span>}
                        </span>
                        <span className="lp-display shrink-0 text-lg tabular-nums text-texto">{formatDistancia(p.distancia_m)}</span>
                      </div>
                    );
                  })}
                </div>
              </Secao>
            )}

            {leilao && (
              <section className="cartao space-y-5 !border-[#B18CFF]/40 p-6 md:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#B18CFF]/15 text-[#B18CFF]">
                    <Gavel className="size-5" />
                  </span>
                  <h2 className="lp-display text-2xl text-texto md:text-[1.75rem]">Leilão</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2].map((n) => {
                    const data = quandoPraca(n === 1 ? leilao.praca1_data : leilao.praca2_data);
                    const lance = n === 1 ? leilao.praca1_lance : leilao.praca2_lance;
                    if (!data && lance == null) return null;
                    return (
                      <div key={n} className="rounded-xl border border-linha bg-superficie-2 p-5">
                        <p className="text-xs font-bold uppercase tracking-wider text-texto-2">{n}ª praça</p>
                        <p className="mt-1.5 flex items-center gap-2 font-semibold text-texto">
                          <CalendarDays className="size-4 shrink-0 text-[#B18CFF]" /> {data ?? "Data a definir"}
                        </p>
                        {lance != null && <p className="mt-1 text-[15px] font-semibold text-ouro">Lance mínimo {formatBRL(Number(lance))}</p>}
                      </div>
                    );
                  })}
                </div>
                <dl className="space-y-1.5 text-[15px]">
                  {leilao.comitente && <div className="flex gap-2"><dt className="text-texto-2">Comitente:</dt><dd className="text-texto">{leilao.comitente}</dd></div>}
                  {leilao.processo && <div className="flex gap-2"><dt className="text-texto-2">Processo:</dt><dd className="text-texto">{leilao.processo}</dd></div>}
                </dl>
                {leilao.condicoes && <p className="whitespace-pre-line text-[15px] leading-relaxed text-texto-2">{leilao.condicoes}</p>}
                {leilao.site && (
                  <a href={leilao.site} target="_blank" rel="noreferrer" className="lp-btn lp-btn-contorno !px-5 !py-3 text-[0.95rem]">
                    Ir para a página do leilão <ExternalLink />
                  </a>
                )}
                <p className="text-sm text-texto-2">
                  Os lances são dados na página do leiloeiro, nas condições do edital. Leia o edital antes de participar.
                </p>
              </section>
            )}

            {imovel.condicoes_venda && (
              <Secao titulo="Condições de venda">
                <p className="text-[17px] leading-relaxed text-texto-3">{imovel.condicoes_venda}</p>
                {(imovel.aceita_permuta || imovel.aceita_financiamento) && (
                  <div className="flex flex-wrap gap-2">
                    {imovel.aceita_permuta && <Etiqueta tom="verde"><Check className="size-3.5" /> Aceita permuta</Etiqueta>}
                    {imovel.aceita_financiamento && <Etiqueta tom="verde"><Check className="size-3.5" /> Aceita financiamento</Etiqueta>}
                  </div>
                )}
              </Secao>
            )}
          </div>

          {/* ---------- coluna lateral ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            {vendido ? (
              <div className="cartao p-6 text-center">
                <p className="text-base text-texto-2">Este imóvel já foi vendido pela Arini.</p>
                <Link href="/mapa" className="lp-btn lp-btn-ouro mt-5 w-full">Ver outros imóveis <ArrowRight /></Link>
              </div>
            ) : (
              <InteresseForm codigo={imovel.codigo} titulo={imovel.titulo} whatsapp={whatsapp} />
            )}

            {imovel.geometry && (
              <Link href={`/imovel/${imovel.codigo}/tour`} className="lp-btn lp-btn-verde w-full">
                <Rotate3d /> Ver tour 3D da propriedade
              </Link>
            )}
            {imovel.tipo === "rural" && (
              <Link href={`/imovel/${imovel.codigo}/relatorio`} className="lp-btn lp-btn-contorno w-full !py-3">
                <FileText /> Relatório territorial
              </Link>
            )}
            <BotaoCompartilhar codigo={imovel.codigo} titulo={imovel.titulo} />
            {centroid && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${centroid.lat},${centroid.lng}`}
                target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-[10px] border border-linha-forte bg-superficie py-3 text-sm font-bold text-texto transition hover:border-verde hover:text-verde">
                <Navigation className="size-4" /> Como chegar até o imóvel
              </a>
            )}
            {(divisa || origemCadastro) && (
              <div className="cartao space-y-2 p-5 text-sm">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-texto-2">
                  <ShieldCheck className="size-4 text-verde" /> Rastreabilidade
                </p>
                {divisa && (
                  <p className={divisa.situacao === "validada" ? "flex items-start gap-1.5 font-semibold text-verde" : "text-texto-2"}>
                    {divisa.situacao === "validada"
                      ? <><Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} />{`Divisa validada pela Arini${divisa.validada_em ? ` em ${new Date(divisa.validada_em).toLocaleDateString("pt-BR")}` : ""}`}</>
                      : "Divisa informada pelo anunciante (em análise)"}
                  </p>
                )}
                {divisa && <p className="text-texto-2">Versão {divisa.versao} da divisa</p>}
                {origemCadastro && (
                  <p className="text-texto-2">Origem do cadastro: {ORIGEM_DADO_LABEL[origemCadastro.origem] ?? origemCadastro.origem}</p>
                )}
                {podeVerHistorico && propId && (
                  <Link href={`/painel/imoveis/${propId.id}`} className="inline-flex items-center gap-1 pt-1 text-sm font-semibold text-verde hover:underline">
                    Ver histórico completo <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
            <p className="text-center text-xs text-texto-2">
              Intermediação: Arini Negócios Imobiliários
            </p>
          </aside>
        </div>
      </Conteudo>
    </Moldura>
  );
}
