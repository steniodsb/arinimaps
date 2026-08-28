import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function contar(tabela: string, filtro?: { coluna: string; valores: string[] }) {
  const admin = supabaseAdmin();
  let q = admin.from(tabela).select("id", { count: "exact", head: true });
  if (filtro) q = q.in(filtro.coluna, filtro.valores);
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminDashboard() {
  const [pendentes, publicados, vendidos, leadsNovos, cadastrosPendentes] = await Promise.all([
    contar("properties", { coluna: "status", valores: ["pendente", "em_analise", "correcao"] }),
    contar("properties", { coluna: "status", valores: ["publicado", "em_negociacao"] }),
    contar("properties", { coluna: "status", valores: ["vendido"] }),
    contar("opportunities", { coluna: "etapa", valores: ["novo_lead"] }),
    contar("partners", { coluna: "status", valores: ["solicitado", "em_analise"] }),
  ]);

  const cards = [
    { label: "Imóveis aguardando análise", valor: pendentes, href: "/admin/imoveis?filtro=analise", destaque: pendentes > 0 },
    { label: "Publicados no mapa", valor: publicados, href: "/admin/imoveis?filtro=ativos" },
    { label: "Vendidos", valor: vendidos, href: "/admin/imoveis?filtro=vendidos" },
    { label: "Leads novos", valor: leadsNovos, href: "/admin/leads", destaque: leadsNovos > 0 },
    { label: "Cadastros para aprovar", valor: cadastrosPendentes, href: "/admin/cadastros", destaque: cadastrosPendentes > 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-texto">Central Arini</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}
            className={`rounded-xl border p-5 hover:shadow transition ${c.destaque ? "border-ouro bg-ouro/10" : "border-linha bg-superficie"}`}>
            <p className="text-3xl font-semibold text-texto tabular-nums">{c.valor}</p>
            <p className="text-sm text-texto-2 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>
      <p className="text-sm text-texto-2">
        Fluxo: cadastro → análise → publicação no mapa → lead → intermediação Arini → venda → comissão.
      </p>
    </div>
  );
}
