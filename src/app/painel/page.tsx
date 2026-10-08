import Link from "next/link";
import { Building2, Clock, CheckCircle2, Handshake, Plus, AlertTriangle, FileWarning, ArrowRight } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBRL, STATUS_LABEL } from "@/lib/format";
import { Secao, Estatistica, Vazio, Etiqueta, BotaoLink } from "@/components/ui/Pagina";
import MiniaturaDivisa, { type GeoDivisa } from "@/components/imovel/MiniaturaDivisa";

type Tom = "verde" | "ouro" | "alerta" | "critico" | "neutro" | "roxo";
const STATUS_TOM: Record<string, Tom> = {
  rascunho: "neutro",
  pendente: "alerta",
  em_analise: "alerta",
  correcao: "alerta",
  aprovado: "verde",
  publicado: "verde",
  em_negociacao: "ouro",
  vendido: "neutro",
  reprovado: "critico",
};
const EM_ANALISE = ["pendente", "em_analise", "correcao"];

const CAMPOS = "id, codigo, titulo, tipo, status, valor, motivo_correcao, pendencia_tipo, created_at, media:property_media(storage_path, capa, tipo), geo:property_geometries(geom)";

function mediaUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export default async function MeusImoveis() {
  const supabase = await supabaseServer();

  // RLS garante que só vêm os imóveis do usuário
  const { data: imoveis } = await supabase
    .from("properties")
    .select(CAMPOS)
    .not("status", "in", '("publicado","em_negociacao","vendido","historico")')
    .order("created_at", { ascending: false });

  const { data: publicados } = await supabase
    .from("properties")
    .select(CAMPOS)
    .in("status", ["publicado", "em_negociacao", "vendido"])
    .order("created_at", { ascending: false });

  // cadastro (owner/partner) ainda em análise?
  const { data: owner } = await supabase.from("owners").select("status").maybeSingle();
  const { data: partner } = await supabase.from("partners").select("status").maybeSingle();
  const statusCadastro = owner?.status ?? partner?.status;
  const aguardando = statusCadastro && !["aprovado", "ativo"].includes(statusCadastro);

  const meus = [...(imoveis ?? []), ...(publicados ?? [])];

  // Fluxograma §9: anúncios publicados com alteração aguardando a Matriz
  const { data: revisoes } = meus.length
    ? await supabaseAdmin().from("property_revisions").select("property_id")
        .in("property_id", meus.map((p) => p.id)).eq("status", "pendente")
    : { data: [] };
  const comRevisao = new Set((revisoes ?? []).map((r) => r.property_id));

  // RLS: só as oportunidades encaminhadas a esta conta
  const { count: oportunidades } = await supabase
    .from("opportunities").select("id", { count: "exact", head: true });

  const emAnalise = meus.filter((p) => EM_ANALISE.includes(p.status)).length;
  const noAr = meus.filter((p) => ["publicado", "em_negociacao"].includes(p.status)).length;

  return (
    <div className="space-y-10 md:space-y-12">
      {aguardando && (
        <div className="flex items-start gap-3 rounded-2xl border border-alerta/40 bg-alerta/10 px-5 py-4 text-base text-alerta">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            Seu cadastro está <strong>{STATUS_LABEL[statusCadastro!] ?? statusCadastro}</strong> na análise da Arini.
            Você poderá anunciar assim que for aprovado.
          </p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Estatistica icone={Clock} valor={emAnalise} rotulo="Em análise pela Arini" urgente={emAnalise > 0} />
        <Estatistica icone={CheckCircle2} valor={noAr} rotulo="Publicados no site" />
        <Estatistica icone={Handshake} valor={oportunidades ?? 0} rotulo="Oportunidades encaminhadas" href="/painel/oportunidades" />
      </div>

      <Secao
        eyebrow="Seus anúncios"
        titulo="Meus imóveis"
        subtitulo="Acompanhe seus anúncios e o status de análise."
        acao={<BotaoLink href="/painel/novo" seta={false}><Plus /> Anunciar imóvel</BotaoLink>}
      >
        {meus.length === 0 ? (
          <Vazio
            icone={Building2}
            titulo="Nenhum imóvel ainda"
            texto={<>Clique em <strong>Anunciar imóvel</strong> para começar. A Arini analisa o cadastro antes de publicar.</>}
            acao={<BotaoLink href="/painel/novo">Anunciar imóvel</BotaoLink>}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {meus.map((p) => {
              const fotos = ((p.media ?? []) as { storage_path: string; capa: boolean | null; tipo: string | null }[])
                .filter((m) => m.tipo !== "video");
              const capa = fotos.find((m) => m.capa) ?? fotos[0];
              const geo = p.geo as unknown as { geom: GeoDivisa } | { geom: GeoDivisa }[] | null;
              const geom = (Array.isArray(geo) ? geo[0] : geo)?.geom;
              const complemento = p.status === "correcao" && p.pendencia_tipo === "complemento";
              return (
                <Link key={p.id} href={`/painel/imoveis/${p.id}`}
                  className="cartao cartao-link group flex flex-col overflow-hidden">
                  <div className="relative h-44 overflow-hidden bg-superficie-2">
                    {!capa && geom ? (
                      // sem foto: o próprio terreno visto do satélite, com a divisa
                      <MiniaturaDivisa geom={geom}
                        className={"h-full w-full transition-transform duration-500 group-hover:scale-105" + (p.status === "vendido" ? " grayscale" : "")} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={capa ? mediaUrl(capa.storage_path) : p.tipo === "rural" ? "/img/aerea-campo.jpg" : "/img/casa-urbana.jpg"}
                        alt={p.titulo}
                        className={"h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 " + (capa ? "" : "opacity-60") + (p.status === "vendido" ? " grayscale" : "")} />
                    )}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <Etiqueta tom={STATUS_TOM[p.status] ?? "neutro"} className="bg-fundo/90 backdrop-blur">
                        {complemento ? "Aguardando complemento" : STATUS_LABEL[p.status] ?? p.status}
                      </Etiqueta>
                      {comRevisao.has(p.id) && (
                        <Etiqueta tom="alerta" className="bg-fundo/90 backdrop-blur">alteração em análise</Etiqueta>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="font-mono text-xs text-texto-2">{p.codigo} · <span className="capitalize">{p.tipo}</span></p>
                    <p className="lp-display mt-1.5 text-lg leading-snug text-texto group-hover:text-verde transition-colors">{p.titulo}</p>
                    <p className="mt-2 text-base font-semibold tabular-nums text-texto">{formatBRL(p.valor)}</p>
                    {p.motivo_correcao && (
                      <p className="mt-4 flex gap-2 rounded-xl border border-alerta/30 bg-alerta/10 px-3 py-2.5 text-sm text-alerta">
                        <FileWarning className="mt-0.5 size-4 shrink-0" />
                        <span>
                          <strong>{complemento ? "Complemento solicitado" : "Correção solicitada"}:</strong> {p.motivo_correcao}
                        </span>
                      </p>
                    )}
                    <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-semibold text-verde">
                      Abrir imóvel <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Secao>
    </div>
  );
}
