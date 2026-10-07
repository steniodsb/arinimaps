"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson, type ErroApi } from "@/lib/api/enviar";
import { AvisoErro } from "@/components/ui/Aviso";

const BOTAO = "rounded-lg bg-superficie-2 text-texto btn-contorno text-xs font-medium px-3 py-1.5 hover:bg-linha disabled:opacity-50";
const BOTAO_VERDE = "rounded-lg bg-verde text-white text-xs font-medium px-3 py-1.5 hover:bg-verde-escuro disabled:opacity-50";

/** "Visto" em um alerta, ou em todos os abertos. */
export function MarcarAlerta({ id, todos }: { id?: string; todos?: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  async function marcar() {
    setOcupado(true);
    setErro(null);
    const r = await enviarJson("/api/admin/seguranca/alertas", "PATCH", todos ? { todos: true } : { id });
    setOcupado(false);
    if (r.ok) router.refresh(); else setErro(r.erro);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button disabled={ocupado} onClick={marcar} className={BOTAO}>{todos ? "Marcar todos como vistos" : "Visto"}</button>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </span>
  );
}

/** Simular o descarte agora / pôr a rotina na fila do worker. Só a Diretoria vê. */
export function BotoesRetencao({ executar }: { executar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [resultado, setResultado] = useState("");
  async function acionar(acao: "simular" | "agendar") {
    if (acao === "agendar" && executar &&
        !confirm("“Descartar de verdade” está ligado: os arquivos e registros fora do prazo serão apagados sem volta. Continuar?")) return;
    setOcupado(true);
    setErro(null);
    setResultado("");
    const r = await enviarJson<{ selfies?: number; documentos?: number; logs?: Record<string, number> }>(
      "/api/admin/seguranca/retencao", "POST", { acao });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    if (acao === "simular") {
      const logs = Object.values(r.dados.logs ?? {}).reduce((s, n) => s + Number(n), 0);
      setResultado(`Simulação: ${r.dados.selfies ?? 0} selfie(s), ${r.dados.documentos ?? 0} documento(s) e ${logs} registro(s) de acesso passaram do prazo. Nada foi apagado.`);
    } else {
      setResultado(executar ? "Rotina na fila: o worker descarta na próxima rodada." : "Rotina na fila: o worker registra a simulação na próxima rodada.");
    }
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <button disabled={ocupado} onClick={() => acionar("simular")} className={BOTAO}>Simular agora</button>
        <button disabled={ocupado} onClick={() => acionar("agendar")} className={BOTAO}>
          {executar ? "Rodar o descarte agora" : "Rodar a rotina agora (simulação)"}
        </button>
      </div>
      {resultado && <p className="text-xs text-verde">{resultado}</p>}
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}

/** "Marcar revisão concluída", com observações. */
export function ConcluirRevisao() {
  const router = useRouter();
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [feito, setFeito] = useState(false);
  async function concluir() {
    if (!confirm("Confirma que conferiu as três listas e ajustou o que precisava?")) return;
    setOcupado(true);
    setErro(null);
    const r = await enviarJson("/api/admin/seguranca/revisao", "POST", { observacoes: obs });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setFeito(true);
    setObs("");
    router.refresh();
  }
  return (
    <div className="cartao p-4 space-y-3">
      <label className="block text-sm font-medium text-texto" htmlFor="obs-revisao">Observações da revisão</label>
      <textarea id="obs-revisao" rows={3} value={obs} onChange={(e) => setObs(e.target.value)}
        placeholder="Ex.: removido o setor Financeiro da Ana; conta do estagiário desativada; plano manual do cliente X confirmado."
        className="w-full rounded-xl border border-linha bg-superficie-2 px-3.5 py-2.5 text-sm text-texto placeholder:text-texto-2/70 focus:outline-none focus:ring-2 focus:ring-verde" />
      <div className="flex items-center gap-3 flex-wrap">
        <button disabled={ocupado} onClick={concluir} className={BOTAO_VERDE}>Marcar revisão concluída</button>
        {feito && <span className="text-xs text-verde">Revisão registrada.</span>}
      </div>
      {erro && <AvisoErro erro={erro} aoFechar={() => setErro(null)} />}
    </div>
  );
}
