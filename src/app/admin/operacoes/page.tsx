import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { STATUS_LABEL } from "@/lib/format";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, contar, dataBR } from "@/components/admin/Painel";

const dias = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** Operações: as filas de análise — anúncios, documentos e cadastros. */
export default async function PainelOperacoes() {
  const user = await exigirSetor("operacoes");
  const admin = supabaseAdmin();
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [emAnalise, parceiros, proprietarios, publicadosMes, { data: fila }, { data: docs }, { data: revisoes }] = await Promise.all([
    contar("properties", (q) => q.in("status", ["pendente", "em_analise", "correcao"])),
    contar("partners", (q) => q.in("status", ["solicitado", "em_analise"])),
    contar("owners", (q) => q.in("status", ["solicitado", "em_analise"])),
    contar("properties", (q) => q.gte("published_at", inicioMes)),
    admin.from("properties")
      .select("id, codigo, titulo, tipo, status, created_at, car_codigo, municipality:municipalities(nome)")
      .in("status", ["pendente", "em_analise", "correcao", "aprovado"])
      .order("created_at").limit(30),
    admin.from("property_documents")
      .select("id, tipo, nome_arquivo, created_at, property:properties(id, codigo, titulo, status)")
      .eq("verificado", false).is("substituido_por", null).order("created_at").limit(40),
    // Fluxograma §9: alterações propostas em anúncios publicados
    admin.from("property_revisions")
      .select("id, versao, dados, created_at, property:properties(id, codigo, titulo)")
      .eq("status", "pendente").order("created_at").limit(30),
  ]);
  type Rev = { id: string; versao: number; dados: Record<string, unknown>; created_at: string; property: { id: string; codigo: string; titulo: string } | null };
  const alteracoes = ((revisoes ?? []) as unknown as Rev[]).filter((r) => r.property);

  type Doc = { id: string; tipo: string; nome_arquivo: string | null; created_at: string; property: { id: string; codigo: string; titulo: string; status: string } | null };
  const pendentes = ((docs ?? []) as unknown as Doc[])
    .filter((d) => d.property && !["reprovado", "inativo", "historico"].includes(d.property.status));

  return (
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="operacoes" />

      <Indicadores itens={[
        { rotulo: "Anúncios na fila de análise", valor: emAnalise, href: "/admin/imoveis?filtro=analise", destaque: emAnalise > 0 },
        { rotulo: "Documentos sem conferência", valor: pendentes.length, destaque: pendentes.length > 0 },
        { rotulo: "Alterações propostas", valor: alteracoes.length, href: "/admin/imoveis?revisao=1", destaque: alteracoes.length > 0,
          nota: "anúncios publicados com nova versão" },
        { rotulo: "Cadastros para aprovar", valor: parceiros + proprietarios, href: "/admin/cadastros", destaque: parceiros + proprietarios > 0,
          nota: `${parceiros} parceiro(s) · ${proprietarios} proprietário(s)` },
        { rotulo: "Publicados neste mês", valor: publicadosMes },
      ]} />

      <Secao titulo="Anúncios aguardando decisão" acao={<Link href="/admin/imoveis" className="text-xs text-verde hover:underline">Todos os imóveis</Link>}>
        <div className="cartao divide-y divide-linha">
          {(fila ?? []).map((p) => {
            const espera = dias(p.created_at);
            return (
              <Link key={p.id} href={`/admin/imoveis/${p.id}`}
                className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
                <span className="font-mono text-xs text-texto-2">{p.codigo}</span>
                <span className="flex-1 min-w-48 text-texto">
                  {p.titulo}
                  <span className="text-texto-2 text-xs">
                    {" · "}{(p.municipality as unknown as { nome: string } | null)?.nome ?? "sem município"} · {p.tipo}
                    {p.car_codigo && " · divisa do CAR"}
                  </span>
                </span>
                <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">{STATUS_LABEL[p.status] ?? p.status}</span>
                <span className={"text-xs tabular-nums " + (espera >= 3 ? "text-alerta" : "text-texto-2")}>
                  {espera === 0 ? "hoje" : `há ${espera} dia${espera === 1 ? "" : "s"}`}
                </span>
              </Link>
            );
          })}
          {!fila?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Fila vazia: nenhum anúncio esperando análise.</p>}
        </div>
      </Secao>

      <Secao titulo="Documentos aguardando conferência">
        <p className="text-sm text-texto-2 -mt-1">
          Sem a matrícula conferida o sistema não deixa aprovar nem publicar o imóvel.
        </p>
        <div className="cartao divide-y divide-linha">
          {pendentes.map((d) => (
            <Link key={d.id} href={`/admin/imoveis/${d.property!.id}`}
              className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
              <span className="font-mono text-xs text-texto-2">{d.property!.codigo}</span>
              <span className="flex-1 min-w-48">
                <span className="text-texto capitalize">{d.tipo.replace(/_/g, " / ")}</span>
                <span className="text-xs text-texto-2"> · {d.nome_arquivo ?? "arquivo"} · {d.property!.titulo}</span>
              </span>
              <span className="text-xs text-texto-2">{dataBR(d.created_at)}</span>
            </Link>
          ))}
          {!pendentes.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhum documento esperando conferência.</p>}
        </div>
      </Secao>

      <Secao titulo="Alterações propostas em anúncios publicados" acao={<Link href="/admin/imoveis?revisao=1" className="text-xs text-verde hover:underline">Ver fila</Link>}>
        <p className="text-sm text-texto-2 -mt-1">
          O anúncio atual continua no ar até a decisão; aprovar aplica a nova versão.
        </p>
        <div className="cartao divide-y divide-linha">
          {alteracoes.map((r) => {
            const espera = dias(r.created_at);
            return (
              <Link key={r.id} href={`/admin/imoveis/${r.property!.id}`}
                className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
                <span className="font-mono text-xs text-texto-2">{r.property!.codigo}</span>
                <span className="flex-1 min-w-48 text-texto">
                  {r.property!.titulo}
                  <span className="text-texto-2 text-xs"> · versão {r.versao} · {Object.keys(r.dados ?? {}).join(", ")}</span>
                </span>
                <span className={"text-xs tabular-nums " + (espera >= 3 ? "text-alerta" : "text-texto-2")}>
                  {espera === 0 ? "hoje" : `há ${espera} dia${espera === 1 ? "" : "s"}`}
                </span>
              </Link>
            );
          })}
          {!alteracoes.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhuma alteração esperando decisão.</p>}
        </div>
      </Secao>

      <TarefasDoSetor setor="operacoes" souEu={user.id} />
    </div>
  );
}
