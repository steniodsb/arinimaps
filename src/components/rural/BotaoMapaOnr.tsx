"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * Atalho para o Mapa do Registro de Imóveis do ONR (20/10/2026): o mapa oficial
 * dos cartórios, grátis, mostra a matrícula também de imóvel urbano e de rural
 * sem certificação no SIGEF — onde não temos fonte automática. O mapa não tem
 * API nem aceita posição pelo link (e usa reCAPTCHA), então o botão copia a
 * coordenada e abre o mapa: a pessoa cola na busca por coordenada.
 */
export default function BotaoMapaOnr({ lat, lng, compacto = false }: { lat: number; lng: number; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const coordenada = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  async function abrir() {
    try {
      await navigator.clipboard.writeText(coordenada);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 6000);
    } catch { /* sem permissão de área de transferência: a coordenada fica visível abaixo */ }
    window.open("https://mapa.onr.org.br/", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={abrir}
        className={`btn-contorno flex w-full items-center justify-center gap-1.5 text-sm ${compacto ? "py-2" : "py-2.5"}`}>
        <ExternalLink className="size-4" aria-hidden /> Ver matrícula no mapa dos cartórios (ONR)
      </button>
      <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-texto-2" role="status">
        {copiado
          ? <><Check className="size-3.5 shrink-0 text-verde" aria-hidden /> Coordenada copiada. No mapa, aceite o termo, escolha a busca por coordenada e cole.</>
          : <><Copy className="size-3.5 shrink-0" aria-hidden /> Copia a coordenada <span className="font-mono">{coordenada}</span> e abre o mapa oficial, gratuito.</>}
      </p>
    </div>
  );
}
