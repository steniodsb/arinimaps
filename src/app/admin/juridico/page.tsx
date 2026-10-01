import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { lerConfiguracoes } from "@/lib/settings";
import { documentos } from "@/lib/juridico";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, contar, dataBR, dataHoraBR } from "@/components/admin/Painel";

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
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="juridico">
        <Link href="/termos" target="_blank" className="btn-contorno px-4 py-2 text-sm">Ver os termos publicados</Link>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Pedidos LGPD em aberto", valor: lgpdAbertos, href: "/admin/juridico/lgpd", destaque: lgpdAbertos > 0 },
        { rotulo: "Autorizações vencidas", valor: vencidas.length, destaque: vencidas.length > 0, nota: `${vencendo.length} vencem em 30 dias` },
        { rotulo: "Sem aceite eletrônico", valor: semEletronico.length, nota: "cadastro pela equipe: conferir contrato assinado" },
        { rotulo: "Campos a preencher nos termos", valor: faltando, href: "/admin/configuracoes", destaque: faltando > 0 },
      ]} />

      <Secao titulo="Termos vigentes e aceites">
        <div className="cartao divide-y divide-linha">
          {docs.map((d) => (
            <div key={d.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
              <Link href={`/termos/${d.id}`} target="_blank" className="flex-1 min-w-56 text-texto hover:text-verde">
                {d.titulo}
                <span className="block text-xs text-texto-2">{d.paraQuem}</span>
              </Link>
              <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">versão {d.versao} · desde {d.vigencia}</span>
              <span className="text-xs text-texto-2 tabular-nums w-28 text-right">
                {aceites.get(`${d.id}@${d.versao}`) ?? 0} conta(s)
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-texto-2">
          A contagem é de contas que aceitaram a versão vigente no cadastro. {semAceite} conta(s) externas são anteriores
          aos termos e não têm aceite registrado. Autorização, exclusividade e remuneração são aceitas por imóvel (abaixo).
          Para mudar um texto, o desenvolvedor sobe a versão: quem já aceitou continua ligado à versão que leu.
        </p>
      </Secao>

      <Secao titulo="Autorizações de venda dos imóveis ativos">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Condição</th>
                <th className="px-4 py-3">Aceite</th>
                <th className="px-4 py-3">Validade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {ativas.slice(0, 60).map((a) => {
                const vencida = !!a.validade && a.validade < hoje;
                const perto = !!a.validade && !vencida && a.validade <= em30;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/imoveis/${a.property!.id}`} className="text-texto hover:text-verde">
                        {a.property!.titulo}
                      </Link>
                      <span className="block font-mono text-[11px] text-texto-2">{a.property!.codigo}</span>
                    </td>
                    <td className="px-4 py-2.5">{CONDICAO[a.tipo] ?? a.tipo}</td>
                    <td className="px-4 py-2.5 text-xs text-texto-2">
                      {a.aceite_at
                        ? <>{dataHoraBR(a.aceite_at)}<span className="block">{a.versao}{a.aceite_ip && ` · IP ${a.aceite_ip}`}</span></>
                        : <span className="text-alerta">sem aceite eletrônico</span>}
                    </td>
                    <td className={"px-4 py-2.5 text-xs tabular-nums " + (vencida ? "text-critico" : perto ? "text-alerta" : "text-texto-2")}>
                      {a.validade ? dataBR(a.validade + "T12:00:00") : "—"}{vencida && " · vencida"}{perto && " · vence logo"}
                    </td>
                  </tr>
                );
              })}
              {!ativas.length && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-texto-2">Nenhum imóvel ativo com autorização registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Contratos">
        <div className="cartao divide-y divide-linha">
          {(contratos ?? []).map((c) => {
            const o = c.opportunity as unknown as { id: string; codigo: string; property: { titulo: string } | null } | null;
            return (
              <Link key={c.id} href={o ? `/admin/oportunidades/${o.id}` : "/admin/funil"}
                className="px-4 py-3 flex items-center justify-between gap-3 text-sm hover:bg-superficie-2 transition">
                <span className="text-texto">{o?.property?.titulo}<span className="text-xs text-texto-2"> · {o?.codigo}</span></span>
                <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">
                  {c.status === "em_elaboracao" ? "em elaboração" : c.status}{c.assinado_at && ` em ${dataBR(c.assinado_at)}`}
                </span>
              </Link>
            );
          })}
          {!contratos?.length && <p className="px-4 py-6 text-center text-sm text-texto-2">Nenhum contrato registrado ainda.</p>}
        </div>
      </Secao>

      <TarefasDoSetor setor="juridico" souEu={user.id} />
    </div>
  );
}
