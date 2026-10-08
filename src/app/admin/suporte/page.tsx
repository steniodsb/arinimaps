import Link from "next/link";
import { ExternalLink, Flag, LifeBuoy, MessageCircle } from "lucide-react";
import { Etiqueta, Vazio } from "@/components/ui/Pagina";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { chamadosEsperandoEquipe } from "@/lib/suporte";
import { CabecalhoSetor, Indicadores, TarefasDoSetor, contar, dataHoraBR, equipeAtiva } from "@/components/admin/Painel";

const CATEGORIA: Record<string, string> = {
  duvida: "Dúvida", problema: "Problema no sistema", anuncio: "Meu anúncio", financeiro: "Cobrança",
  dados_pessoais: "Dados pessoais", outro: "Outro",
};
const SITUACAO: Record<string, string> = {
  aberto: "Aberto", em_atendimento: "Em atendimento", aguardando_cliente: "Aguardando cliente", resolvido: "Resolvido",
};

/** Suporte: a fila de chamados de usuários e visitantes. */
export default async function AdminSuporte({ searchParams }: PageProps<"/admin/suporte">) {
  const user = await exigirSetor("suporte");
  const sp = await searchParams;
  const filtro = typeof sp.situacao === "string" ? sp.situacao : "ativos";
  const admin = supabaseAdmin();

  let q = admin.from("support_tickets")
    .select("id, codigo, nome, email, categoria, assunto, status, prioridade, responsavel, created_at, updated_at")
    .order("updated_at", { ascending: false }).limit(150);
  if (filtro === "ativos") q = q.neq("status", "resolvido");
  else if (filtro === "meus") q = q.eq("responsavel", user.id).neq("status", "resolvido");
  else if (filtro !== "todos") q = q.eq("status", filtro);

  const semana = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: chamados }, equipe, abertos, aguardando, resolvidos7, semDono, esperando] = await Promise.all([
    q, equipeAtiva(),
    contar("support_tickets", (x) => x.in("status", ["aberto", "em_atendimento"])),
    contar("support_tickets", (x) => x.eq("status", "aguardando_cliente")),
    contar("support_tickets", (x) => x.eq("status", "resolvido").gte("resolvido_em", semana)),
    contar("support_tickets", (x) => x.is("responsavel", null).neq("status", "resolvido")),
    chamadosEsperandoEquipe(),
  ]);
  const novaMsg = new Set(esperando);
  const nome = new Map(equipe.map((m) => [m.user_id, m.nome]));
  const chip = "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ";

  return (
    <div className="mx-auto max-w-[1280px] space-y-10">
      <CabecalhoSetor setor="suporte">
        <Link href="/suporte" target="_blank" className="btn-contorno inline-flex items-center gap-2 px-4 py-2.5 text-sm">
          <ExternalLink className="size-4" /> Ver a página pública
        </Link>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Esperando a equipe", valor: abertos, destaque: abertos > 0 },
        { rotulo: "Sem responsável", valor: semDono, destaque: semDono > 0 },
        { rotulo: "Aguardando o cliente", valor: aguardando },
        { rotulo: "Resolvidos em 7 dias", valor: resolvidos7 },
      ]} />

      <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="lp-eyebrow text-xs">Fila</p>
          <h2 className="lp-display mt-2 text-2xl md:text-[1.75rem] text-texto">Chamados</h2>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[["ativos", "Em aberto"], ["meus", "Comigo"], ["aguardando_cliente", "Aguardando cliente"], ["resolvido", "Resolvidos"], ["todos", "Todos"]].map(([v, l]) => (
          <Link key={v} href={`/admin/suporte?situacao=${v}`}
            className={chip + (filtro === v ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2 hover:text-texto")}>{l}</Link>
        ))}
      </div>

      {chamados?.length ? (
      <div className="cartao overflow-hidden divide-y divide-linha">
        {chamados.map((c) => (
          <Link key={c.id} href={`/admin/suporte/${c.id}`}
            className="px-5 py-3.5 flex items-center gap-4 flex-wrap text-[0.95rem] hover:bg-superficie-2/70 transition-colors">
            <span className="font-mono text-sm text-texto-2 w-24 shrink-0">{c.codigo}</span>
            <span className="flex-1 min-w-52">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-texto">
                {c.prioridade === "alta" && <Flag className="size-4 shrink-0 text-critico" aria-label="Prioridade alta" />}{c.assunto}
                {novaMsg.has(c.id) && <Etiqueta tom="ouro"><MessageCircle className="size-3.5" /> nova mensagem do cliente</Etiqueta>}
              </span>
              <span className="mt-0.5 block text-sm text-texto-2">
                {c.nome} · {CATEGORIA[c.categoria] ?? c.categoria} · {c.responsavel ? nome.get(c.responsavel) ?? "equipe" : "sem responsável"}
              </span>
            </span>
            <Etiqueta tom={c.status === "aberto" ? "ouro" : c.status === "resolvido" ? "verde" : "neutro"}>
              {SITUACAO[c.status]}
            </Etiqueta>
            <span className="text-sm text-texto-2 tabular-nums">{dataHoraBR(c.updated_at)}</span>
          </Link>
        ))}
      </div>
      ) : (
        <Vazio icone={LifeBuoy} titulo="Nenhum chamado neste filtro." texto="Troque o filtro acima para ver outros chamados." />
      )}
      </section>

      <TarefasDoSetor setor="suporte" souEu={user.id} />
    </div>
  );
}
