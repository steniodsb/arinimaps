import { supabaseAdmin } from "@/lib/supabase/admin";
import ConfiguracoesForm from "./ConfiguracoesForm";

export default async function AdminConfiguracoes() {
  const { data } = await supabaseAdmin().from("settings").select("chave, valor");
  const cfg = Object.fromEntries((data ?? []).map((s) => [s.chave, s.valor]));

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-verde-escuro">Configurações</h1>
        <p className="text-sm text-foreground/60">Regras comerciais e operacionais da plataforma. Só a diretoria salva.</p>
      </div>
      <ConfiguracoesForm inicial={{
        mensalidade_valor_padrao: String(cfg.mensalidade_valor_padrao ?? "0"),
        comissao_percentual_padrao: String(cfg.comissao_percentual_padrao ?? "1"),
        notify_email: typeof cfg.notify_email === "string" ? cfg.notify_email : "",
        suspensao_dias: String(cfg.suspensao_dias ?? "15"),
        poi_raio_rural_m: String(cfg.poi_raio_rural_m ?? "15000"),
        poi_raio_urbano_m: String(cfg.poi_raio_urbano_m ?? "4000"),
      }} />
    </div>
  );
}
