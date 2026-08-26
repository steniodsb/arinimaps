"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CartografiaUpload({ municipios }: { municipios: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const input = "rounded-lg border border-linha bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-xl border border-linha bg-white p-5 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Nome da camada (ex.: Limeira do Oeste 2026)"
          value={nome} onChange={(e) => setNome(e.target.value)} />
        <select className={input} value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
          <option value="">Município…</option>
          {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>
      <input type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" className={input + " w-full"}
        onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      {msg && <p className="text-sm text-verde">{msg}</p>}
      <button disabled={ocupado || !nome || !municipio || !arquivo}
        className="rounded-lg bg-verde text-white font-medium px-5 py-2 hover:bg-verde-escuro disabled:opacity-50"
        onClick={async () => {
          setOcupado(true);
          setMsg("Enviando… (arquivos grandes podem demorar)");
          const fd = new FormData();
          fd.set("nome", nome);
          fd.set("municipality_id", municipio);
          fd.set("arquivo", arquivo!);
          const res = await fetch("/api/admin/cartografia", { method: "POST", body: fd });
          const data = await res.json();
          setOcupado(false);
          if (res.ok) { setMsg("Camada enviada — o worker vai processar os tiles."); setNome(""); setArquivo(null); router.refresh(); }
          else setMsg(data.error ?? "Falha no envio.");
        }}>
        {ocupado ? "Enviando…" : "Enviar camada"}
      </button>
    </div>
  );
}
