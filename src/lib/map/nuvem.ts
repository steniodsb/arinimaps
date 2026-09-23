"use client";

import { urlTileAtivo, urlTileSatelite } from "./config";

/**
 * Medidor de nuvem na imagem de satélite, rodando no navegador.
 *
 * POR QUE ISSO EXISTE
 * -------------------
 * A nuvem sobre Iturama não apareceu por acaso: o World Imagery da Esri serve o
 * mosaico CORRENTE, e o mosaico corrente muda sem aviso. Medido em 10/09/2026 no
 * tile do centro de Iturama, o mesmo lugar tinha 2,6% de nuvem no release de
 * outubro/2025 e 44,2% no de agosto/2026. Ninguém foi avisado: a cidade
 * simplesmente amanheceu nublada no mapa.
 *
 * Fixar um release resolve para os municípios de hoje (ver config.ts). O que
 * este arquivo resolve é o de amanhã: quando um município novo entra na região,
 * alguém precisa CONFERIR se o release escolhido está limpo lá — e conferir no
 * olho, cidade por cidade, é o tipo de tarefa que ninguém faz duas vezes.
 *
 * COMO CONTA
 * ----------
 * Pixel claro (valor > 0,70) e sem cor (saturação < 0,18) é candidato a nuvem.
 * Telhado branco, areia e pista de concreto caem na mesma conta — por isso o
 * número nunca é zero absoluto numa cidade, e por isso o critério de alarme é
 * COMPARATIVO (5% de um tile é muita mancha branca contínua), não absoluto.
 *
 * O navegador decodifica o JPEG e o canvas devolve os pixels; a Esri manda
 * cabeçalho CORS, então o canvas não fica marcado e `getImageData` funciona.
 */

export type MedidaNuvem = {
  tiles: number;
  media: number;
  pior: number;
  acimaDoLimite: number;
};

const LIMITE_ALARME = 5; // % de um tile

function paraTile(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    ),
  };
}

function porcentagemDeNuvem(img: HTMLImageElement): number {
  const c = document.createElement("canvas");
  c.width = 80;
  c.height = 80;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(img, 0, 0, 80, 80);
  const { data } = ctx.getImageData(0, 0, 80, 80);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const s = max === 0 ? 0 : (max - min) / max;
    if (max > 0.7 && s < 0.18) n++;
  }
  return (100 * n) / (80 * 80);
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falhou) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => falhou(new Error("tile indisponível"));
    img.src = url;
  });
}

/**
 * Varre uma grade de `lado × lado` pontos dentro do retângulo e devolve a
 * estatística de nuvem. O zoom padrão é 16 de propósito: abaixo de 14 a Esri
 * serve um mosaico de baixa resolução que já vem sem nuvem, e medir ali dá um
 * falso "está tudo limpo" — foi o erro que cometi na primeira medição.
 */
export async function medirNuvem(
  bbox: [number, number, number, number],
  opcoes: { z?: number; lado?: number; release?: string } = {}
): Promise<MedidaNuvem> {
  // sem release explícito, mede a fonte que o mapa está usando de fato
  const { z = 16, lado = 6, release } = opcoes;
  const url = (x: number, y: number) => (release ? urlTileSatelite(z, x, y, release) : urlTileAtivo(z, x, y));
  const [lng0, lat0, lng1, lat1] = bbox;
  const valores: number[] = [];

  for (let i = 0; i < lado; i++) {
    for (let j = 0; j < lado; j++) {
      const lat = lat0 + ((lat1 - lat0) * (i + 0.5)) / lado;
      const lng = lng0 + ((lng1 - lng0) * (j + 0.5)) / lado;
      const { x, y } = paraTile(lat, lng, z);
      try {
        valores.push(porcentagemDeNuvem(await carregar(url(x, y))));
      } catch {
        // tile fora da cobertura do release: não é nuvem, é ausência — ignora
      }
    }
  }

  if (!valores.length) return { tiles: 0, media: 0, pior: 0, acimaDoLimite: 0 };
  return {
    tiles: valores.length,
    media: valores.reduce((s, v) => s + v, 0) / valores.length,
    pior: Math.max(...valores),
    acimaDoLimite: valores.filter((v) => v > LIMITE_ALARME).length,
  };
}

export const LIMITE_NUVEM = LIMITE_ALARME;
