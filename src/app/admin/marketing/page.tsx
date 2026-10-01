import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { formatBRL } from "@/lib/format";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor } from "@/components/admin/Painel";

const ORIGEM: Record<string, string> = { pagina: "Página do imóvel", whatsapp: "WhatsApp", mapa: "Mapa", indicacao: "Indicação" };

/**
 * Marketing: de onde vêm os interessados, o que mais atrai e que material de
 * divulgação cada imóvel já tem (tour, vídeo, link curto).
 */
export default async function PainelMarketing() {
  const user = await exigirSetor("marketing");
  const admin = supabaseAdmin();
  const ha30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ha90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const [{ data: leads }, { data: imoveis }, { data: apresentacoes }] = await Promise.all([
    admin.from("leads").select("property_id, origem, canal, utm, created_at").gte("created_at", ha90),
    admin.from("properties")
      .select("id, codigo, titulo, tipo, valor, published_at, municipality:municipalities(nome), media:property_media(id)")
      .in("status", ["publicado", "em_negociacao"]).order("published_at", { ascending: false }),
    admin.from("presentations").select("property_id, tipo, status"),
  ]);

  const leads30 = (leads ?? []).filter((l) => l.created_at >= ha30);
  const porOrigem = new Map<string, number>();
  const porCampanha = new Map<string, number>();
  const porImovel = new Map<string, number>();
  for (const l of leads ?? []) {
    const utm = (l.utm ?? {}) as Record<string, string>;
    const origem = utm.utm_source || l.canal || l.origem || "direto";
    porOrigem.set(origem, (porOrigem.get(origem) ?? 0) + 1);
    if (utm.utm_campaign) porCampanha.set(utm.utm_campaign, (porCampanha.get(utm.utm_campaign) ?? 0) + 1);
    porImovel.set(l.property_id, (porImovel.get(l.property_id) ?? 0) + 1);
  }
  const maior = Math.max(1, ...porOrigem.values());
  const ordenado = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  const material = new Map<string, { tour: boolean; video: string }>();
  for (const a of apresentacoes ?? []) {
    const m = material.get(a.property_id) ?? { tour: false, video: "—" };
    if (a.tipo === "tour3d" && a.status === "pronto") m.tour = true;
    if (a.tipo === "video") m.video = a.status === "pronto" ? "pronto" : a.status === "erro" ? "falhou" : "na fila";
    material.set(a.property_id, m);
  }

  const lista = (imoveis ?? []).map((p) => ({
    ...p, leads: porImovel.get(p.id) ?? 0, fotos: (p.media as unknown as { id: string }[] | null)?.length ?? 0,
    material: material.get(p.id) ?? { tour: false, video: "—" },
  }));
  const semFoto = lista.filter((p) => p.fotos === 0).length;
  const semProcura = lista.filter((p) => p.leads === 0).length;

  return (
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="marketing">
        <Link href="/admin/configuracoes" className="btn-contorno px-4 py-2 text-sm">Textos do site</Link>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Imóveis no ar", valor: lista.length },
        { rotulo: "Interessados em 30 dias", valor: leads30.length, nota: `${(leads ?? []).length} em 90 dias` },
        { rotulo: "Imóveis sem foto", valor: semFoto, destaque: semFoto > 0 },
        { rotulo: "Sem nenhum interessado em 90 dias", valor: semProcura, destaque: semProcura > 0 && lista.length > 0 },
      ]} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="De onde vieram os interessados (90 dias)">
          <div className="cartao p-4 space-y-2">
            {ordenado(porOrigem).map(([o, n]) => (
              <div key={o} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-texto-2 truncate">{ORIGEM[o] ?? o}</span>
                <span className="h-2 rounded-full bg-superficie-2 overflow-hidden">
                  <span className="block h-full rounded-full bg-ouro" style={{ width: `${(n / maior) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-texto">{n}</span>
              </div>
            ))}
            {!porOrigem.size && <p className="text-sm text-texto-2 text-center py-3">Nenhum interessado no período.</p>}
          </div>
        </Secao>

        <Secao titulo="Campanhas (links com UTM)">
          <div className="cartao p-4 space-y-2 text-sm">
            {ordenado(porCampanha).slice(0, 8).map(([c, n]) => (
              <p key={c} className="flex justify-between gap-3"><span className="text-texto-2 truncate">{c}</span><span className="tabular-nums text-texto">{n}</span></p>
            ))}
            {!porCampanha.size && (
              <p className="text-texto-2">
                Nenhum interessado chegou por link de campanha. Para medir um anúncio, divulgue o link do imóvel com
                <span className="font-mono text-xs"> ?utm_source=instagram&utm_campaign=nome-da-campanha</span> no final.
              </p>
            )}
          </div>
        </Secao>
      </div>

      <Secao titulo="Imóveis no ar e material de divulgação">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3 text-right">Interessados</th>
                <th className="px-4 py-3 text-right">Fotos</th>
                <th className="px-4 py-3">Tour 3D</th>
                <th className="px-4 py-3">Vídeo</th>
                <th className="px-4 py-3">Link para divulgar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {lista.sort((a, b) => b.leads - a.leads).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/imovel/${p.codigo}`} target="_blank" className="text-texto hover:text-verde">{p.titulo}</Link>
                    <span className="block text-xs text-texto-2">
                      {(p.municipality as unknown as { nome: string } | null)?.nome} · {formatBRL(p.valor)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.leads}</td>
                  <td className={"px-4 py-2.5 text-right tabular-nums " + (p.fotos === 0 ? "text-critico" : "")}>{p.fotos}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {p.material.tour
                      ? <Link href={`/imovel/${p.codigo}/tour`} target="_blank" className="text-verde hover:underline">abrir</Link>
                      : <span className="text-texto-2">—</span>}
                  </td>
                  <td className={"px-4 py-2.5 text-xs " + (p.material.video === "pronto" ? "text-verde" : p.material.video === "falhou" ? "text-critico" : "text-texto-2")}>
                    {p.material.video}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-texto-2 select-all">{site}/i/{p.codigo}</td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-texto-2">Nenhum imóvel publicado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-texto-2">
          O vídeo é gerado pelo serviço de vídeo do servidor; “na fila” significa que ele ainda não processou o imóvel.
        </p>
      </Secao>

      <TarefasDoSetor setor="marketing" souEu={user.id} />
    </div>
  );
}
