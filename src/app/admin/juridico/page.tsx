import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { lerConfiguracoes } from "@/lib/settings";
import { documentos } from "@/lib/juridico";
import { ExternalLink, FilePen, FileSignature, Shield, TriangleAlert } from "lucide-react";
import { Etiqueta } from "@/components/ui/Pagina";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, contar, dataBR, dataHoraBR } from "@/components/admin/Painel";
import { CODIGO, LISTA, LISTA_VAZIA, TABELA, TABELA_CAIXA, TBODY, TH, THEAD, TR } from "@/components/admin/estilos";

const CONDICAO: Record<string, string> = {
  autorizacao: "Autorização de venda", exclusividade: "Exclusividade Arini", parceiro: "Imóvel de parceiro",
};

/**
 * Jurídico: o que foi aceito, por quem e em que versão; as autorizações de
 * venda e seus prazos; os contratos em elaboração; e os pedidos de titulares.
 */
export default async function PainelJuridico() {
  const user = await exigirSetor("juridico");
  const admin = supabaseAdmin();
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [cfg, { data: perfis }, { data: autorizacoes }, { data: contratos }, lgpdAbertos, semAceite] = await Promise.all([
    lerConfiguracoes(),
    admin.from("profiles").select("aceite_termos_versao").not("aceite_termos_versao", "is", null),
    admin.from("property_authorizations")
      .select("id, tipo, validade, aceite_at, versao, aceite_ip, property:properties(id, codigo, titulo, status)")
      .order("validade", { ascending: true, nullsFirst: false }).limit(300),
    admin.from("contracts")
      .select("id, status, created_at, assinado_at, opportunity:opportunities(id, codigo, property:properties(titulo))")
      .order("created_at", { ascending: false }).limit(20),
    contar("lgpd_requests", (q) => q.in("status", ["recebido", "em_analise"])),
    contar("profiles", (q) => q.is("aceite_termos_versao", null).not("role", "in", "(admin_central,analista_arini)")),
  ]);

  const docs = documentos(cfg);
  const faltando = docs.flatMap((d) => d.secoes.flatMap((s) => s.itens)).filter((i) => i.includes("〔")).length;

  // quantas contas aceitaram cada versão de cada documento
  const aceites = new Map<string, number>();
  for (const p of perfis ?? []) {
    for (const v of String(p.aceite_termos_versao).split(",")) aceites.set(v, (aceites.get(v) ?? 0) + 1);
  }

  type Aut = {
    id: string; tipo: string; validade: string | null; aceite_at: string | null; versao: string | null; aceite_ip: string | null;
    property: { id: string; codigo: string; titulo: string; status: string } | null;
  };
  const ativas = ((autorizacoes ?? []) as unknown as Aut[])
    .filter((a) => a.property && ["pendente", "em_analise", "correcao", "aprovado", "publicado", "em_negociacao"].includes(a.property.status));
  const vencidas = ativas.filter((a) => a.validade && a.validade < hoje);
  const vencendo = ativas.filter((a) => a.validade && a.validade >= hoje && a.validade <= em30);
  const semEletronico = ativas.filter((a) => !a.aceite_at);

  return (
    <div className="space-y-10 md:space-y-12">
      <CabecalhoSetor setor="juridico">
        <Link href="/termos" target="_blank" className="btn-contorno inline-flex items-center gap-2 px-4 py-2.5 text-sm"><ExternalLink className="size-4" /> Ver os termos publicados</Link>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Pedidos LGPD em aberto", icone: Shield, valor: lgpdAbertos, href: "/admin/juridico/lgpd", destaque: lgpdAbertos > 0 },
        { rotulo: "Autorizações vencidas", icone: TriangleAlert, valor: vencidas.length, destaque: vencidas.length > 0, nota: `${vencendo.length} vencem em 30 dias` },
        { rotulo: "Sem aceite eletrônico", icone: FileSignature, valor: semEletronico.length, nota: "cadastro pela equipe: conferir contrato assinado" },
        { rotulo: "Campos a preencher nos termos", icone: FilePen, valor: faltando, href: "/admin/configuracoes", destaque: faltando > 0 },
      ]} />

      <Secao titulo="Termos vigentes e aceites">
        <div className={LISTA}>
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-4 flex-wrap px-5 py-3.5 text-[0.95rem]">
              <Link href={`/termos/${d.id}`} target="_blank" className="flex-1 min-w-56 font-medium text-texto hover:text-verde">
                {d.titulo}
                <span className="mt-0.5 block text-sm font-normal text-texto-2">{d.paraQuem}</span>
              </Link>
              <Etiqueta>versão {d.versao} · desde {d.vigencia}</Etiqueta>
              <span className="text-sm font-semibold text-texto tabular-nums w-28 text-right">
                {aceites.get(`${d.id}@${d.versao}`) ?? 0} conta(s)
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-texto-2 max-w-4xl">
          A contagem é de contas que aceitaram a versão vigente no cadastro. {semAceite} conta(s) externas são anteriores
          aos termos e não têm aceite registrado. Autorização, exclusividade e remuneração são aceitas por imóvel (abaixo).
          Para mudar um texto, o desenvolvedor sobe a versão: quem já aceitou continua ligado à versão que leu.
        </p>
      </Secao>

      <Secao titulo="Autorizações de venda dos imóveis ativos">
        <div className={TABELA_CAIXA}>
          <table className={TABELA}>
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Imóvel</th>
                <th className={TH}>Condição</th>
                <th className={TH}>Aceite</th>
                <th className={TH}>Validade</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {ativas.slice(0, 60).map((a) => {
                const vencida = !!a.validade && a.validade < hoje;
                const perto = !!a.validade && !vencida && a.validade <= em30;
                return (
                  <tr key={a.id} className={TR}>
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/imoveis/${a.property!.id}`} className="font-medium text-texto hover:text-verde">
                        {a.property!.titulo}
                      </Link>
                      <span className={"block mt-0.5 " + CODIGO}>{a.property!.codigo}</span>
                    </td>
                    <td className="px-4 py-3.5">{CONDICAO[a.tipo] ?? a.tipo}</td>
                    <td className="px-4 py-3.5 text-sm text-texto-2 tabular-nums">
                      {a.aceite_at
                        ? <>{dataHoraBR(a.aceite_at)}<span className="block">{a.versao}{a.aceite_ip && ` · IP ${a.aceite_ip}`}</span></>
                        : <Etiqueta tom="alerta">sem aceite eletrônico</Etiqueta>}
                    </td>
                    <td className={"px-4 py-3.5 text-sm tabular-nums whitespace-nowrap " + (vencida ? "font-semibold text-critico" : perto ? "font-semibold text-alerta" : "text-texto-2")}>
                      {a.validade ? dataBR(a.validade + "T12:00:00") : "—"}
                      {vencida && <Etiqueta tom="critico" className="ml-2">vencida</Etiqueta>}
                      {perto && <Etiqueta tom="alerta" className="ml-2">vence logo</Etiqueta>}
                    </td>
                  </tr>
                );
              })}
              {!ativas.length && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-texto-2">Nenhum imóvel ativo com autorização registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Contratos">
        <div className={LISTA}>
          {(contratos ?? []).map((c) => {
            const o = c.opportunity as unknown as { id: string; codigo: string; property: { titulo: string } | null } | null;
            return (
              <Link key={c.id} href={o ? `/admin/oportunidades/${o.id}` : "/admin/funil"}
                className="flex items-center justify-between gap-4 px-5 py-3.5 text-[0.95rem] transition-colors hover:bg-superficie-2/70">
                <span className="font-medium text-texto">{o?.property?.titulo}<span className="font-normal text-sm text-texto-2"> · {o?.codigo}</span></span>
                <Etiqueta tom={c.assinado_at ? "verde" : "neutro"}>
                  {c.status === "em_elaboracao" ? "em elaboração" : c.status}{c.assinado_at && ` em ${dataBR(c.assinado_at)}`}
                </Etiqueta>
              </Link>
            );
          })}
          {!contratos?.length && <p className={LISTA_VAZIA}>Nenhum contrato registrado ainda.</p>}
        </div>
      </Secao>

      <TarefasDoSetor setor="juridico" souEu={user.id} />
    </div>
  );
}
