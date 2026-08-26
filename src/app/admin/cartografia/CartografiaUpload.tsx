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
  const [erro, setErro] = useState("");

  const input = "rounded-lg border border-linha bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-linha bg-white p-5 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Nome da camada (ex.: Planta urbana — Iturama)"
          value={nome} onChange={(e) => setNome(e.target.value)} />
        <select className={input} value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
          <option value="">Município…</option>
          {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </div>
      <input type="file" accept=".dxf,.tif,.tiff,.png,.jpg,.jpeg" className={input + " w-full"}
        onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setErro(""); setMsg(""); }} />
      <p className="text-xs text-foreground/50">
        DXF (planta CAD) publica na hora · GeoTIFF/PNG/JPG georreferenciado vira tiles pelo worker.
      </p>

      {msg && <p className="text-sm text-verde">{msg}</p>}
      {erro && <p className="text-sm text-red-700">{erro}</p>}

      <button disabled={ocupado || !nome || !municipio || !arquivo}
        className="btn-ouro px-6 py-2.5 disabled:opacity-50"
        onClick={async () => {
          setOcupado(true);
          setErro("");
          setMsg("Enviando e convertendo… plantas grandes levam um minuto.");
          const fd = new FormData();
          fd.set("nome", nome);
          fd.set("municipality_id", municipio);
          fd.set("arquivo", arquivo!);
          const res = await fetch("/api/admin/cartografia", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          setOcupado(false);
          if (res.ok) {
            setMsg(data.mensagem ?? "Camada publicada.");
            setNome(""); setArquivo(null);
            router.refresh();
          } else {
            setMsg("");
            setErro(data.error ?? "Falha no envio.");
          }
        }}>
        {ocupado ? "Processando…" : "Publicar camada"}
      </button>
    </div>
  );
}
