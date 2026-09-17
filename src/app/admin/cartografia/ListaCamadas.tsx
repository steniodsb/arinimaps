"use client";

import { useCallback, useEffect, useState } from "react";
import CalibrarPlanta from "./CalibrarPlanta";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";
import type { Transform } from "@/lib/geo/deslocar";

type Camada = {
  id: string; nome: string; municipio: string | null; tipo: string;
  geojson?: string; opacidade: number; datum: string;
  bytes?: number | null;
  zona?: number | string | null;
  layers_ocultos?: string[];
  layers_cad?: { nome: string; linhas: number }[];
  transform?: Transform;
  offset: { leste_m: number; norte_m: number };
};

const DATUM_LABEL: Record<string, string> = {
  sirgas: "SIRGAS 2000", sad69: "SAD 69", corrego: "Córrego Alegre",
};
const fmt = (n: number) => n.toLocaleString("pt-BR");

export default function ListaCamadas() {
  const [camadas, setCamadas] = useState<Camada[]>([]);
  const [calibrando, setCalibrando] = useState<Camada | null>(null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [carregando, setCarregando] = useState(true);

  // `fresco=1` + `no-store`: esta lista alimenta a tela de calibração, e ler do
  // cache de 60 s reabria a planta nos valores anteriores ao salvar — o ajuste
  // seguinte gravava o valor velho por cima. Ver src/app/api/geo/cartografia.
  const carregar = useCallback(async () => {
    const r = await fetch("/api/geo/cartografia?fresco=1", { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const dados = await r.json();
      setCamadas(
        (dados as Camada[]).map((c) => ({
          ...c,
          offset: { leste_m: c.transform?.offsetLesteM ?? 0, norte_m: c.transform?.offsetNorteM ?? 0 },
        }))
      );
    } else {
      setErro({
        mensagem: "Não consegui listar as camadas publicadas.",
        motivo: r ? `O servidor respondeu ${r.status}.` : "A requisição não chegou ao servidor.",
        solucao: "Recarregue a página. Se repetir, confira se o banco está no ar.",
        codigo: "lista_indisponivel", status: r?.status ?? 0,
      });
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (vivo) await carregar();
    })();
    return () => { vivo = false; };
  }, [carregar]);

  async function remover(c: Camada) {
    if (!confirm(`Remover a camada "${c.nome}" do mapa?`)) return;
    const r = await enviarJson(`/api/admin/cartografia/${c.id}`, "DELETE");
    if (r.ok) { setErro(null); carregar(); } else setErro(r.erro);
  }

  if (carregando) {
    return <p className="cartao px-4 py-8 text-center text-sm text-texto-2">Carregando camadas…</p>;
  }

  if (!camadas.length) {
    return (
      <div className="space-y-3">
        {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
        <p className="cartao px-4 py-8 text-center text-sm text-texto-2">Nenhuma camada publicada ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}

      <div className="cartao divide-y divide-linha">
        {camadas.map((c) => {
          const t = c.transform;
          const desloc = t ? Math.hypot(t.offsetLesteM, t.offsetNorteM) : 0;
          const totalLinhas = (c.layers_cad ?? []).reduce((s, l) => s + l.linhas, 0);
          const ocultas = c.layers_ocultos?.length ?? 0;
          return (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
              <div className="flex-1 min-w-48 space-y-0.5">
                <p className="font-medium">{c.nome}</p>
                <p className="text-xs text-texto-2">
                  {c.municipio} · {c.tipo === "vector" ? "planta vetorial" : "imagem em tiles"}
                  {c.zona ? ` · ${c.zona === "graus" ? "graus" : `UTM ${c.zona}S`}` : ""}
                  {c.datum && ` · ${DATUM_LABEL[c.datum] ?? c.datum}`}
                  {desloc
                    ? ` · ajuste ${t!.offsetLesteM.toFixed(0)}m L / ${t!.offsetNorteM.toFixed(0)}m N`
                    : " · sem ajuste"}
                  {t && Math.abs(t.rotacaoGraus) > 0.0005 && ` · giro ${t.rotacaoGraus.toFixed(3)}°`}
                  {t && Math.abs(t.escala - 1) > 0.0001 && ` · escala ${(t.escala * 100).toFixed(2)}%`}
                </p>
                {(totalLinhas > 0 || c.bytes) && (
                  <p className="text-xs text-texto-2">
                    {totalLinhas > 0 && `${fmt(totalLinhas)} linhas em ${c.layers_cad!.length} camadas do CAD`}
                    {ocultas > 0 && ` · ${ocultas} ocultas no mapa`}
                    {c.bytes ? ` · ${(c.bytes / 1048576).toFixed(1)} MB` : ""}
                  </p>
                )}
              </div>
              <span className="text-xs rounded-full bg-verde/10 text-verde px-3 py-1">no ar</span>
              {c.tipo === "vector" && (
                <button onClick={() => setCalibrando(c)}
                  className="rounded-lg border border-linha px-3 py-1.5 text-xs font-medium hover:bg-superficie-2 transition">
                  Calibrar sobre o satélite
                </button>
              )}
              <button onClick={() => remover(c)}
                className="rounded-lg border border-linha px-3 py-1.5 text-xs text-critico hover:bg-critico/10 transition">
                Remover
              </button>
            </div>
          );
        })}
      </div>

      {calibrando && (
        <CalibrarPlanta camada={calibrando} onFechar={() => { setCalibrando(null); carregar(); }} />
      )}
    </div>
  );
}
