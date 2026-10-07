import Link from "next/link";
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
  const chip = "rounded-full border px-3 py-1 text-xs transition ";

  return (
    <div className="space-y-6 max-w-5xl">
      <CabecalhoSetor setor="suporte">
        <Link href="/suporte" target="_blank" className="btn-contorno px-4 py-2 text-sm">Ver a página pública</Link>
      </CabecalhoSetor>

      <Indicadores itens={[
        { rotulo: "Esperando a equipe", valor: abertos, destaque: abertos > 0 },
        { rotulo: "Sem responsável", valor: semDono, destaque: semDono > 0 },
        { rotulo: "Aguardando o cliente", valor: aguardando },
        { rotulo: "Resolvidos em 7 dias", valor: resolvidos7 },
      ]} />

      <div className="flex flex-wrap gap-2">
        {[["ativos", "Em aberto"], ["meus", "Comigo"], ["aguardando_cliente", "Aguardando cliente"], ["resolvido", "Resolvidos"], ["todos", "Todos"]].map(([v, l]) => (
          <Link key={v} href={`/admin/suporte?situacao=${v}`}
            className={chip + (filtro === v ? "border-verde bg-verde/10 text-verde" : "border-linha text-texto-2 hover:text-texto")}>{l}</Link>
        ))}
      </div>

      <div className="cartao divide-y divide-linha">
        {(chamados ?? []).map((c) => (
          <Link key={c.id} href={`/admin/suporte/${c.id}`}
            className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-superficie-2 transition">
            <span className="font-mono text-xs text-texto-2">{c.codigo}</span>
            <span className="flex-1 min-w-52">
              <span className="text-texto">
                {c.prioridade === "alta" && <span className="text-critico">● </span>}{c.assunto}
                {novaMsg.has(c.id) && <span className="ml-2 text-[10px] rounded-full bg-ouro/15 text-ouro px-2 py-0.5">nova mensagem do cliente</span>}
              </span>
              <span className="block text-xs text-texto-2">
                {c.nome} · {CATEGORIA[c.categoria] ?? c.categoria} · {c.responsavel ? nome.get(c.responsavel) ?? "equipe" : "sem responsável"}
              </span>
            </span>
            <span className={"text-xs rounded-full px-3 py-1 " +
              (c.status === "aberto" ? "bg-ouro/15 text-ouro" : c.status === "resolvido" ? "bg-verde/10 text-verde" : "bg-superficie-2 text-texto-2")}>
              {SITUACAO[c.status]}
            </span>
            <span className="text-xs text-texto-2 tabular-nums">{dataHoraBR(c.updated_at)}</span>
          </Link>
        ))}
        {!chamados?.length && <p className="px-4 py-8 text-center text-sm text-texto-2">Nenhum chamado neste filtro.</p>}
      </div>

      <TarefasDoSetor setor="suporte" souEu={user.id} />
    </div>
  );
}
