"use client";

/**
 * Carrega o MapLibre a partir do build UMD servido em /vendor/maplibre-gl.js.
 *
 * POR QUÊ: o bundle do maplibre-gl via Turbopack quebra o web worker interno —
 * o mapa cria a UI mas nunca busca tiles (canvas fica na cor de fundo, sem erro
 * no console). O build UMD oficial embute o worker via blob e funciona em
 * qualquer bundler. Os TIPOS continuam vindo do pacote npm (mesma versão 5.6.0
 * pinada no package.json; ao atualizar o pacote, copie o dist novo para
 * public/vendor).
 */

import type * as MapLibreNS from "maplibre-gl";
import { Protocol } from "pmtiles";

declare global {
  interface Window {
    maplibregl?: typeof MapLibreNS;
  }
}

let promessa: Promise<typeof MapLibreNS> | null = null;

/**
 * `pmtiles://` — arquivo de mapa único (ex.: a malha nacional do CAR na
 * Cloudflare R2): o MapLibre lê só os pedaços da tela por Range request.
 * Registrado uma vez, junto com o carregamento do MapLibre.
 */
function registrarPmtiles(ml: typeof MapLibreNS) {
  const w = window as unknown as { __pmtilesRegistrado?: boolean };
  if (w.__pmtilesRegistrado) return ml;
  ml.addProtocol("pmtiles", new Protocol({ metadata: true }).tile);
  w.__pmtilesRegistrado = true;
  return ml;
}

export function carregarMaplibre(): Promise<typeof MapLibreNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("carregarMaplibre só roda no navegador"));
  }
  if (window.maplibregl) return Promise.resolve(registrarPmtiles(window.maplibregl));
  if (promessa) return promessa;

  promessa = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/maplibre-gl.js";
    script.async = true;
    script.onload = () => {
      if (window.maplibregl) resolve(registrarPmtiles(window.maplibregl));
      else reject(new Error("maplibre-gl carregou mas não expôs window.maplibregl"));
    };
    script.onerror = () => {
      promessa = null;
      reject(new Error("falha ao carregar /vendor/maplibre-gl.js"));
    };
    document.head.appendChild(script);
  });
  return promessa;
}
