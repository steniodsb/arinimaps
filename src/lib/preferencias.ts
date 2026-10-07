/**
 * Preferências da conta (roadmap 5.10): tema e ajustes que acompanham a pessoa
 * em qualquer aparelho. Moram em `profiles.preferencias` (jsonb) e são lidas e
 * gravadas por `GET/PATCH /api/conta/preferencias`.
 *
 * Sem sessão, o mesmo formato fica no localStorage (`arini:preferencias`) —
 * vale só naquele navegador. Ao entrar, o que está na conta manda.
 *
 * Aqui ficam só os tipos e a validação (`normalizar`), que rodam também no
 * servidor. O hook `usePreferencias` mora em `usePreferencias.ts` ("use
 * client"): um módulo com hooks importado por página de servidor quebra o build.
 *
 * Uso no mapa:
 *   const { prefs, salvar } = usePreferencias();
 *   const [base, setBase] = useState(prefs.mapa_base);          // inicial
 *   ...ao trocar: salvar({ mapa_base: "mapa" })
 */

export type TemaPreferido = "claro" | "escuro" | "sistema";
export type BaseMapa = "satelite" | "mapa";

export type Preferencias = {
  /** "sistema" = segue o aparelho (prefers-color-scheme) */
  tema: TemaPreferido;
  /** base inicial do mapa interativo */
  mapa_base: BaseMapa;
  /** camada do CAR ligada ao abrir o mapa */
  camada_car: boolean;
  /** aceita receber e-mails de novidades (opt-in — LGPD) */
  emails_novidades: boolean;
};

export const PREFERENCIAS_PADRAO: Preferencias = {
  tema: "sistema",
  mapa_base: "satelite",
  camada_car: true,
  emails_novidades: false,
};

export const CHAVE_PREFERENCIAS = "arini:preferencias";

/** Aceita qualquer coisa e devolve só chaves conhecidas com valores válidos. */
export function normalizar(bruto: unknown, base: Preferencias = PREFERENCIAS_PADRAO): Preferencias {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    tema: b.tema === "claro" || b.tema === "escuro" || b.tema === "sistema" ? b.tema : base.tema,
    mapa_base: b.mapa_base === "satelite" || b.mapa_base === "mapa" ? b.mapa_base : base.mapa_base,
    camada_car: typeof b.camada_car === "boolean" ? b.camada_car : base.camada_car,
    emails_novidades: typeof b.emails_novidades === "boolean" ? b.emails_novidades : base.emails_novidades,
  };
}

/** Só as chaves válidas presentes no objeto (para PATCH parcial). */
export function parcialValido(bruto: unknown): Partial<Preferencias> {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const n = normalizar(b);
  const saida: Partial<Preferencias> = {};
  for (const k of Object.keys(PREFERENCIAS_PADRAO) as (keyof Preferencias)[]) {
    if (k in b && b[k] === n[k]) (saida as Record<string, unknown>)[k] = n[k];
  }
  return saida;
}

