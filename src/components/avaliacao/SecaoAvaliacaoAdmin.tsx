import Link from "next/link";
import { lerConfiguracoes } from "@/lib/settings";
import { Calculator, Eye, EyeOff } from "lucide-react";
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
    <section className="cartao p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde/12 text-verde" aria-hidden>
            <Calculator className="size-5" />
          </span>
          <div className="min-w-0">
          <h2 className="lp-display text-xl text-texto">Pré-avaliação{tipo === "rural" ? " e aptidão territorial" : ""}</h2>
          <p className="mt-1 text-sm leading-relaxed text-texto-2 max-w-2xl">
            Estimativa por comparáveis do próprio sistema, com os fatores e a versão da metodologia gravados para auditoria
            (docs/PRE-AVALIACAO.md).
          </p>
          </div>
        </div>
        <span className={"inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold " + (pre || apt ? "bg-verde/14 text-verde border-verde/25" : "bg-alerta/14 text-alerta border-alerta/30")}>
          {pre || apt ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {pre || apt
            ? `Clientes veem: ${[pre && "pré-avaliação", apt && "aptidão"].filter(Boolean).join(" e ")}`
            : "Desligado para clientes — só a equipe vê"}
        </span>
      </div>
      {!pre && !apt && (
        <p className="text-sm text-texto-2">
          A Diretoria liga em <Link href="/admin/configuracoes" className="text-verde underline">Configurações › Inteligência</Link> depois
          que a Arini aprovar a metodologia (decisão 8.4).
        </p>
      )}
      <PainelAvaliacao propertyId={propertyId} tipoImovel={tipo} modo="admin" />
    </section>
  );
}
