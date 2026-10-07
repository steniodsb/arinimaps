/**
 * Lista de incidências por fonte oficial — a mesma leitura do relatório
 * territorial do imóvel, reaproveitada na consulta de área.
 *
 * Regra que não muda: fonte que falhou aparece como "fonte indisponível",
 * fonte instável (3 verificações seguidas com falha) como "fonte com
 * instabilidade" e fonte ainda não consultada como "sem consulta". Nenhuma
 * delas pode ser lida como "nada encontrado".
 *
 * Origem (3.15): cada bloco mostra órgão, base, tipo (oficial / terceiro /
 * derivado / informado pelo usuário), data da consulta e, quando o serviço
 * informa, a data ou versão da base. A origem vem carimbada em cada item pelo
 * adaptador; `classificacao`, `situacao` e `atualizacao` vêm de fontes_externas
 * e são opcionais — sem elas o bloco cai para o que o item traz.
 */
import { LinhaOrigem, SeloClassificacao, SeloSituacao, type OrigemItem } from "./Selos";

export type ItemFonte = {
  titulo: string; detalhe?: string;
  extra?: Record<string, string | number | null>;
  origem?: OrigemItem;
};
export type FonteConsultada = {
  id: string; nome: string; orgao: string;
  /** fontes_externas.classificacao: oficial | terceiro | derivado */
  classificacao?: string | null;
  /** fontes_externas.situacao: ok | instavel | sem_verificacao */
  situacao?: string | null;
  /** fontes_externas.ficha->>'atualizacao' (frequência declarada) */
  atualizacao?: string | null;
  consulta: {
    quantidade: number; raio_m: number; erro: string | null; consultado_em: string;
    resultado: { itens?: ItemFonte[]; origem?: OrigemItem };
  } | null;
};

export default function FontesLista({ fontes, alvo = "a área" }: { fontes: FonteConsultada[]; alvo?: string }) {
  return (
    <div className="space-y-3">
      {fontes.map((f) => {
        const c = f.consulta;
        const itens = c?.resultado?.itens ?? [];
        const instavel = f.situacao === "instavel";
        const origem = c?.resultado?.origem ?? itens.find((i) => i.origem)?.origem ?? null;
        const estado = !c ? "sem consulta"
          : c.erro ? (instavel ? "fonte com instabilidade" : "fonte indisponível")
          : c.quantidade > 0 ? `${c.quantidade.toLocaleString("pt-BR")} registro(s)`
          : instavel ? "fonte com instabilidade"
          : "nenhuma incidência";
        return (
          <div key={f.id} className="cartao p-4 break-inside-avoid">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-medium text-texto flex flex-wrap items-center gap-1.5">
                {f.nome} <span className="text-texto-2 text-xs">· {f.orgao}</span>
                <SeloClassificacao valor={origem?.tipo ?? f.classificacao} />
                <SeloSituacao valor={f.situacao} soProblema />
              </p>
              <span className={"text-xs font-medium " +
                (c?.erro || (instavel && !c?.quantidade) ? "text-alerta"
                  : !c ? "text-texto-2" : c.quantidade > 0 ? "text-ouro" : "text-verde")}>
                {estado}
              </span>
            </div>

            {c?.erro && (
              <p className="text-xs text-alerta mt-1">
                O serviço não respondeu ({c.erro}). Ausência de dados aqui não significa ausência de registro no órgão.
              </p>
            )}
            {instavel && !c?.erro && (
              <p className="text-xs text-alerta mt-1">
                Esta fonte falhou nas últimas verificações automáticas. {c?.quantidade
                  ? "Os registros abaixo são reais, mas podem estar incompletos."
                  : "A consulta não trouxe registro, o que não basta para concluir que não há — refaça a consulta mais tarde."}
              </p>
            )}

            {itens.length > 0 && (
              <ul className="mt-2.5 space-y-1.5 text-sm">
                {itens.slice(0, 8).map((i, n) => (
                  <li key={n} className="border-b border-linha last:border-0 pb-1.5">
                    <p className="text-texto">{i.titulo}</p>
                    {i.detalhe && <p className="text-xs text-texto-2">{i.detalhe}</p>}
                    {i.extra && (
                      <p className="text-[11px] text-texto-2">
                        {Object.entries(i.extra)
                          .filter(([, v]) => v !== "" && v != null)
                          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                    {/* item com origem própria (diferente da do bloco) mostra a dele */}
                    {i.origem && origem && (i.origem.base !== origem.base || i.origem.orgao !== origem.orgao) && (
                      <LinhaOrigem origem={i.origem} />
                    )}
                  </li>
                ))}
                {itens.length > 8 && (
                  <li className="text-xs text-texto-2">… e mais {itens.length - 8} registro(s).</li>
                )}
              </ul>
            )}

            {c && (
              <div className="mt-2 space-y-0.5">
                <LinhaOrigem origem={origem} orgao={f.orgao} classificacao={f.classificacao}
                  consultadoEm={c.consultado_em} atualizacao={f.atualizacao} />
                {!c.erro && (
                  <p className="text-[11px] text-texto-2">
                    {c.raio_m ? `Raio de ${c.raio_m / 1000} km ao redor de ${alvo}` : `Sobre ${alvo}`}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
