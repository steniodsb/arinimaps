import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { SeloClassificacao, SeloSituacao } from "@/components/rural/Selos";
import VerificarFontes from "./VerificarFontes";

type Ficha = Partial<Record<
  "endereco_oficial" | "documentacao" | "acesso" | "autenticacao" | "custo" | "limites" | "licenca" |
  "atualizacao" | "campos" | "crs" | "consulta_por_geometria" | "cache" | "situacao_sondagem" | "sondado_em", string>>;

type FontePainel = {
  id: string; nome: string; orgao: string; tipo: string; mecanismo: string | null;
  endpoint: string | null; camada: string | null; ativa: boolean; observacao: string | null;
  classificacao: string; situacao: string; situacao_desde: string | null;
  ultima_verificacao: string | null; ultima_consulta: string | null; sonda_url: string | null;
  ficha: Ficha; verificacoes_7d: number; disponibilidade_7d: number | null;
  latencia_media_7d: number | null; ultimo_erro: string | null; ultimo_ok: boolean | null;
};

/** Ordem e rótulos da matriz técnica (PENDENCIAS 3.14) — a mesma de docs/FONTES.md. */
const CAMPOS_FICHA: [keyof Ficha, string][] = [
  ["endereco_oficial", "Endereço oficial"], ["documentacao", "Documentação / serviço"], ["acesso", "Tipo de acesso"],
  ["autenticacao", "Autenticação"], ["custo", "Custo"], ["limites", "Limites"], ["licenca", "Licença e termos"],
  ["atualizacao", "Atualização"], ["campos", "Campos usados"], ["crs", "Sistema de referência"],
  ["consulta_por_geometria", "Consulta por geometria"], ["cache", "Cache"],
  ["situacao_sondagem", "Situação na sondagem"], ["sondado_em", "Sondado em"],
];

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

/**
 * Fontes oficiais (PENDENCIAS 3.14 e 3.16): catálogo com a matriz técnica,
 * situação medida, última verificação e latência média dos últimos 7 dias.
 * A verificação roda sozinha a cada 6 h pelo worker; o botão roda na hora.
 */
export default async function AdminFontes() {
  await exigirSetor("cartografia");
  const { data } = await supabaseAdmin().rpc("fn_fontes_painel");
  const fontes = (data ?? []) as FontePainel[];
  const ativas = fontes.filter((f) => f.ativa);
  const instaveis = ativas.filter((f) => f.situacao === "instavel");
  const ultima = ativas.map((f) => f.ultima_verificacao).filter((v): v is string => !!v).sort().pop() ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-texto">Fontes oficiais</h1>
        <p className="text-sm text-texto-2">
          De onde vem cada informação do relatório territorial. A verificação automática pergunta a cada fonte
          ativa, a cada 6 horas, por um quadrado de 2 km em Iturama; três falhas seguidas marcam a fonte como
          instável, e o relatório passa a avisar em vez de dizer “nada encontrado”.
        </p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Ativas", String(ativas.length)],
          ["Instáveis", String(instaveis.length)],
          ["Dependem de importação", String(fontes.length - ativas.length)],
          ["Última verificação", quando(ultima)],
        ].map(([r, v]) => (
          <div key={r} className="cartao p-3">
            <p className="text-[11px] uppercase tracking-wide text-texto-2">{r}</p>
            <p className="font-semibold text-texto">{v}</p>
          </div>
        ))}
      </section>

      <section className="cartao p-5 space-y-3">
        <VerificarFontes />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-texto-2 border-b border-linha">
                <th className="py-2 pr-3">Fonte</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Última verificação</th>
                <th className="py-2 pr-3 text-right">Latência 7 d</th>
                <th className="py-2 text-right">No ar 7 d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {ativas.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="py-2 pr-3">
                    <p className="text-texto">{f.nome}</p>
                    <p className="text-xs text-texto-2">{f.orgao} · {f.mecanismo ?? f.tipo}</p>
                    {f.ultimo_ok === false && f.ultimo_erro && (
                      <p className="text-xs text-alerta">Última falha: {f.ultimo_erro}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3"><SeloClassificacao valor={f.classificacao} /></td>
                  <td className="py-2 pr-3">
                    <SeloSituacao valor={f.situacao} />
                    {f.situacao_desde && <p className="text-[11px] text-texto-2">desde {quando(f.situacao_desde)}</p>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-texto-2">{quando(f.ultima_verificacao)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {f.latencia_media_7d != null ? `${f.latencia_media_7d.toLocaleString("pt-BR")} ms` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {f.disponibilidade_7d != null ? `${f.disponibilidade_7d.toLocaleString("pt-BR")}%` : "—"}
                    <p className="text-[11px] text-texto-2">{f.verificacoes_7d} verif.</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-texto">Matriz técnica</h2>
          <p className="text-sm text-texto-2">
            Para cada fonte: órgão, endereço, acesso, autenticação, custo, limites, licença, atualização e campos —
            a mesma tabela de <code>docs/FONTES.md</code>. As inativas não têm consulta pública por área e
            aparecem no relatório como “dependem de importação”.
          </p>
        </div>
        {fontes.map((f) => (
          <details key={f.id} className="cartao p-4">
            <summary className="cursor-pointer flex flex-wrap items-center gap-2">
              <span className="font-medium text-texto">{f.nome}</span>
              <span className="text-xs text-texto-2">{f.orgao}</span>
              <SeloClassificacao valor={f.classificacao} />
              {f.ativa ? <SeloSituacao valor={f.situacao} />
                : <span className="text-[10px] rounded-full px-2 py-0.5 bg-superficie-2 text-texto-2">depende de importação</span>}
            </summary>
            <dl className="mt-3 grid sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-1.5 text-sm">
              {f.observacao && (<><dt className="text-texto-2">Observação</dt><dd className="text-texto">{f.observacao}</dd></>)}
              {f.endpoint && (<><dt className="text-texto-2">Serviço</dt><dd className="text-texto break-all font-mono text-xs">{f.endpoint}</dd></>)}
              {f.camada && (<><dt className="text-texto-2">Camadas</dt><dd className="text-texto font-mono text-xs">{f.camada}</dd></>)}
              {CAMPOS_FICHA.filter(([k]) => f.ficha?.[k]).map(([k, rotulo]) => (
                <div key={k} className="contents">
                  <dt className="text-texto-2">{rotulo}</dt>
                  <dd className="text-texto break-words">{f.ficha[k]}</dd>
                </div>
              ))}
              {f.sonda_url && (<><dt className="text-texto-2">Sonda de saúde</dt><dd className="text-texto-2 break-all font-mono text-[11px]">{f.sonda_url}</dd></>)}
              <dt className="text-texto-2">Última consulta real</dt><dd className="text-texto">{quando(f.ultima_consulta)}</dd>
            </dl>
          </details>
        ))}
      </section>
    </div>
  );
}
