import Link from "next/link";
import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { formatBRL, STATUS_LABEL } from "@/lib/format";

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-superficie-2 text-texto-2",
  pendente: "bg-alerta/15 text-alerta",
  em_analise: "bg-alerta/15 text-alerta",
  correcao: "bg-orange-100 text-orange-900",
  aprovado: "bg-verde/15 text-verde",
  publicado: "bg-verde text-white",
  em_negociacao: "bg-ouro text-texto",
  vendido: "bg-superficie-2 text-texto-2",
  reprovado: "bg-critico/15 text-critico",
};

export default async function MeusImoveis() {
  const supabase = await supabaseServer();
  const user = await currentUser();

  // RLS garante que só vêm os imóveis do usuário
  const { data: imoveis } = await supabase
    .from("properties")
    .select("id, codigo, titulo, tipo, status, valor, motivo_correcao, created_at")
    .not("status", "in", '("publicado","em_negociacao","vendido","historico")')
    .order("created_at", { ascending: false });

  const { data: publicados } = await supabase
    .from("properties")
    .select("id, codigo, titulo, tipo, status, valor, motivo_correcao, created_at")
    .in("status", ["publicado", "em_negociacao", "vendido"])
    .order("created_at", { ascending: false });

  // cadastro (owner/partner) ainda em análise?
  const { data: owner } = await supabase.from("owners").select("status").maybeSingle();
  const { data: partner } = await supabase.from("partners").select("status").maybeSingle();
  const statusCadastro = owner?.status ?? partner?.status;
  const aguardando = statusCadastro && !["aprovado", "ativo"].includes(statusCadastro);

  const meus = [...(imoveis ?? []), ...(publicados ?? [])];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-texto">Meus imóveis</h1>
          <p className="text-texto-2 text-sm">Olá, {user?.nome}. Acompanhe seus anúncios e o status de análise.</p>
        </div>
        <Link href="/painel/novo"
          className="rounded-lg bg-verde text-white font-medium px-4 py-2 hover:bg-verde-escuro">
          + Anunciar imóvel
        </Link>
      </div>

      {aguardando && (
        <div className="rounded-xl border border-alerta/40 bg-alerta/10 text-alerta px-4 py-3 text-sm">
          Seu cadastro está <strong>{STATUS_LABEL[statusCadastro!] ?? statusCadastro}</strong> na análise da Arini.
          Você poderá anunciar assim que for aprovado.
        </div>
      )}

      {meus.length === 0 ? (
        <div className="cartao p-10 text-center text-texto-2">
          Nenhum imóvel ainda. Clique em <strong>Anunciar imóvel</strong> para começar.
        </div>
      ) : (
        <div className="cartao divide-y divide-linha">
          {meus.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <span className="font-mono text-xs text-texto-2">{p.codigo}</span>
              <Link href={`/painel/imoveis/${p.id}`} className="font-medium flex-1 min-w-40 hover:text-verde">
                {p.titulo}
              </Link>
              <span className="text-sm text-texto-2">{formatBRL(p.valor)}</span>
              <span className={`text-xs rounded-full px-3 py-1 ${STATUS_COR[p.status] ?? "bg-superficie-2"}`}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              {p.motivo_correcao && (
                <p className="w-full text-xs text-orange-800 bg-orange-50 rounded px-2 py-1">
                  Correção solicitada: {p.motivo_correcao}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
