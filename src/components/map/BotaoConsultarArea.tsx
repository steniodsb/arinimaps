"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw, ScanSearch } from "lucide-react";

/**
 * Dispara o cruzamento da área com as fontes oficiais (CAR, lote ou área
 * desenhada — muda só a `url`). Quem decide se pode é o servidor (plano +
 * cota): aqui só mostramos o que ele responder, inclusive a `solucao` quando a
 * consulta é negada (sem plano, cota esgotada).
 */
export default function BotaoConsultarArea({
  url, corpo, jaConsultou, planNome, cotaRestante,
}: {
  url: string;
  /** corpo JSON do POST, quando a rota precisa (área desenhada: a chave) */
  corpo?: unknown;
  jaConsultou: boolean; planNome?: string | null; cotaRestante?: number | null;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState("");
  const [solucao, setSolucao] = useState("");
  const [negado, setNegado] = useState(false);

  async function consultar() {
    setRodando(true); setMsg(""); setSolucao(""); setNegado(false);
    const r = await fetch(url, corpo === undefined ? { method: "POST" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    }).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : {};
    setRodando(false);
    if (!r?.ok) {
      setMsg(data.error ?? "Não foi possível consultar agora.");
      if (typeof data.solucao === "string") setSolucao(data.solucao);
      if (data.codigo === "sem_plano" || data.codigo === "cota_esgotada") setNegado(true);
      return;
    }
    setMsg(
      data.falharam?.length
        ? `${data.falharam.length} fonte(s) não responderam e aparecem como indisponíveis.`
        : data.consultadas === 0 ? "Os dados já estavam atualizados." : ""
    );
    router.refresh();
  }

  const semCota = cotaRestante != null && cotaRestante <= 0;

  return (
    <div className="text-right space-y-1.5">
      <button onClick={consultar} disabled={rodando || semCota} className="btn-verde inline-flex items-center gap-2 px-5 py-3 text-sm disabled:opacity-60">
        {rodando ? <LoaderCircle className="size-4 animate-spin" /> : jaConsultou ? <RefreshCw className="size-4" /> : <ScanSearch className="size-4" />}
        {rodando ? "Consultando os órgãos…" : jaConsultou ? "Atualizar consulta" : "Consultar fontes oficiais"}
      </button>
      {cotaRestante != null && (
        <p className={"text-xs " + (semCota ? "text-alerta" : "text-texto-2")}>
          Consultas restantes no mês: {cotaRestante}{planNome ? ` · plano ${planNome}` : ""}
          {semCota && <> · <Link href="/planos" className="text-verde underline">ver planos</Link></>}
        </p>
      )}
      {msg && <p className={"text-xs max-w-72 ml-auto " + (negado ? "text-alerta" : "text-texto-2")}>{msg}</p>}
      {solucao && (
        <p className="text-xs text-texto max-w-72 ml-auto">
          {solucao}{negado && <> <Link href="/planos" className="text-verde underline">Ver planos</Link></>}
        </p>
      )}
    </div>
  );
}
