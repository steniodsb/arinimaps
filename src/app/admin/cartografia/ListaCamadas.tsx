"use client";

import { useEffect, useState } from "react";
import CalibrarPlanta from "./CalibrarPlanta";

type Camada = {
  id: string; nome: string; municipio: string | null; tipo: string;
  geojson?: string; opacidade: number; datum: string;
  offset: { leste_m: number; norte_m: number };
};

const DATUM_LABEL: Record<string, string> = {
  sirgas: "SIRGAS 2000", sad69: "SAD 69", corrego: "Córrego Alegre",
};

export default function ListaCamadas() {
  const [camadas, setCamadas] = useState<Camada[]>([]);
  const [calibrando, setCalibrando] = useState<Camada | null>(null);

  async function carregar() {
    const r = await fetch("/api/geo/cartografia");
    if (r.ok) setCamadas(await r.json());
  }
  useEffect(() => { carregar(); }, []);

  if (!camadas.length) {
    return <p className="cartao px-4 py-8 text-center text-sm text-texto-2">
      Nenhuma camada publicada ainda.
    </p>;
  }

  return (
    <>
      <div className="cartao divide-y divide-linha">
        {camadas.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
            <div className="flex-1 min-w-48">
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-texto-2">
                {c.municipio} · {c.tipo === "vector" ? "planta vetorial" : "imagem em tiles"}
                {c.datum && ` · ${DATUM_LABEL[c.datum] ?? c.datum}`}
                {(c.offset.leste_m || c.offset.norte_m)
                  ? ` · ajuste ${c.offset.leste_m}m L / ${c.offset.norte_m}m N`
                  : " · sem ajuste"}
              </p>
            </div>
            <span className="text-xs rounded-full bg-verde/10 text-verde px-3 py-1">no ar</span>
            {c.tipo === "vector" && (
              <button onClick={() => setCalibrando(c)}
                className="rounded-lg border border-linha px-3 py-1.5 text-xs font-medium hover:bg-superficie-2 transition">
                Calibrar sobre o satélite
              </button>
            )}
            <button
              onClick={async () => {
                if (!confirm(`Remover a camada "${c.nome}" do mapa?`)) return;
                const r = await fetch(`/api/admin/cartografia/${c.id}`, { method: "DELETE" });
                if (r.ok) carregar(); else alert((await r.json()).error ?? "Falha.");
              }}
              className="rounded-lg border border-linha px-3 py-1.5 text-xs text-critico hover:bg-critico/10 transition">
              Remover
            </button>
          </div>
        ))}
      </div>

      {calibrando && (
        <CalibrarPlanta camada={calibrando} onFechar={() => { setCalibrando(null); carregar(); }} />
      )}
    </>
  );
}
