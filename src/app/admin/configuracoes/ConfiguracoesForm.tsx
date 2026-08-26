"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Cfg = {
  mensalidade_valor_padrao: string;
  comissao_percentual_padrao: string;
  notify_email: string;
  suspensao_dias: string;
  poi_raio_rural_m: string;
  poi_raio_urbano_m: string;
};

const CAMPOS: { chave: keyof Cfg; label: string; ajuda: string }[] = [
  { chave: "mensalidade_valor_padrao", label: "Mensalidade padrão do anúncio (R$)", ajuda: "Aplicada a cada imóvel ao ser publicado. 0 = grátis por enquanto." },
  { chave: "comissao_percentual_padrao", label: "Comissão padrão (%)", ajuda: "Sugerida ao registrar a venda (editável caso a caso)." },
  { chave: "notify_email", label: "E-mail da central Arini", ajuda: "Recebe avisos de novos leads e vendas." },
  { chave: "suspensao_dias", label: "Dias de atraso para inadimplência", ajuda: "Usado pelo botão 'Processar inadimplência'." },
  { chave: "poi_raio_rural_m", label: "Raio de POIs — rural (metros)", ajuda: "Busca de pontos de interesse ao redor de imóveis rurais." },
  { chave: "poi_raio_urbano_m", label: "Raio de POIs — urbano (metros)", ajuda: "Busca de pontos de interesse ao redor de imóveis urbanos." },
];

export default function ConfiguracoesForm({ inicial }: { inicial: Cfg }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  return (
    <div className="rounded-xl border border-linha bg-white p-5 space-y-4">
      {CAMPOS.map((c) => (
        <div key={c.chave}>
          <label className="block text-sm font-medium text-verde-escuro mb-1">{c.label}</label>
          <input className="w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde"
            value={cfg[c.chave]} onChange={(e) => setCfg({ ...cfg, [c.chave]: e.target.value })} />
          <p className="text-xs text-foreground/50 mt-0.5">{c.ajuda}</p>
        </div>
      ))}
      {msg && <p className="text-sm text-verde">{msg}</p>}
      <button disabled={ocupado}
        className="rounded-lg bg-verde text-white font-medium px-5 py-2 hover:bg-verde-escuro disabled:opacity-50"
        onClick={async () => {
          setOcupado(true);
          setMsg("");
          const body = {
            mensalidade_valor_padrao: Number(cfg.mensalidade_valor_padrao.replace(",", ".")) || 0,
            comissao_percentual_padrao: Number(cfg.comissao_percentual_padrao.replace(",", ".")) || 1,
            notify_email: cfg.notify_email.trim() || null,
            suspensao_dias: Number(cfg.suspensao_dias) || 15,
            poi_raio_rural_m: Number(cfg.poi_raio_rural_m) || 15000,
            poi_raio_urbano_m: Number(cfg.poi_raio_urbano_m) || 4000,
          };
          const res = await fetch("/api/admin/configuracoes", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          setOcupado(false);
          if (res.ok) { setMsg("Configurações salvas."); router.refresh(); }
          else setMsg((await res.json()).error ?? "Falha ao salvar.");
        }}>
        Salvar
      </button>
    </div>
  );
}
