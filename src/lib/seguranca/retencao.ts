import "server-only";
import { lerConfiguracoes, numero } from "@/lib/settings";

/**
 * Prazos de guarda em vigor (Configurações › Segurança), item 6.4.
 * 0 = não descartar. O prazo dos registros de acesso nunca fica abaixo de
 * 180 dias (Marco Civil da Internet, art. 15) — a mesma regra vale no worker
 * (worker/jobs/descarteRetencao.mjs).
 */
export const MINIMO_LOGS_DIAS = 180;

export type PrazosRetencao = { selfie: number; docs: number; logs: number; executar: boolean };

export async function prazosRetencao(): Promise<PrazosRetencao> {
  const cfg = await lerConfiguracoes();
  const n = (chave: string) => Math.max(0, Math.floor(numero(cfg, chave, 0)));
  const logs = n("retencao_logs_acesso_dias");
  return {
    selfie: n("retencao_selfie_dias"),
    docs: n("retencao_docs_reprovados_dias"),
    logs: logs > 0 ? Math.max(logs, MINIMO_LOGS_DIAS) : 0,
    executar: cfg.retencao_executar === true,
  };
}

export type Candidatos = {
  selfies: { id: string; property_id: string; path: string }[];
  documentos: { id: string; property_id: string; path: string; tipo: string; nome: string | null }[];
  logs: Record<string, number>;
};

/** Próxima revisão trimestral de acessos (item 6.13): 90 dias depois da última. */
export const REVISAO_DIAS = 90;
export function proximaRevisao(ultima: string | null | undefined) {
  if (!ultima) return null;
  return new Date(new Date(ultima).getTime() + REVISAO_DIAS * 86_400_000);
}
/** A revisão está vencida (ou nunca foi feita)? */
export function revisaoVencida(proxima: Date | null) {
  return !proxima || proxima.getTime() < Date.now();
}

/** Instante de N dias (ou horas) atrás, em ISO — para filtros das telas do servidor. */
export function haDias(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}
