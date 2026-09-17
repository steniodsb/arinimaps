/**
 * Transformação da planta CAD sobre o mapa.
 *
 * A calibração antiga só arrastava (offset leste/norte). Isso resolve o erro de
 * datum — SAD 69 desloca ~66 m no Pontal do Triângulo — mas não resolve planta
 * que fecha no centro e abre nas pontas, que é o que acontece quando o desenho
 * foi amarrado por um único ponto de referência. Aqui a transformação é de
 * similaridade: escala e giro em torno do centro da planta, depois deslocamento.
 *
 * Tudo é calculado em METROS locais em volta do centro da planta, e só então
 * volta para graus — trabalhar direto em graus faria o giro entortar, porque um
 * grau de longitude no Pontal vale ~105 km e um de latitude vale ~110,5 km.
 */

export type Transform = {
  offsetLesteM: number;
  offsetNorteM: number;
  rotacaoGraus: number;
  escala: number;
};

export const TRANSFORM_ZERO: Transform = {
  offsetLesteM: 0, offsetNorteM: 0, rotacaoGraus: 0, escala: 1,
};

/** metros por grau na latitude informada (WGS84, aproximação local). */
export function escalaLocal(lat: number) {
  return {
    porGrauLng: 111_320 * Math.cos((lat * Math.PI) / 180),
    porGrauLat: 110_540,
  };
}

/** metros → graus, para os passos de teclado da calibração. */
export function metrosParaGraus(leste: number, norte: number, lat = -19.5) {
  const k = escalaLocal(lat);
  return { lng: leste / k.porGrauLng, lat: norte / k.porGrauLat };
}

/** Centro (média do bbox) de uma coleção GeoJSON, em graus. */
export function centroDe(fc: GeoJSON.FeatureCollection): [number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const olhar = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      const [x, y] = c as [number, number];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      return;
    }
    if (Array.isArray(c)) for (const f of c) olhar(f);
  };
  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) olhar((f.geometry as { coordinates: unknown }).coordinates);
  }
  if (x0 > x1) return [0, 0];
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** Aplica a transformação a um ponto. Usada no mapa e na tela de calibração. */
export function transformarPonto(
  p: [number, number],
  centro: [number, number],
  t: Transform
): [number, number] {
  const k = escalaLocal(centro[1]);
  const dx = (p[0] - centro[0]) * k.porGrauLng;
  const dy = (p[1] - centro[1]) * k.porGrauLat;
  const rad = (t.rotacaoGraus * Math.PI) / 180;
  const cos = Math.cos(rad), sen = Math.sin(rad);
  const x = t.escala * (dx * cos - dy * sen) + t.offsetLesteM;
  const y = t.escala * (dx * sen + dy * cos) + t.offsetNorteM;
  return [centro[0] + x / k.porGrauLng, centro[1] + y / k.porGrauLat];
}

const ehIdentidade = (t: Transform) =>
  !t.offsetLesteM && !t.offsetNorteM && !t.rotacaoGraus && (t.escala === 1 || !t.escala);

/**
 * Aplica a transformação (e o filtro de layers do CAD) a uma coleção inteira.
 * `layersOcultos` some com vegetação, paisagismo e cotas sem reenviar o arquivo.
 */
export function transformarGeoJSON<T extends GeoJSON.FeatureCollection>(
  fc: T,
  centro: [number, number],
  t: Transform,
  layersOcultos: string[] = []
): T {
  const esconder = new Set(layersOcultos);
  const features = esconder.size
    ? fc.features.filter((f) => !esconder.has(String(f.properties?.layer ?? "")))
    : fc.features;

  if (ehIdentidade(t)) return { ...fc, features } as T;

  const mover = (c: unknown): unknown => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      return transformarPonto(c as [number, number], centro, t);
    }
    return Array.isArray(c) ? c.map(mover) : c;
  };
  return {
    ...fc,
    features: features.map((f) => ({
      ...f,
      geometry: f.geometry && "coordinates" in f.geometry
        ? { ...f.geometry, coordinates: mover((f.geometry as { coordinates: unknown }).coordinates) }
        : f.geometry,
    })),
  } as T;
}

/** Compatibilidade: deslocamento puro em graus (usado onde não há giro). */
export function deslocarGeoJSON<T extends GeoJSON.FeatureCollection>(fc: T, dLng: number, dLat: number): T {
  if (!dLng && !dLat) return fc;
  const mover = (c: unknown): unknown => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      return [(c[0] as number) + dLng, (c[1] as number) + dLat];
    }
    return Array.isArray(c) ? c.map(mover) : c;
  };
  return {
    ...fc,
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry && "coordinates" in f.geometry
        ? { ...f.geometry, coordinates: mover((f.geometry as { coordinates: unknown }).coordinates) }
        : f.geometry,
    })),
  } as T;
}

export type ParDeControle = { planta: [number, number]; satelite: [number, number] };

/**
 * Ajuste por pontos de controle: o operador marca o mesmo canto de quadra na
 * planta e no satélite, e daí sai a transformação inteira.
 *
 * 1 par  → só desloca (a planta não gira nem muda de tamanho).
 * 2+ pares → similaridade por mínimos quadrados (deslocamento, giro e escala).
 *
 * O `residuoM` é o que dá honestidade ao resultado: com 2 pontos ele fecha
 * exato por construção, com 3 ou mais ele mostra quanto a planta ainda erra —
 * é o número que diz se vale continuar ajustando ou se o desenho é que está
 * torto.
 */
export function ajustarPorPontos(
  pares: ParDeControle[],
  centro: [number, number],
  base: Transform = TRANSFORM_ZERO
): (Transform & { residuoM: number }) | null {
  if (!pares.length) return null;
  const k = escalaLocal(centro[1]);
  const local = (p: [number, number]): [number, number] => [
    (p[0] - centro[0]) * k.porGrauLng,
    (p[1] - centro[1]) * k.porGrauLat,
  ];

  // a planta que o operador vê já está transformada; voltamos ao desenho cru
  const inversa = (p: [number, number]): [number, number] => {
    const [x, y] = local(p);
    const rad = (base.rotacaoGraus * Math.PI) / 180;
    const cos = Math.cos(rad), sen = Math.sin(rad);
    const s = base.escala || 1;
    const dx = (x - base.offsetLesteM) / s;
    const dy = (y - base.offsetNorteM) / s;
    return [dx * cos + dy * sen, -dx * sen + dy * cos];
  };

  const P = pares.map((p) => inversa(p.planta));
  const Q = pares.map((p) => local(p.satelite));

  if (pares.length === 1) {
    return {
      escala: 1, rotacaoGraus: 0,
      offsetLesteM: Q[0][0] - P[0][0],
      offsetNorteM: Q[0][1] - P[0][1],
      residuoM: 0,
    };
  }

  const media = (v: [number, number][]): [number, number] => [
    v.reduce((s, p) => s + p[0], 0) / v.length,
    v.reduce((s, p) => s + p[1], 0) / v.length,
  ];
  const pc = media(P), qc = media(Q);

  // similaridade 2D em forma complexa: a = Σ conj(P̂)·Q̂ / Σ |P̂|²
  let re = 0, im = 0, den = 0;
  for (let i = 0; i < P.length; i++) {
    const px = P[i][0] - pc[0], py = P[i][1] - pc[1];
    const qx = Q[i][0] - qc[0], qy = Q[i][1] - qc[1];
    re += px * qx + py * qy;
    im += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (den < 1e-9) return null;
  const ax = re / den, ay = im / den;
  const escala = Math.hypot(ax, ay);
  const rad = Math.atan2(ay, ax);
  const cos = Math.cos(rad), sen = Math.sin(rad);
  const t: Transform = {
    escala,
    rotacaoGraus: (rad * 180) / Math.PI,
    offsetLesteM: qc[0] - escala * (pc[0] * cos - pc[1] * sen),
    offsetNorteM: qc[1] - escala * (pc[0] * sen + pc[1] * cos),
  };

  let soma = 0;
  for (let i = 0; i < P.length; i++) {
    const x = escala * (P[i][0] * cos - P[i][1] * sen) + t.offsetLesteM;
    const y = escala * (P[i][0] * sen + P[i][1] * cos) + t.offsetNorteM;
    soma += (x - Q[i][0]) ** 2 + (y - Q[i][1]) ** 2;
  }
  return { ...t, residuoM: Math.sqrt(soma / P.length) };
}

/**
 * Deslocamento típico entre datums antigos e SIRGAS 2000 no Pontal do
 * Triângulo — medido no DXF de Limeira do Oeste em 26/08/2026. Serve de ponto
 * de partida da calibração: aplica e o operador só faz o ajuste fino.
 */
export const DESLOCAMENTO_DATUM: Record<string, { leste: number; norte: number; rotulo: string }> = {
  sad69: { leste: -59.5, norte: 28.0, rotulo: "SAD 69 → SIRGAS 2000 (~66 m)" },
  corrego: { leste: -47.6, norte: 22.5, rotulo: "Córrego Alegre → SIRGAS 2000 (~53 m)" },
};
