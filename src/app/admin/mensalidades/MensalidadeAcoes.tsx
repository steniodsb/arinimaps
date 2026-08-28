"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function acao(body: unknown) {
  const res = await fetch("/api/admin/mensalidades", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error ?? "Falha."); return null; }
  return data;
}

export default function MensalidadeAcoes() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const wrap = async (body: unknown, msg?: (d: Record<string, unknown>) => string) => {
    setOcupado(true);
    const d = await acao(body);
    setOcupado(false);
    if (d) { if (msg) alert(msg(d)); router.refresh(); }
  };
  return (
    <div className="flex gap-2 flex-wrap">
      <button disabled={ocupado} className="rounded-lg bg-verde text-white text-sm font-medium px-4 py-2 hover:bg-verde-escuro disabled:opacity-50"
        onClick={() => wrap({ acao: "gerar_faturas" }, (d) => `${d.geradas} fatura(s) gerada(s) para o mês atual.`)}>
        Gerar faturas do mês
      </button>
      <button disabled={ocupado} className="rounded-lg bg-alerta text-white text-sm font-medium px-4 py-2 hover:bg-alerta/80 disabled:opacity-50"
        onClick={() => wrap({ acao: "marcar_inadimplentes" }, (d) => `${d.vencidas} fatura(s) marcadas como vencidas.`)}>
        Processar inadimplência
      </button>
    </div>
  );
}

export function FaturaAcoes({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex gap-1">
      <button disabled={ocupado} className="text-xs rounded bg-verde text-white px-2 py-1 disabled:opacity-50"
        onClick={async () => { setOcupado(true); if (await acao({ acao: "marcar_paga", invoice_id: id })) router.refresh(); setOcupado(false); }}>
        Marcar paga
      </button>
      <button disabled={ocupado} className="text-xs rounded bg-superficie-2 border border-linha px-2 py-1 disabled:opacity-50"
        onClick={async () => {
          setOcupado(true);
          const d = await acao({ acao: "cobrar_asaas", invoice_id: id });
          setOcupado(false);
          if (d?.url) window.open(d.url as string, "_blank");
        }}>
        Cobrar via Asaas
      </button>
    </div>
  );
}

export function ValorMensal({ id, valor }: { id: string; valor: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(valor));
  const [ocupado, setOcupado] = useState(false);
  return (
    <span className="flex items-center gap-1">
      <span className="text-texto-2">R$</span>
      <input className="w-24 rounded border border-linha px-2 py-1 text-sm tabular-nums" value={v}
        onChange={(e) => setV(e.target.value)} inputMode="decimal" />
      {Number(v.replace(",", ".")) !== valor && (
        <button disabled={ocupado} className="text-xs rounded bg-verde text-white px-2 py-1 disabled:opacity-50"
          onClick={async () => {
            setOcupado(true);
            if (await acao({ acao: "atualizar_valor", subscription_id: id, valor_mensal: Number(v.replace(",", ".")) })) router.refresh();
            setOcupado(false);
          }}>
          salvar
        </button>
      )}
    </span>
  );
}
