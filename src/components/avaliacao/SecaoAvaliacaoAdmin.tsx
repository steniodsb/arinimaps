import Link from "next/link";
import { lerConfiguracoes } from "@/lib/settings";
import PainelAvaliacao from "./PainelAvaliacao";

/**
 * Seção "Pré-avaliação e aptidão" da ficha do imóvel na Central. A equipe
 * sempre pode calcular (para validar a metodologia antes de liberar); o aviso
 * diz se os clientes já veem.
 */
export default async function SecaoAvaliacaoAdmin({ propertyId, tipo }: { propertyId: string; tipo: "rural" | "urbano" }) {
  const cfg = await lerConfiguracoes();
  const pre = cfg.pre_avaliacao_ativa === true;
  const apt = cfg.aptidao_ativa === true;
  return (
    <section className="cartao p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-texto">Pré-avaliação{tipo === "rural" ? " e aptidão territorial" : ""}</h2>
          <p className="text-sm text-texto-2">
            Estimativa por comparáveis do próprio sistema, com os fatores e a versão da metodologia gravados para auditoria
            (docs/PRE-AVALIACAO.md).
          </p>
        </div>
        <span className={"text-xs rounded-full px-3 py-1 " + (pre || apt ? "bg-verde/15 text-verde" : "bg-alerta/15 text-alerta")}>
          {pre || apt
            ? `Clientes veem: ${[pre && "pré-avaliação", apt && "aptidão"].filter(Boolean).join(" e ")}`
            : "Desligado para clientes — só a equipe vê"}
        </span>
      </div>
      {!pre && !apt && (
        <p className="text-xs text-texto-2">
          A Diretoria liga em <Link href="/admin/configuracoes" className="text-verde underline">Configurações › Inteligência</Link> depois
          que a Arini aprovar a metodologia (decisão 8.4).
        </p>
      )}
      <PainelAvaliacao propertyId={propertyId} tipoImovel={tipo} modo="admin" />
    </section>
  );
}
