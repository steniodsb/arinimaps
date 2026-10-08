import { supabaseAdmin } from "@/lib/supabase/admin";
import { STATUS_LABEL } from "@/lib/format";
import CadastroBotoes from "./CadastroBotoes";
import TerritorioParceiro from "./TerritorioParceiro";
import { PAPEL_LABEL } from "@/lib/perfis";
import { exigirSetor } from "@/lib/setores-servidor";
import { LISTA } from "@/components/admin/estilos";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/Pagina";
import { Phone } from "lucide-react";

export default async function AdminCadastros() {
  await exigirSetor("operacoes");
  const admin = supabaseAdmin();
  const [{ data: partners }, { data: owners }, { data: regioes }] = await Promise.all([
    admin.from("partners")
      .select("id, tipo, razao_social, registro_profissional, status, region_id, created_at, profile:profiles(nome, telefone)")
      .order("created_at", { ascending: false }),
    admin.from("owners")
      .select("id, status, created_at, profile:profiles(nome, telefone)")
      .order("created_at", { ascending: false }),
    admin.from("regions").select("id, nome").order("nome"),
  ]);

  const Bloco = ({
    titulo, itens, alvo,
  }: {
    titulo: string;
    alvo: "partner" | "owner";
    itens: { id: string; status: string; extra?: string; nome: string; telefone: string | null; tipo?: string; region_id?: string | null }[];
  }) => (
    <section className="space-y-4">
      <h2 className="lp-display text-xl md:text-2xl text-texto">
        {titulo} <span className="ml-1 align-middle text-base font-semibold text-texto-2 tabular-nums">{itens.length}</span>
      </h2>
      {!itens.length ? (
        <p className="cartao px-5 py-8 text-center text-[0.95rem] text-texto-2">Nenhum cadastro.</p>
      ) : (
        <div className={LISTA}>
          {itens.map((i) => (
            <div key={i.id} className="flex items-center gap-4 flex-wrap px-5 py-4 transition-colors hover:bg-superficie-2/70">
              <div className="flex-1 min-w-48">
                <p className="font-semibold text-texto">{i.nome}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-texto-2">
                  <span>{i.extra}</span>
                  {i.telefone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{i.telefone}</span>}
                </p>
              </div>
              <Etiqueta tom={["aprovado", "ativo"].includes(i.status) ? "verde" : ["solicitado", "em_analise"].includes(i.status) ? "ouro" : ["reprovado", "suspenso"].includes(i.status) ? "critico" : "neutro"}>
                {STATUS_LABEL[i.status] ?? i.status}
              </Etiqueta>
              {alvo === "partner" && ["aprovado", "ativo"].includes(i.status) && (
                <TerritorioParceiro id={i.id} tipo={i.tipo ?? ""} regionId={i.region_id ?? ""} regioes={regioes ?? []} />
              )}
              <CadastroBotoes alvo={alvo} id={i.id} status={i.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-10 md:space-y-12 max-w-5xl">
      <CabecalhoPagina eyebrow="Operações" titulo="Cadastros"
        subtitulo="Aprovação de parceiros e proprietários, e território de cada franqueado." />
      <Bloco
        titulo="Parceiros (imobiliárias, corretores, engenheiros, leiloeiros e franqueados)"
        alvo="partner"
        itens={(partners ?? []).map((p) => ({
          id: p.id,
          status: p.status,
          nome: (p.profile as unknown as { nome: string } | null)?.nome ?? p.razao_social ?? "—",
          telefone: (p.profile as unknown as { telefone: string | null } | null)?.telefone ?? null,
          extra: `${PAPEL_LABEL[p.tipo] ?? p.tipo}${p.registro_profissional ? ` · ${p.registro_profissional}` : ""}`,
          tipo: p.tipo, region_id: p.region_id,
        }))}
      />
      <Bloco
        titulo="Proprietários"
        alvo="owner"
        itens={(owners ?? []).map((o) => ({
          id: o.id,
          status: o.status,
          nome: (o.profile as unknown as { nome: string } | null)?.nome ?? "—",
          telefone: (o.profile as unknown as { telefone: string | null } | null)?.telefone ?? null,
          extra: "proprietário",
        }))}
      />
    </div>
  );
}
