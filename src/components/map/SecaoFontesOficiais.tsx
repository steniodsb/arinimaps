import Link from "next/link";
import FontesLista, { type FonteConsultada } from "@/components/rural/FontesLista";
import BotaoConsultarArea from "@/components/map/BotaoConsultarArea";
import type { Acesso } from "@/lib/planos";

/**
 * Seção "Informações territoriais" das páginas de consulta (CAR, lote, área
 * desenhada): botão de consultar conforme conta/plano/cota, a lista por fonte e
 * os avisos que não podem faltar (fonte não consultada ≠ ausência de restrição).
 */
export default function SecaoFontesOficiais({
  url, corpo, descricao, logado, podeConsultar, acesso, cotaRestante, lista, pendentes, jaConsultou, alvo = "a área",
}: {
  url: string;
  corpo?: unknown;
  descricao: string;
  logado: boolean;
  podeConsultar: boolean;
  acesso: Acesso;
  cotaRestante: number | null;
  lista: FonteConsultada[];
  pendentes: string[];
  jaConsultou: boolean;
  alvo?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-texto text-lg">Informações territoriais</h2>
          <p className="text-sm text-texto-2 max-w-2xl">{descricao}</p>
        </div>
        {!logado ? (
          <Link href="/entrar" className="btn-verde px-5 py-2.5 text-sm">Entre para consultar</Link>
        ) : !podeConsultar ? (
          <div className="text-right text-sm space-y-1 max-w-72">
            <p className="text-texto">A consulta de área faz parte da consulta profissional.</p>
            <p className="text-xs text-texto-2">
              Seu plano{acesso.planNome ? ` (${acesso.planNome})` : ""} não inclui o cruzamento com as fontes oficiais.
            </p>
            <Link href="/planos" className="btn-ouro inline-block px-5 py-2.5 text-sm">Ver planos</Link>
          </div>
        ) : (
          <BotaoConsultarArea url={url} corpo={corpo} jaConsultou={jaConsultou} planNome={acesso.planNome} cotaRestante={cotaRestante} />
        )}
      </div>

      {jaConsultou
        ? <FontesLista fontes={lista} alvo={alvo} />
        : (
          <p className="cartao p-5 text-sm text-texto-2">
            {!logado
              ? `Crie uma conta ou entre para consultar as fontes oficiais sobre ${alvo}.`
              : !podeConsultar
              ? `Nenhuma consulta feita ainda para ${alvo}. O cruzamento com as fontes oficiais está disponível nos planos profissionais.`
              : `Nenhuma consulta feita ainda para ${alvo}. Clique em “Consultar fontes oficiais” — leva de 10 a 40 segundos.`}
          </p>
        )}

      {pendentes.length > 0 && (
        <p className="text-xs text-texto-2">
          Ainda não consultadas automaticamente (dependem de arquivo oficial):{" "}
          {pendentes.join(", ")}. A ausência delas aqui não significa ausência de restrição.
        </p>
      )}
      <p className="text-xs text-texto-2">
        Consulta informativa. Não é laudo, parecer nem certidão, e não substitui os documentos oficiais do imóvel.
      </p>
    </section>
  );
}
