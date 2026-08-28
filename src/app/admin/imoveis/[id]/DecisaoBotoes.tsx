"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACOES: { acao: string; label: string; classe: string; pedirMotivo?: boolean }[] = [
  { acao: "em_analise", label: "Iniciar análise", classe: "bg-superficie-2 hover:bg-linha" },
  { acao: "aprovado", label: "Aprovar", classe: "bg-verde text-fundo hover:bg-verde/80" },
  { acao: "publicado", label: "Publicar no mapa", classe: "bg-verde text-white hover:bg-verde-escuro" },
  { acao: "correcao", label: "Pedir correção", classe: "bg-alerta text-white hover:bg-alerta/80", pedirMotivo: true },
  { acao: "reprovado", label: "Reprovar", classe: "bg-critico text-fundo hover:bg-critico/80", pedirMotivo: true },
  { acao: "suspenso", label: "Suspender", classe: "bg-superficie-2 text-texto border border-linha hover:bg-linha" },
];

export default function DecisaoBotoes({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function decidir(acao: string, pedirMotivo?: boolean) {
    let motivo: string | null = null;
    if (pedirMotivo) {
      motivo = prompt("Motivo (o anunciante vai ver):");
      if (motivo === null) return;
    }
    setOcupado(true);
    setErro("");
    const res = await fetch("/api/admin/decisao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvo: "imovel", id: propertyId, acao, motivo }),
    });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) {
      setErro(data.error ?? "Falha ao aplicar a decisão.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {ACOES.map((a) => (
          <button key={a.acao} disabled={ocupado}
            onClick={() => decidir(a.acao, a.pedirMotivo)}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${a.classe}`}>
            {a.label}
          </button>
        ))}
      </div>
      {erro && <p className="text-sm text-critico">{erro}</p>}
      <p className="text-xs text-texto-2">
        Transições inválidas são bloqueadas pelo banco (máquina de estados).
      </p>
    </div>
  );
}
