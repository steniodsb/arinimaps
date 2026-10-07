import { lerConfiguracoes } from "@/lib/settings";
import { ator, temRecurso } from "@/lib/authz";
import PainelAvaliacao from "./PainelAvaliacao";

/**
 * Cartão da ficha pública. Só aparece quando a Diretoria ligou a função
 * (pre_avaliacao_ativa / aptidao_ativa) E o plano da conta tem
 * `pre_avaliacao`. Fora disso não renderiza nada — nem um aviso.
 */
export default async function CartaoAvaliacaoPublico({ propertyId, tipo, status }: {
  propertyId: string | null | undefined; tipo: "rural" | "urbano"; status: string;
}) {
  if (!propertyId || !["publicado", "em_negociacao"].includes(status)) return null;
  const cfg = await lerConfiguracoes();
  const pre = cfg.pre_avaliacao_ativa === true;
  const apt = cfg.aptidao_ativa === true && tipo === "rural";
  if (!pre && !apt) return null;
  const a = await ator();
  if (!a || a.ehArini || !temRecurso(a, "pre_avaliacao")) return null;

  return (
    <section className="cartao p-5 space-y-3">
      <div>
        <h2 className="text-2xl font-semibold text-texto">
          {pre ? "Pré-avaliação de valor" : "Aptidão territorial"}
        </h2>
        <p className="text-sm text-texto-2">
          Estimativa automatizada, não substitui avaliação profissional. Mostra os dados usados e o que falta.
        </p>
      </div>
      <PainelAvaliacao propertyId={propertyId} tipoImovel={tipo} modo="publico"
        mostrarPre={pre} mostrarAptidao={apt} podeContatar />
    </section>
  );
}
