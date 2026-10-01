/**
 * Lista de incidências por fonte oficial — a mesma leitura do relatório
 * territorial do imóvel, reaproveitada na consulta de área.
 *
 * Regra que não muda: fonte que falhou aparece como "fonte indisponível" e
 * fonte ainda não consultada como "sem consulta". Nenhuma das duas pode ser
 * lida como "nada encontrado".
 */
export type ItemFonte = { titulo: string; detalhe?: string; extra?: Record<string, string | number | null> };
export type FonteConsultada = {
  id: string; nome: string; orgao: string;
  consulta: {
    quantidade: number; raio_m: number; erro: string | null; consultado_em: string;
    resultado: { itens?: ItemFonte[] };
  } | null;
};

export default function FontesLista({ fontes, alvo = "a área" }: { fontes: FonteConsultada[]; alvo?: string }) {
  return (
    <div className="space-y-3">
      {fontes.map((f) => {
        const c = f.consulta;
        const itens = c?.resultado?.itens ?? [];
        const estado = !c ? "sem consulta"
          : c.erro ? "fonte indisponível"
          : c.quantidade > 0 ? `${c.quantidade.toLocaleString("pt-BR")} registro(s)`
          : "nenhuma incidência";
        return (
          <div key={f.id} className="cartao p-4 break-inside-avoid">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-medium text-texto">{f.nome} <span className="text-texto-2 text-xs">· {f.orgao}</span></p>
              <span className={"text-xs font-medium " +
                (c?.erro ? "text-alerta" : !c ? "text-texto-2" : c.quantidade > 0 ? "text-ouro" : "text-verde")}>
                {estado}
              </span>
            </div>

            {c?.erro && (
              <p className="text-xs text-alerta mt-1">
                O serviço não respondeu ({c.erro}). Ausência de dados aqui não significa ausência de registro no órgão.
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
                  </li>
                ))}
                {itens.length > 8 && (
                  <li className="text-xs text-texto-2">… e mais {itens.length - 8} registro(s).</li>
                )}
              </ul>
            )}

            {c && !c.erro && (
              <p className="text-[11px] text-texto-2 mt-2">
                Consultado em {new Date(c.consultado_em).toLocaleString("pt-BR")}
                {c.raio_m ? ` · raio de ${c.raio_m / 1000} km ao redor` : ` · sobre ${alvo}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
