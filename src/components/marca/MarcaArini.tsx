import { LOGO, RADAR, SIMBOLO, type Papel, type Vetor } from "./vetores";

/**
 * Marca Arini (Manual de Identidade Visual v1.0, out/2026).
 *
 * - `completa`: assinatura horizontal (uso preferencial: site, capas).
 * - `simbolo`: o A com o radar (avatar, ícone, espaço quadrado).
 * - `radar`: marcador de localização (pinos, selos, favicon).
 *
 * As letras usam `currentColor`: a classe `text-marca` troca sozinha entre a
 * versão positiva (Verde Arini sobre claro) e a negativa (off-white sobre
 * verde). O radar fica sempre em Dourado/Oliva — o manual proíbe trocar as
 * cores da marca. `mono` é a versão monocromática (tudo numa cor só).
 *
 * Tamanho mínimo digital: assinatura 120 px de largura, símbolo 32 px,
 * radar 20 px. Área de proteção: 1/2 da altura das letras em volta.
 */
const COR: Record<Papel, string> = {
  letras: "currentColor",
  ponto: "#D9BD6F",
  anel: "#998C54",
  tarjas: "#63633B",
};

const VETORES = { completa: LOGO, simbolo: SIMBOLO, radar: RADAR } satisfies Record<string, Vetor>;

export default function MarcaArini({
  variante = "completa", mono = false, className = "", titulo = "Arini",
}: {
  variante?: keyof typeof VETORES;
  mono?: boolean;
  className?: string;
  /** nome lido por leitor de tela; vazio = decorativa */
  titulo?: string;
}) {
  const v = VETORES[variante];
  return (
    <svg viewBox={`0 0 ${v.w} ${v.h}`} className={className} role={titulo ? "img" : undefined}
      aria-label={titulo || undefined} aria-hidden={titulo ? undefined : true}>
      {v.partes.map((p, i) => (
        <path key={i} d={p.d} fill={mono ? "currentColor" : COR[p.papel]} fillRule={p.evenodd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}
