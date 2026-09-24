import { supabaseAdmin } from "@/lib/supabase/admin";
import AdicionarMunicipio from "./AdicionarMunicipio";
import ConfereSatelite from "./ConfereSatelite";
import AtualizarCar from "./AtualizarCar";

export default async function AdminRegioes() {
  const admin = supabaseAdmin();
  const [{ data: regioes }, { data: municipios }, { data: car }] = await Promise.all([
    admin.from("regions").select("id, nome, ativa").order("nome"),
    admin.from("municipalities").select("id, nome, uf, codigo_ibge, ativo, region:regions(nome)").order("nome"),
    admin.rpc("fn_car_resumo"),
  ]);
  const carPorIbge = new Map(
    ((car ?? []) as { codigo_ibge: string; imoveis: number; importado_em: string | null }[])
      .map((c) => [String(c.codigo_ibge), c])
  );
  const ultimaImportacao = [...carPorIbge.values()]
    .map((c) => c.importado_em).filter(Boolean).sort().pop();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Regiões e municípios</h1>
        <p className="text-sm text-texto-2">
          A estrutura já suporta múltiplas regiões (expansão/franquias). A primeira versão opera na região piloto.
        </p>
      </div>

      <section className="cartao p-5 space-y-2">
        <h2 className="font-semibold text-texto">Regiões</h2>
        {(regioes ?? []).map((r) => (
          <p key={r.id} className="text-sm flex justify-between">
            <span>{r.nome}</span>
            <span className={`text-xs rounded-full px-3 py-0.5 ${r.ativa ? "bg-verde/10 text-verde" : "bg-superficie-2"}`}>{r.ativa ? "ativa" : "inativa"}</span>
          </p>
        ))}
      </section>

      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Municípios no mapa</h2>
        <AdicionarMunicipio />
        <div className="divide-y divide-linha">
          {(municipios ?? []).map((m) => (
            <p key={m.id} className="text-sm py-2 flex justify-between gap-3">
              <span>{m.nome} · {m.uf} <span className="font-mono text-xs text-texto-2">{m.codigo_ibge}</span></span>
              <span className="text-xs text-texto-2">
                {(carPorIbge.get(String(m.codigo_ibge))?.imoveis ?? 0).toLocaleString("pt-BR")} imóveis no CAR
                {" · "}{(m.region as unknown as { nome: string } | null)?.nome}
              </span>
            </p>
          ))}
        </div>
      </section>

      <section className="cartao p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-texto">Imóveis rurais do CAR</h2>
          <p className="text-sm text-texto-2">
            A malha do SICAR aparece no mapa para o proprietário clicar na área dele e anunciar. Ela é
            copiada para o sistema (o mapa não depende do SICAR estar no ar) e atualizada por este botão —
            vale rodar uma vez por mês. Município novo já entra com o CAR.
            {ultimaImportacao && <> Última atualização: {new Date(ultimaImportacao).toLocaleString("pt-BR")}.</>}
          </p>
        </div>
        <AtualizarCar />
      </section>

      <ConfereSatelite />
    </div>
  );
}
