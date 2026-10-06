import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { dataHoraBR } from "@/components/admin/Painel";
import MiniMapa from "@/components/map/MiniMapa";
import { PAPEL_LABEL } from "@/lib/perfis";
import {
  STATUS_SOLICITACAO_COR, STATUS_SOLICITACAO_LABEL, TIPO_SOLICITACAO_LABEL, tamanhoLegivel,
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
    <div className="space-y-5 max-w-5xl">
      <div>
        <Link href="/admin/cartografia/solicitacoes" className="text-xs text-verde hover:underline">← Solicitações cartográficas</Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-mono text-2xl font-semibold text-texto">{s.protocolo}</h1>
          <span className={`text-xs rounded-full px-3 py-1 ${STATUS_SOLICITACAO_COR[status]}`}>{STATUS_SOLICITACAO_LABEL[status]}</span>
        </div>
        <p className="text-sm text-texto mt-1">{TIPO_SOLICITACAO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}</p>
        <p className="text-sm text-texto-2">
          {municipio?.nome ?? "Município não informado"} · aberta em {dataHoraBR(s.created_at)} · atualizada em {dataHoraBR(s.updated_at)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <section className="cartao p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-texto">Solicitante</h2>
            <p className="text-texto">
              {solicitante?.nome ?? "—"}
              {solicitante?.telefone && <> · {solicitante.telefone}</>}
              {solicitante?.role && <> · <span className="text-texto-2">{PAPEL_LABEL[solicitante.role] ?? solicitante.role}</span></>}
            </p>
            <p className="text-texto-2">
              Imóvel vinculado:{" "}
              {imovel
                ? <Link href={`/admin/imoveis/${imovel.id}`} className="text-verde hover:underline"><span className="font-mono">{imovel.codigo}</span> · {imovel.titulo}</Link>
                : "nenhum (vincule pelo código no painel ao lado)"}
            </p>
            {versao && (
              <p className="text-texto-2">
                Geometria aplicada: versão {versao.versao} ({versao.situacao}){versao.validada_em && `, validada em ${dataHoraBR(versao.validada_em)}`}
              </p>
            )}
          </section>

          {geometria ? (
            <section className="space-y-2">
              <MiniMapa geometry={geometria} status={geo.geom ? "publicado" : "em_negociacao"} className="h-80 w-full rounded-xl overflow-hidden border border-linha" />
              <p className="text-xs text-texto-2">
                {geo.geom ? "Área desenhada pelo solicitante" : geo.ponto ? "Ponto marcado pelo solicitante" : "Área da referência clicada"}
                {geo.area_m2 != null && ` · ${(geo.area_m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha (${geo.area_m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²)`}
                {referencia && ` · ${referencia.rotulo}`}
                . Indicação do usuário — não é oficial.
              </p>
            </section>
          ) : (
            <p className="cartao p-5 text-sm text-texto-2">Sem ponto nem área: a localização está só na descrição e nos anexos.</p>
          )}

          <section className="cartao p-5 space-y-3">
            <h2 className="font-semibold text-texto">Descrição</h2>
            <p className="text-sm whitespace-pre-wrap text-texto">{s.descricao || <span className="text-texto-2">Sem descrição.</span>}</p>
            {arquivos.length > 0 && (
              <div>
                <p className="text-xs text-texto-2 mb-1">Anexos ({arquivos.length})</p>
                <ul className="text-sm space-y-1">
                  {arquivos.map((a) => (
                    <li key={a.path} className="flex items-center justify-between gap-2">
                      {a.url
                        ? <a href={a.url} target="_blank" className="text-verde hover:underline truncate">{a.nome}</a>
                        : <span className="text-texto-2 truncate">{a.nome}</span>}
                      <span className="text-xs text-texto-2 shrink-0">{a.tipo.toUpperCase()} · {tamanhoLegivel(a.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.resposta && (
              <div className="rounded-lg border border-verde/30 bg-verde/5 px-3 py-2 text-sm">
                <p className="text-xs text-texto-2">Devolutiva atual ao solicitante</p>
                <p className="whitespace-pre-wrap text-texto">{s.resposta}</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-texto">Linha do tempo</h2>
            <div className="space-y-2">
              {(eventos ?? []).map((e) => (
                <div key={e.id}
                  className={"rounded-xl border p-3 text-sm " +
                    (e.interno ? "border-alerta/40 bg-alerta/10" : e.user_id === s.user_id ? "border-linha bg-superficie" : "border-verde/30 bg-verde/5")}>
                  <p className="text-xs text-texto-2">
                    {dataHoraBR(e.created_at)} · {e.user_id ? autores.get(e.user_id) ?? "—" : "sistema"}
                    {e.user_id === s.user_id && " · solicitante"}
                    {e.interno && " · nota interna (o solicitante não vê)"}
                    {e.para_status && <> · <span className="text-texto">{e.de_status ? `${STATUS_SOLICITACAO_LABEL[e.de_status as StatusSolicitacao] ?? e.de_status} → ` : ""}{STATUS_SOLICITACAO_LABEL[e.para_status as StatusSolicitacao] ?? e.para_status}</span></>}
                  </p>
                  {e.mensagem && <p className="whitespace-pre-wrap text-texto mt-0.5">{e.mensagem}</p>}
                </div>
              ))}
              {!eventos?.length && <p className="cartao px-4 py-6 text-center text-sm text-texto-2">Sem movimentações.</p>}
            </div>
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
