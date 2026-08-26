import { supabaseAdmin } from "@/lib/supabase/admin";
import AdicionarMunicipio from "./AdicionarMunicipio";

export default async function AdminRegioes() {
  const admin = supabaseAdmin();
  const [{ data: regioes }, { data: municipios }] = await Promise.all([
    admin.from("regions").select("id, nome, ativa").order("nome"),
    admin.from("municipalities").select("id, nome, uf, codigo_ibge, ativo, region:regions(nome)").order("nome"),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-verde-escuro">Regiões e municípios</h1>
        <p className="text-sm text-foreground/60">
          A estrutura já suporta múltiplas regiões (expansão/franquias). A primeira versão opera na região piloto.
        </p>
      </div>

      <section className="rounded-xl border border-linha bg-white p-5 space-y-2">
        <h2 className="font-semibold text-verde-escuro">Regiões</h2>
        {(regioes ?? []).map((r) => (
          <p key={r.id} className="text-sm flex justify-between">
            <span>{r.nome}</span>
            <span className={`text-xs rounded-full px-3 py-0.5 ${r.ativa ? "bg-verde/10 text-verde" : "bg-areia"}`}>{r.ativa ? "ativa" : "inativa"}</span>
          </p>
        ))}
      </section>

      <section className="rounded-xl border border-linha bg-white p-5 space-y-3">
        <h2 className="font-semibold text-verde-escuro">Municípios no mapa</h2>
        <AdicionarMunicipio />
        <div className="divide-y divide-linha">
          {(municipios ?? []).map((m) => (
            <p key={m.id} className="text-sm py-2 flex justify-between gap-3">
              <span>{m.nome} · {m.uf} <span className="font-mono text-xs text-foreground/40">{m.codigo_ibge}</span></span>
              <span className="text-xs text-foreground/50">{(m.region as unknown as { nome: string } | null)?.nome}</span>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
