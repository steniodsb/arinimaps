import { supabaseAdmin } from "@/lib/supabase/admin";
import { STATUS_LABEL } from "@/lib/format";
import CadastroBotoes from "./CadastroBotoes";

export default async function AdminCadastros() {
  const admin = supabaseAdmin();
  const [{ data: partners }, { data: owners }] = await Promise.all([
    admin.from("partners")
      .select("id, tipo, razao_social, registro_profissional, status, created_at, profile:profiles(nome, telefone)")
      .order("created_at", { ascending: false }),
    admin.from("owners")
      .select("id, status, created_at, profile:profiles(nome, telefone)")
      .order("created_at", { ascending: false }),
  ]);

  const Bloco = ({
    titulo, itens, alvo,
  }: {
    titulo: string;
    alvo: "partner" | "owner";
    itens: { id: string; status: string; extra?: string; nome: string; telefone: string | null }[];
  }) => (
    <section className="space-y-3">
      <h2 className="font-semibold text-texto">{titulo}</h2>
      {!itens.length ? (
        <p className="text-sm text-texto-2">Nenhum cadastro.</p>
      ) : (
        <div className="cartao divide-y divide-linha">
          {itens.map((i) => (
            <div key={i.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-48">
                <p className="font-medium">{i.nome}</p>
                <p className="text-xs text-texto-2">{i.extra} {i.telefone && `· 📞 ${i.telefone}`}</p>
              </div>
              <span className="text-xs rounded-full bg-superficie-2 px-3 py-1">{STATUS_LABEL[i.status] ?? i.status}</span>
              <CadastroBotoes alvo={alvo} id={i.id} status={i.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-texto">Cadastros</h1>
      <Bloco
        titulo="Parceiros (imobiliárias, corretores, engenheiros)"
        alvo="partner"
        itens={(partners ?? []).map((p) => ({
          id: p.id,
          status: p.status,
          nome: (p.profile as unknown as { nome: string } | null)?.nome ?? p.razao_social ?? "—",
          telefone: (p.profile as unknown as { telefone: string | null } | null)?.telefone ?? null,
          extra: `${p.tipo}${p.registro_profissional ? ` · ${p.registro_profissional}` : ""}`,
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
