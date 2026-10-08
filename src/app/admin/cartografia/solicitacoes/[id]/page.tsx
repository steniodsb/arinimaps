import Link from "next/link";
import { ArrowLeft, CalendarClock, FileText, History, MapPin, MapPinOff, Paperclip, User } from "lucide-react";
import { Etiqueta, Vazio } from "@/components/ui/Pagina";
import { TOM_STATUS } from "../tom-status";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { dataHoraBR } from "@/components/admin/Painel";
import MiniMapa from "@/components/map/MiniMapa";
import { PAPEL_LABEL } from "@/lib/perfis";
import {
  STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL, tamanhoLegivel,
  type ArquivoSolicitacao, type StatusSolicitacao, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";
import { assinarArquivos, geojsonDaSolicitacao, resolverReferencia } from "@/lib/cartografia/servidor";
import AcoesSolicitacao from "./AcoesSolicitacao";

export default async function SolicitacaoCartografica({ params }: PageProps<"/admin/cartografia/solicitacoes/[id]">) {
  await exigirSetor("cartografia");
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: s } = await admin.from("cartographic_requests")
    .select(`
      id, protocolo, tipo, status, descricao, referencia, arquivos, resposta, area_m2, user_id, responsavel,
      property_id, geometria_versao_id, created_at, updated_at,
      municipality:municipalities(nome),
      property:properties(id, codigo, titulo, status)
    `)
    .eq("id", id).maybeSingle();
  if (!s) notFound();
  const status = s.status as StatusSolicitacao;
  const municipio = s.municipality as unknown as { nome: string } | null;
  const imovel = s.property as unknown as { id: string; codigo: string; titulo: string; status: string } | null;

  const [{ data: solicitante }, { data: eventos }, { data: equipe }, geo, arquivos, referencia, { data: versao }] = await Promise.all([
    admin.from("profiles").select("user_id, nome, telefone, role").eq("user_id", s.user_id).maybeSingle(),
    admin.from("cartographic_request_events").select("id, user_id, de_status, para_status, mensagem, interno, created_at")
      .eq("request_id", id).order("created_at"),
    // quem atua na Cartografia (a diretoria atua em todos os setores)
    admin.from("profiles").select("user_id, nome").in("role", ["admin_central", "analista_arini"]).eq("ativo", true)
      .or("role.eq.admin_central,setores.cs.{cartografia}").order("nome"),
    geojsonDaSolicitacao(id),
    assinarArquivos((s.arquivos ?? []) as ArquivoSolicitacao[]),
    resolverReferencia(s.referencia),
    s.geometria_versao_id
      ? admin.from("property_geometry_versions").select("versao, situacao, validada_em").eq("id", s.geometria_versao_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const autores = new Map<string, string>();
  const idsAutores = [...new Set((eventos ?? []).map((e) => e.user_id).filter((x): x is string => !!x))];
  if (idsAutores.length) {
    const { data } = await admin.from("profiles").select("user_id, nome").in("user_id", idsAutores);
    for (const p of data ?? []) autores.set(p.user_id, p.nome);
  }
  const geometria = geo.geom ?? geo.ponto ?? referencia?.geometry ?? null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <header className="space-y-4">
        <Link href="/admin/cartografia/solicitacoes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-verde hover:underline">
          <ArrowLeft className="size-4" /> Solicitações cartográficas
        </Link>
        <div>
          <p className="lp-eyebrow text-xs">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="lp-display font-mono text-3xl md:text-[2.5rem] text-texto">{s.protocolo}</h1>
            <Etiqueta tom={TOM_STATUS[status] ?? "neutro"}>{STATUS_SOLICITACAO_LABEL[status]}</Etiqueta>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-texto-2">
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {municipio?.nome ?? "Município não informado"}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums"><CalendarClock className="size-4" /> aberta em {dataHoraBR(s.created_at)} · atualizada em {dataHoraBR(s.updated_at)}</span>
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6 min-w-0">
          <section className="cartao p-6 space-y-3">
            <h2 className="flex items-center gap-2 lp-display text-xl text-texto"><User className="size-5 text-verde" /> Solicitante</h2>
            <p className="text-base text-texto">
              {solicitante?.nome ?? "—"}
              {solicitante?.telefone && <> · {solicitante.telefone}</>}
              {solicitante?.role && <> · <span className="text-texto-2">{PAPEL_LABEL[solicitante.role] ?? solicitante.role}</span></>}
            </p>
            <p className="text-[0.95rem] text-texto-2">
              Imóvel vinculado:{" "}
              {imovel
                ? <Link href={`/admin/imoveis/${imovel.id}`} className="font-semibold text-verde hover:underline"><span className="font-mono">{imovel.codigo}</span> · {imovel.titulo}</Link>
                : "nenhum (vincule pelo código no painel ao lado)"}
            </p>
            {versao && (
              <p className="text-[0.95rem] text-texto-2">
                Geometria aplicada: versão {versao.versao} ({versao.situacao}){versao.validada_em && `, validada em ${dataHoraBR(versao.validada_em)}`}
              </p>
            )}
          </section>

          {geometria ? (
            <section className="space-y-2.5">
              <MiniMapa geometry={geometria} status={geo.geom ? "publicado" : "em_negociacao"} className="h-80 w-full rounded-[1.25rem] overflow-hidden border border-linha" />
              <p className="text-sm text-texto-2">
                {geo.geom ? "Área desenhada pelo solicitante" : geo.ponto ? "Ponto marcado pelo solicitante" : "Área da referência clicada"}
                {geo.area_m2 != null && ` · ${(geo.area_m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha (${geo.area_m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²)`}
                {referencia && ` · ${referencia.rotulo}`}
                . Indicação do usuário — não é oficial.
              </p>
            </section>
          ) : (
            <div className="cartao flex items-center gap-3 p-6 text-base text-texto-2">
              <MapPinOff className="size-5 shrink-0 text-texto-3" />
              Sem ponto nem área: a localização está só na descrição e nos anexos.
            </div>
          )}

          <section className="cartao p-6 space-y-4">
            <h2 className="flex items-center gap-2 lp-display text-xl text-texto"><FileText className="size-5 text-verde" /> Descrição</h2>
            <p className="text-base leading-relaxed whitespace-pre-wrap text-texto">{s.descricao || <span className="text-texto-2">Sem descrição.</span>}</p>
            {arquivos.length > 0 && (
              <div className="border-t border-linha pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-texto-2">Anexos ({arquivos.length})</p>
                <ul className="divide-y divide-linha text-[0.95rem]">
                  {arquivos.map((a) => (
                    <li key={a.path} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="size-4 shrink-0 text-texto-2" />
                        {a.url
                          ? <a href={a.url} target="_blank" className="font-semibold text-verde hover:underline truncate">{a.nome}</a>
                          : <span className="text-texto-2 truncate">{a.nome}</span>}
                      </span>
                      <span className="text-sm text-texto-2 shrink-0 tabular-nums">{a.tipo.toUpperCase()} · {tamanhoLegivel(a.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.resposta && (
              <div className="rounded-xl border border-verde/30 bg-verde/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-verde">Devolutiva atual ao solicitante</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-texto">{s.resposta}</p>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="lp-display text-2xl text-texto">Linha do tempo</h2>
            {eventos?.length ? (
              <ol className="relative space-y-3 border-l-2 border-linha pl-5">
                {eventos.map((e) => (
                  <li key={e.id}
                    className={"relative rounded-2xl border p-4 " +
                      (e.interno ? "border-alerta/40 bg-alerta/10" : e.user_id === s.user_id ? "border-linha bg-superficie" : "border-verde/30 bg-verde/5")}>
                    <span aria-hidden className={"absolute -left-[1.6rem] top-5 size-2.5 rounded-full ring-4 ring-fundo " +
                      (e.interno ? "bg-alerta" : e.user_id === s.user_id ? "bg-texto-2" : "bg-verde")} />
                    <p className="text-sm text-texto-2">
                      <span className="tabular-nums">{dataHoraBR(e.created_at)}</span> · <span className="font-semibold text-texto">{e.user_id ? autores.get(e.user_id) ?? "—" : "sistema"}</span>
                      {e.user_id === s.user_id && " · solicitante"}
                      {e.interno && " · nota interna (o solicitante não vê)"}
                      {e.para_status && <> · <span className="text-texto">{e.de_status ? `${STATUS_SOLICITACAO_LABEL[e.de_status as StatusSolicitacao] ?? e.de_status} → ` : ""}{STATUS_SOLICITACAO_LABEL[e.para_status as StatusSolicitacao] ?? e.para_status}</span></>}
                    </p>
                    {e.mensagem && <p className="mt-1.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-texto">{e.mensagem}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <Vazio icone={History} titulo="Sem movimentações." />
            )}
          </section>
        </div>

        <AcoesSolicitacao
          id={s.id}
          protocolo={s.protocolo}
          status={status}
          responsavel={s.responsavel ?? ""}
          equipe={equipe ?? []}
          imovel={imovel ? { id: imovel.id, codigo: imovel.codigo } : null}
          temGeometria={!!geo.geom}
          resposta={s.resposta ?? ""}
        />
      </div>
    </div>
  );
}
