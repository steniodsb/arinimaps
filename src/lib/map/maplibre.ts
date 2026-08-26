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

declare global {
  interface Window {
    maplibregl?: typeof MapLibreNS;
  }
}

let promessa: Promise<typeof MapLibreNS> | null = null;

export function carregarMaplibre(): Promise<typeof MapLibreNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("carregarMaplibre só roda no navegador"));
  }
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (promessa) return promessa;

  promessa = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/maplibre-gl.js";
    script.async = true;
    script.onload = () => {
      if (window.maplibregl) resolve(window.maplibregl);
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
