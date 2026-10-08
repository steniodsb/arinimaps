"use client";

/**
 * Conferência de nuvem no satélite, por município.
 *
 * A nuvem sobre Iturama entrou numa atualização do mosaico da Esri e ninguém
 * foi avisado — a cidade amanheceu nublada no mapa e só descobrimos quando o
 * Stenio abriu a tela. Fixar um release do Wayback (ver src/lib/map/config.ts)
 * impede que isso se repita nos municípios de hoje, porque release é imutável.
 *
 * O que sobra de risco é o município NOVO: nada garante que o release escolhido
 * esteja limpo sobre uma cidade que ainda não estava no mapa quando ele foi
 * escolhido. Este botão fecha esse buraco — mede antes de o cliente ver.
 */

import { useState } from "react";
import { medirNuvem, LIMITE_NUVEM, type MedidaNuvem } from "@/lib/map/nuvem";
import { SATELITE_RELEASE, PROVEDOR_SATELITE } from "@/lib/map/config";
import { AvisoErro } from "@/components/ui/Aviso";
import type { ErroApi } from "@/lib/api/enviar";
import { CheckCircle2, CloudSun } from "lucide-react";

type Linha = { nome: string; medida: MedidaNuvem | null };

export default function ConfereSatelite() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [medindo, setMedindo] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [pronto, setPronto] = useState(false);

  async function conferir() {
    setErro(null);
    setLinhas([]);
    setPronto(false);
    setMedindo("carregando municípios…");

    const r = await fetch("/api/geo/municipios").catch(() => null);
    if (!r?.ok) {
      setMedindo(null);
      setErro({
        mensagem: "Não consegui carregar os limites dos municípios.",
        motivo: r ? `O servidor respondeu ${r.status}.` : "A requisição não chegou ao servidor.",
        solucao: "Recarregue a página e tente de novo.",
        codigo: "municipios_indisponiveis", status: r?.status ?? 0,
      });
      return;
    }

    const geo = await r.json();
    const feicoes: { properties: { nome: string }; geometry: { coordinates: unknown } }[] =
      geo.features ?? geo ?? [];

    const resultado: Linha[] = [];
    for (const f of feicoes) {
      const nome = f.properties?.nome ?? "—";
      setMedindo(nome);
      const xs: number[] = [], ys: number[] = [];
      const olhar = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
          xs.push(c[0] as number); ys.push(c[1] as number);
        } else if (Array.isArray(c)) c.forEach(olhar);
      };
      olhar(f.geometry?.coordinates);
      if (!xs.length) { resultado.push({ nome, medida: null }); continue; }

      const medida = await medirNuvem([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
      resultado.push({ nome, medida });
      setLinhas([...resultado]);
    }

    setMedindo(null);
    setPronto(true);
  }

  const comProblema = linhas.filter((l) => (l.medida?.acimaDoLimite ?? 0) > 0);

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 max-w-3xl">
          <p className="lp-eyebrow text-xs">Satélite</p>
          <h2 className="lp-display mt-2 text-2xl md:text-[1.75rem] text-texto">Nuvem na imagem de satélite</h2>
          <p className="mt-1.5 text-base text-texto-2">
            {PROVEDOR_SATELITE === "esri"
              ? "A imagem é o mosaico licenciado da Esri, que a Esri atualiza sem aviso — uma atualização pode trazer nuvem. Rode isto depois de ligar a chave, ao incluir um município novo e de tempos em tempos."
              : PROVEDOR_SATELITE === "maptiler"
                ? "A imagem vem do MapTiler. Rode isto ao incluir um município novo."
                : `A imagem é um release congelado da Esri (${SATELITE_RELEASE}), escolhido por ser o mais limpo sobre a região. Rode isto ao incluir um município novo: nada garante que o release esteja limpo sobre uma cidade que não existia no mapa quando ele foi escolhido.`}
          </p>
        </div>
        <button onClick={conferir} disabled={!!medindo}
          className="btn-contorno inline-flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-50 shrink-0">
          <CloudSun className="size-4" />
          {medindo ? "Medindo…" : "Conferir os municípios"}
        </button>
      </div>

      <div className="cartao p-6 space-y-4">
      {!medindo && !linhas.length && !pronto && !erro && (
        <p className="text-base text-texto-2">Nenhuma conferência rodada nesta sessão.</p>
      )}
      {medindo && (
        <p className="text-base text-texto-2">
          Medindo <strong className="text-texto">{medindo}</strong> — 36 tiles no zoom do lote, direto da fonte de satélite em uso.
        </p>
      )}

      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}

      {!!linhas.length && (
        <div className="divide-y divide-linha text-[0.95rem]">
          {linhas.map((l) => {
            const m = l.medida;
            const ruim = (m?.acimaDoLimite ?? 0) > 0;
            return (
              <div key={l.nome} className="py-3 flex items-center justify-between gap-3">
                <span className="font-semibold text-texto">{l.nome}</span>
                {!m ? (
                  <span className="text-sm text-texto-2">sem limites cadastrados</span>
                ) : (
                  <span className={`text-sm font-semibold tabular-nums ${ruim ? "text-alerta" : "text-verde"}`}>
                    {ruim
                      ? `${m.acimaDoLimite} de ${m.tiles} tiles com nuvem · pior ${m.pior.toFixed(1)}%`
                      : `limpo · pior ${m.pior.toFixed(1)}%`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pronto && (
        comProblema.length === 0 ? (
          <p className="flex items-center gap-2 text-base font-semibold text-verde">
            <CheckCircle2 className="size-5 shrink-0" />
            Nenhum município com nuvem acima de {LIMITE_NUVEM}% em nenhum tile. Não há o que fazer.
          </p>
        ) : (
          <div className="rounded-xl border border-alerta/40 bg-alerta/10 p-5 text-[0.95rem] leading-relaxed space-y-2">
            <p className="font-semibold text-alerta">
              {comProblema.map((l) => l.nome).join(", ")} {comProblema.length > 1 ? "estão" : "está"} com nuvem.
            </p>
            {PROVEDOR_SATELITE !== "wayback" ? (
            <p className="text-texto-2">
              A fonte licenciada em uso tem nuvem sobre {comProblema.length > 1 ? "esses municípios" : "esse município"}.
              Ela é atualizada pelo fornecedor e costuma limpar na próxima passagem; se o cliente precisar da imagem
              limpa antes disso, fale com o desenvolvedor.
            </p>
            ) : (
            <p className="text-texto-2">
              O release {SATELITE_RELEASE} não serve para {comProblema.length > 1 ? "esses municípios" : "esse município"}.
              Rode <code className="font-mono text-xs">node scripts/mede-nuvem.mjs --releases 20</code> para achar um
              release limpo e troque <code className="font-mono text-xs">SATELITE_RELEASE</code> em{" "}
              <code className="font-mono text-xs">src/lib/map/config.ts</code>. Se nenhum release servir para todos,
              dá para usar um release por município — o MapLibre aceita limites por fonte.
            </p>
            )}
          </div>
        )
      )}
      </div>
    </section>
  );
}
