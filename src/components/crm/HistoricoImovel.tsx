import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EVENTO_IMOVEL_LABEL, ORIGEM_DADO_LABEL } from "@/lib/imovel/eventos";
import { formatArea } from "@/lib/format";
import { CAMPO_REVISAO_LABEL, valorRevisao } from "@/lib/imovel/revisao";
import ValidarGeometria from "./ValidarGeometria";

/**
 * Histórico e rastreabilidade do imóvel (requisitos cartográficos §1.1–1.5):
 * versões da divisa, origem de cada dado, alterações propostas, trilha de
 * auditoria e os acessos/interações. Tudo lido pelo service role — quem pode
 * ver é decidido pela página que monta o componente (dono, parceiro
 * responsável ou Matriz).
 *
 * `modo="admin"` mostra também os últimos eventos com usuário e IP;
 * `modo="painel"` esconde IP e dados de terceiros.
 */
type Props = { propertyId: string; modo: "admin" | "painel"; tipoImovel?: "urbano" | "rural" };

type Versao = {
  id: string; versao: number; fonte: string; origem: string; situacao: string;
  area_m2: number | null; perimeter_m: number | null; motivo: string | null;
  responsavel: string | null; validada_por: string | null; validada_em: string | null; created_at: string;
};
type Origem = { campo: string; origem: string; detalhe: string | null; user_id: string | null; created_at: string };
type Revisao = {
  id: string; versao: number; dados: Record<string, unknown>; dados_anteriores: Record<string, unknown>;
  status: string; motivo: string | null; created_by: string | null; revisada_por: string | null;
  revisada_em: string | null; created_at: string;
};
type Auditoria = {
  id: string; acao: string; entidade: string; user_id: string | null; created_at: string;
  dados_antes: unknown; dados_depois: unknown;
};
type Evento = { id: string; tipo: string; user_id: string | null; ip: string | null; detalhe: Record<string, unknown>; created_at: string };

export const SITUACAO_DIVISA_LABEL: Record<string, string> = {
  informada: "Informada pelo usuário",
  em_analise: "Em análise pela Matriz",
  validada: "Validada pela Matriz",
  substituida: "Substituída",
};
const SITUACAO_COR: Record<string, string> = {
  informada: "bg-alerta/15 text-alerta",
  em_analise: "bg-alerta/15 text-alerta",
  validada: "bg-verde/15 text-verde",
  substituida: "bg-superficie-2 text-texto-2",
};
const CAMPO_LABEL: Record<string, string> = {
  geometria: "Divisa", area: "Área", valor: "Valor", cadastro: "Cadastro", documentos: "Documentos",
  consulta_territorial: "Consulta territorial", pois: "Pontos de interesse",
};
const STATUS_REVISAO: Record<string, { label: string; cor: string }> = {
  pendente: { label: "Aguardando a Matriz", cor: "bg-alerta/15 text-alerta" },
  aprovada: { label: "Aprovada e aplicada", cor: "bg-verde/15 text-verde" },
  rejeitada: { label: "Rejeitada", cor: "bg-critico/15 text-critico" },
  cancelada: { label: "Cancelada pelo anunciante", cor: "bg-superficie-2 text-texto-2" },
};
const CONTADORES: { tipo: string; rotulo: string }[] = [
  { tipo: "ficha", rotulo: "Visualizações da ficha" },
  { tipo: "tour", rotulo: "Tours 3D" },
  { tipo: "relatorio", rotulo: "Relatórios" },
  { tipo: "interesse", rotulo: "Interesses" },
  { tipo: "consulta", rotulo: "Consultas" },
];

const quando = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Resumo curto de um registro da auditoria (sem despejar o JSON inteiro). */
function resumoAuditoria(a: Auditoria): string {
  const d = (a.dados_depois ?? a.dados_antes) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return a.entidade;
  const partes = Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).slice(0, 60)}`);
  return partes.length ? partes.join(" · ") : a.entidade;
}

export default async function HistoricoImovel({ propertyId, modo, tipoImovel = "rural" }: Props) {
  const admin = supabaseAdmin();
  const [{ data: versoes }, { data: origens }, { data: revisoes }, { data: auditoria }, { data: eventos }, ...contagens] =
    await Promise.all([
      admin.from("property_geometry_versions")
        .select("id, versao, fonte, origem, situacao, area_m2, perimeter_m, motivo, responsavel, validada_por, validada_em, created_at")
        .eq("property_id", propertyId).order("versao", { ascending: false }),
      admin.from("property_data_sources")
        .select("campo, origem, detalhe, user_id, created_at")
        .eq("property_id", propertyId).order("created_at", { ascending: false }),
      admin.from("property_revisions")
        .select("id, versao, dados, dados_anteriores, status, motivo, created_by, revisada_por, revisada_em, created_at")
        .eq("property_id", propertyId).order("versao", { ascending: false }),
      admin.from("audit_log")
        .select("id, acao, entidade, user_id, created_at, dados_antes, dados_depois")
        .eq("property_id", propertyId).order("created_at", { ascending: false }).limit(50),
      admin.from("property_events")
        .select("id, tipo, user_id, ip, detalhe, created_at")
        .eq("property_id", propertyId).order("created_at", { ascending: false }).limit(20),
      ...CONTADORES.map((c) =>
        admin.from("property_events").select("id", { count: "exact", head: true })
          .eq("property_id", propertyId).eq("tipo", c.tipo)
      ),
    ]);

  const lista = (versoes ?? []) as Versao[];
  const atual = lista.find((v) => v.situacao !== "substituida") ?? lista[0] ?? null;
  // a origem mais recente de cada campo é a que vale (§1.5)
  const origemPorCampo = new Map<string, Origem>();
  for (const o of (origens ?? []) as Origem[]) if (!origemPorCampo.has(o.campo)) origemPorCampo.set(o.campo, o);
  const revs = (revisoes ?? []) as Revisao[];
  const audit = (auditoria ?? []) as Auditoria[];
  const evs = (eventos ?? []) as Evento[];
  const contadores = CONTADORES.map((c, i) => ({ ...c, n: contagens[i]?.count ?? 0 }));

  // nomes de quem aparece (responsável, validou, propôs, revisou, agiu)
  const ids = new Set<string>();
  for (const v of lista) { if (v.responsavel) ids.add(v.responsavel); if (v.validada_por) ids.add(v.validada_por); }
  for (const r of revs) { if (r.created_by) ids.add(r.created_by); if (r.revisada_por) ids.add(r.revisada_por); }
  for (const a of audit) if (a.user_id) ids.add(a.user_id);
  for (const e of evs) if (e.user_id) ids.add(e.user_id);
  const nomes = new Map<string, string>();
  if (ids.size) {
    const { data: perfis } = await admin.from("profiles").select("user_id, nome").in("user_id", [...ids]);
    for (const p of perfis ?? []) nomes.set(p.user_id, p.nome || "Usuário");
  }
  const nome = (id: string | null) => (id ? nomes.get(id) ?? "Usuário" : modo === "admin" ? "Sistema" : "—");

  return (
    <div className="space-y-5">
      {/* ---------- rastreabilidade ---------- */}
      <section className="cartao p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-texto">Rastreabilidade</h2>
          <p className="text-sm text-texto-2">
            Versão atual da divisa, origem de cada dado e o que já aconteceu com este imóvel.
          </p>
        </div>

        <div className="rounded-xl bg-superficie-2 p-4 flex flex-wrap items-center gap-3">
          {atual ? (
            <>
              <span className="text-sm text-texto">Divisa — versão <strong>{atual.versao}</strong></span>
              <span className={`text-xs rounded-full px-3 py-1 ${SITUACAO_COR[atual.situacao] ?? "bg-superficie-2"}`}>
                {SITUACAO_DIVISA_LABEL[atual.situacao] ?? atual.situacao}
              </span>
              <span className="text-xs text-texto-2">{ORIGEM_DADO_LABEL[atual.origem] ?? atual.origem} · fonte {atual.fonte}</span>
              {atual.validada_em && (
                <span className="text-xs text-texto-2">validada em {quando(atual.validada_em)}{atual.validada_por ? ` por ${nome(atual.validada_por)}` : ""}</span>
              )}
              {modo === "admin" && atual.situacao !== "validada" && (
                <span className="ml-auto"><ValidarGeometria propertyId={propertyId} /></span>
              )}
            </>
          ) : (
            <span className="text-sm text-texto-2">Imóvel sem divisa registrada.</span>
          )}
        </div>

        {origemPorCampo.size > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-2 mb-1.5">Origem por dado</p>
            <ul className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {[...origemPorCampo.values()].map((o) => (
                <li key={o.campo} className="flex justify-between gap-3 border-b border-linha py-1">
                  <span className="text-texto">{CAMPO_LABEL[o.campo] ?? o.campo}</span>
                  <span className="text-texto-2 text-right" title={o.detalhe ?? undefined}>
                    {ORIGEM_DADO_LABEL[o.origem] ?? o.origem}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {contadores.map((c) => (
            <div key={c.tipo} className="rounded-xl border border-linha p-3">
              <p className="text-xl font-semibold text-texto tabular-nums">{c.n}</p>
              <p className="text-[11px] text-texto-2">{c.rotulo}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- versões da divisa ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Versões da divisa</h2>
        {!lista.length ? (
          <p className="text-sm text-texto-2">Nenhuma versão registrada.</p>
        ) : (
          <ul className="divide-y divide-linha text-sm">
            {lista.map((v) => (
              <li key={v.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-texto-2 w-8">v{v.versao}</span>
                <span className={`text-xs rounded-full px-2.5 py-0.5 ${SITUACAO_COR[v.situacao] ?? "bg-superficie-2"}`}>
                  {SITUACAO_DIVISA_LABEL[v.situacao] ?? v.situacao}
                </span>
                <span className="text-texto">{formatArea(v.area_m2, tipoImovel)}</span>
                {v.perimeter_m != null && (
                  <span className="text-texto-2 text-xs">perímetro {(Number(v.perimeter_m) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km</span>
                )}
                <span className="text-texto-2 text-xs">{ORIGEM_DADO_LABEL[v.origem] ?? v.origem} · {v.fonte}</span>
                <span className="text-texto-2 text-xs ml-auto">{quando(v.created_at)}{v.responsavel ? ` · ${nome(v.responsavel)}` : ""}</span>
                {v.motivo && <p className="w-full text-xs text-texto-2">{v.motivo}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- alterações propostas ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Alterações propostas</h2>
        {!revs.length ? (
          <p className="text-sm text-texto-2">Nenhuma alteração proposta depois da publicação.</p>
        ) : (
          <div className="space-y-4">
            {revs.map((r) => {
              const campos = Object.keys(r.dados ?? {});
              const st = STATUS_REVISAO[r.status] ?? { label: r.status, cor: "bg-superficie-2" };
              return (
                <div key={r.id} className="rounded-xl border border-linha p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-texto">Versão {r.versao}</span>
                    <span className={`text-xs rounded-full px-2.5 py-0.5 ${st.cor}`}>{st.label}</span>
                    <span className="text-xs text-texto-2 ml-auto">
                      proposta em {quando(r.created_at)}{r.created_by ? ` por ${nome(r.created_by)}` : ""}
                      {r.revisada_em ? ` · decidida em ${quando(r.revisada_em)}${r.revisada_por ? ` por ${nome(r.revisada_por)}` : ""}` : ""}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-texto-2 border-b border-linha">
                        <th className="py-1 pr-2 font-medium">Campo</th>
                        <th className="py-1 pr-2 font-medium">Antes</th>
                        <th className="py-1 font-medium">Proposto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linha">
                      {campos.map((c) => (
                        <tr key={c}>
                          <td className="py-1 pr-2 text-texto">{CAMPO_REVISAO_LABEL[c as keyof typeof CAMPO_REVISAO_LABEL] ?? c}</td>
                          <td className="py-1 pr-2 text-texto-2 whitespace-pre-line">{valorRevisao(c, r.dados_anteriores?.[c])}</td>
                          <td className="py-1 text-texto whitespace-pre-line">{valorRevisao(c, r.dados[c])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {r.motivo && <p className="text-xs text-critico">Motivo da Matriz: {r.motivo}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- trilha de auditoria ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Trilha de auditoria</h2>
        {!audit.length ? (
          <p className="text-sm text-texto-2">Nenhuma ação registrada.</p>
        ) : (
          <ul className="divide-y divide-linha text-sm max-h-96 overflow-y-auto">
            {audit.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-medium text-texto">{a.acao.replace(/_/g, " ")}</span>
                <span className="text-xs text-texto-2">{nome(a.user_id)}</span>
                <span className="text-xs text-texto-2 ml-auto tabular-nums">{quando(a.created_at)}</span>
                <p className="w-full text-xs text-texto-2 truncate" title={resumoAuditoria(a)}>{resumoAuditoria(a)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- últimos acessos (só Matriz) ---------- */}
      {modo === "admin" && (
        <section className="cartao p-5 space-y-3">
          <h2 className="font-semibold text-texto">Últimos acessos e interações</h2>
          {!evs.length ? (
            <p className="text-sm text-texto-2">Nenhum acesso registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-linha text-sm">
              {evs.map((e) => (
                <li key={e.id} className="py-1.5 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-texto">{EVENTO_IMOVEL_LABEL[e.tipo] ?? e.tipo}</span>
                  <span className="text-xs text-texto-2">{e.user_id ? nome(e.user_id) : "visitante"}</span>
                  {e.ip && <span className="text-xs text-texto-2 font-mono">{e.ip}</span>}
                  {e.detalhe && Object.keys(e.detalhe).length > 0 && (
                    <span className="text-xs text-texto-2 truncate max-w-xs">
                      {Object.entries(e.detalhe).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                    </span>
                  )}
                  <span className="text-xs text-texto-2 ml-auto tabular-nums">{quando(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
