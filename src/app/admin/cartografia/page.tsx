import { supabaseAdmin } from "@/lib/supabase/admin";
import CartografiaUpload from "./CartografiaUpload";

const STATUS: Record<string, string> = {
  pendente: "Enviado — aguardando processamento", processando: "Processando tiles…",
  pronto: "No ar (camada ativa no mapa)", erro: "Erro no processamento",
};

export default async function AdminCartografia() {
  const admin = supabaseAdmin();
  const [{ data: camadas }, { data: municipios }] = await Promise.all([
    admin.from("cartography_layers")
      .select("id, nome, status, erro, created_at, municipality:municipalities(nome)")
      .order("created_at", { ascending: false }),
    admin.from("municipalities").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-verde-escuro">Cartografia urbana</h1>
        <p className="text-sm text-foreground/60">
          Suba a imagem georreferenciada da cidade (GeoTIFF de preferência). O processamento em tiles roda no
          worker do servidor; quando pronto, a camada aparece sobre o mapa com opacidade ajustável.
          Arquivos DWG devem ser convertidos antes (ver pendências no README).
        </p>
      </div>

      <CartografiaUpload municipios={municipios ?? []} />

      <section className="rounded-xl border border-linha bg-white divide-y divide-linha">
        {(camadas ?? []).map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3 text-sm">
            <div className="flex-1">
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-foreground/50">{(c.municipality as unknown as { nome: string } | null)?.nome}</p>
            </div>
            <span className={`text-xs rounded-full px-3 py-1 ${c.status === "pronto" ? "bg-verde/10 text-verde" : c.status === "erro" ? "bg-red-100 text-red-800" : "bg-areia"}`}>
              {STATUS[c.status]}
            </span>
          </div>
        ))}
        {!camadas?.length && <p className="px-4 py-8 text-center text-sm text-foreground/50">Nenhuma camada enviada ainda.</p>}
      </section>
    </div>
  );
}
