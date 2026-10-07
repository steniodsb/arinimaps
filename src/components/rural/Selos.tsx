/**
 * Selos de proveniência e saúde das fontes (PENDENCIAS 3.15 e 3.16).
 *
 * Sem estado nem efeito: servem tanto em tela de servidor (consulta de área,
 * /admin/fontes) quanto em componente de cliente (relatório do imóvel).
 */

export type Classificacao = "oficial" | "terceiro" | "derivado" | "usuario";
export type Situacao = "ok" | "instavel" | "sem_verificacao";

const CLASSIFICACAO: Record<Classificacao, { rotulo: string; dica: string; cor: string }> = {
  oficial: { rotulo: "oficial", dica: "Dado publicado pelo órgão responsável (ou republicado por outro órgão público).", cor: "bg-verde/10 text-verde" },
  terceiro: { rotulo: "terceiro", dica: "Base não governamental (ex.: OpenStreetMap, MapBiomas).", cor: "bg-ouro/15 text-ouro-escuro" },
  derivado: { rotulo: "derivado", dica: "Cálculo do Arini Imóveis Brasil sobre outra base (área, distância, índice).", cor: "bg-superficie-2 text-texto-2" },
  usuario: { rotulo: "informado pelo usuário", dica: "Declarado por quem cadastrou o imóvel; não conferido em base oficial.", cor: "bg-alerta/15 text-alerta" },
};

export function SeloClassificacao({ valor }: { valor?: string | null }) {
  const c = CLASSIFICACAO[(valor as Classificacao) ?? "oficial"] ?? CLASSIFICACAO.oficial;
  return (
    <span title={c.dica} className={`inline-block text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 font-medium ${c.cor}`}>
      {c.rotulo}
    </span>
  );
}

const SITUACAO: Record<Situacao, { rotulo: string; cor: string }> = {
  ok: { rotulo: "no ar", cor: "bg-verde/10 text-verde" },
  instavel: { rotulo: "fonte com instabilidade", cor: "bg-critico/15 text-critico" },
  sem_verificacao: { rotulo: "sem verificação", cor: "bg-superficie-2 text-texto-2" },
};

export function SeloSituacao({ valor, soProblema = false }: { valor?: string | null; soProblema?: boolean }) {
  const s = SITUACAO[(valor as Situacao) ?? "sem_verificacao"] ?? SITUACAO.sem_verificacao;
  if (soProblema && valor !== "instavel") return null;
  return <span className={`inline-block text-[10px] rounded-full px-2 py-0.5 font-medium ${s.cor}`}>{s.rotulo}</span>;
}

/** Origem carimbada pelo adaptador em cada item (src/lib/rural/adaptadores.ts). */
export type OrigemItem = {
  orgao?: string; base?: string; tipo?: string;
  consultado_em?: string; atualizado_em?: string | null; versao?: string | null;
};

const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");
const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

/**
 * Linha "Fonte: órgão · base · tipo · consultado em … · base atualizada em …".
 * Sem a origem do item (consulta gravada antes de 07/10/2026), cai para o que
 * a tabela de fontes sabe.
 */
export function LinhaOrigem({ origem, orgao, classificacao, consultadoEm, atualizacao }: {
  origem?: OrigemItem | null;
  orgao?: string;
  classificacao?: string | null;
  consultadoEm?: string | null;
  /** frequência de atualização declarada na ficha da fonte */
  atualizacao?: string | null;
}) {
  const partes = [
    origem?.orgao ?? orgao,
    origem?.base,
    consultadoEm || origem?.consultado_em ? `consultado em ${dataHora(consultadoEm ?? origem?.consultado_em)}` : "",
    origem?.atualizado_em ? `base atualizada em ${data(origem.atualizado_em)}` : "",
    origem?.versao ?? "",
    !origem?.atualizado_em && atualizacao ? `atualização da base: ${atualizacao}` : "",
  ].filter(Boolean);
  return (
    <p className="text-[11px] text-texto-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>Fonte:</span>
      <SeloClassificacao valor={origem?.tipo ?? classificacao} />
      <span>{partes.join(" · ")}</span>
    </p>
  );
}
