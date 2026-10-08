import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { Indicadores, dataHoraBR } from "@/components/admin/Painel";
import { Secao } from "@/components/ui/Pagina";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { PAPEL_LABEL } from "@/lib/perfis";
import { SETORES } from "@/lib/setores";
import { PLAN_ORIGEM_LABEL } from "@/lib/planos";
import { carregarRevisao, ultimaRevisao } from "@/lib/seguranca/revisao";
import { haDias, proximaRevisao, revisaoVencida, REVISAO_DIAS } from "@/lib/seguranca/retencao";
import { ConcluirRevisao } from "../AcoesSeguranca";

const nomeSetor = (id: string) => SETORES.find((s) => s.id === id)?.nome ?? id;

/**
 * Revisão trimestral de acessos (item 6.13). A pessoa de Segurança (ou a
 * Diretoria) confere quem está na equipe e com quais setores, quem tem plano
 * fora do padrão e quais parceiros têm território — ajusta o que precisar em
 * Equipe e usuários — e marca a revisão como concluída.
 */
export default async function RevisaoAcessos() {
  await exigirSetor("seguranca", "diretoria");
  const [r, ultima, { data: historico }] = await Promise.all([
    carregarRevisao(),
    ultimaRevisao(),
    supabaseAdmin().from("revisoes_acesso").select("id, revisado_por, observacoes, created_at")
      .order("created_at", { ascending: false }).limit(8),
  ]);
  const ids = [...new Set((historico ?? []).map((h) => h.revisado_por))];
  const { data: nomes } = ids.length
    ? await supabaseAdmin().from("profiles").select("user_id, nome").in("user_id", ids)
    : { data: [] as { user_id: string; nome: string | null }[] };
  const nomePorId = new Map((nomes ?? []).map((n) => [n.user_id, n.nome ?? ""]));

  const proxima = proximaRevisao(ultima?.created_at);
  const atrasada = revisaoVencida(proxima);
  const ha90 = haDias(90);
  const semMfa = r.equipe.filter((m) => m.ativo && !m.mfa).length;
  const parados = r.equipe.filter((m) => m.ativo && (!m.ultimo || m.ultimo < ha90)).length;

  return (
    <div className="mx-auto max-w-[1280px] space-y-10">
      <header className="space-y-4">
        <Link href="/admin/seguranca" className="inline-flex items-center gap-1.5 text-sm font-semibold text-verde hover:underline">
          <ArrowLeft className="size-4" /> Segurança
        </Link>
        <div className="max-w-3xl">
        <p className="lp-eyebrow text-xs">Central · Segurança</p>
        <h1 className="lp-display mt-3 text-3xl md:text-[2.5rem] text-texto text-balance">Revisão de acessos</h1>
        <p className="mt-4 text-base md:text-lg leading-relaxed text-texto-2">
          A cada {REVISAO_DIAS} dias, confira quem acessa o quê. Ajustes de papel, setor e plano são feitos em{" "}
          <Link href="/admin/usuarios" className="font-semibold text-verde hover:underline">Equipe e usuários</Link>; depois marque a revisão como concluída.
        </p>
        </div>
      </header>

      <Indicadores itens={[
        { rotulo: "Última revisão", valor: ultima ? dataHoraBR(ultima.created_at).split(" ")[0] : "nunca", nota: ultima?.nome ?? undefined },
        { rotulo: "Próxima revisão", valor: proxima ? proxima.toLocaleDateString("pt-BR") : "agora", destaque: atrasada },
        { rotulo: "Equipe sem segundo fator", valor: semMfa, destaque: semMfa > 0 },
        { rotulo: "Equipe sem entrar há 90 dias", valor: parados, destaque: parados > 0, nota: "candidatas a desativar" },
      ]} />

      <Secao eyebrow="Lista 1" titulo={`Equipe da Matriz (${r.equipe.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[760px] text-[0.95rem]">
            <thead>
              <tr className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                <th className="px-5 py-3 whitespace-nowrap">Pessoa</th><th className="px-5 py-3 whitespace-nowrap">Papel</th><th className="px-5 py-3 whitespace-nowrap">Setores</th>
                <th className="px-5 py-3 whitespace-nowrap">Último acesso</th><th className="px-5 py-3 whitespace-nowrap">Segundo fator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.equipe.map((m) => (
                <tr key={m.user_id} className={"transition-colors hover:bg-superficie-2/60 " + (m.ativo ? "" : "opacity-60")}>
                  <td className="px-5 py-3.5"><span className="font-semibold text-texto">{m.nome || "—"}</span>
                    <span className="mt-0.5 block text-sm text-texto-2">{m.email}{!m.ativo && " · desativada"}</span></td>
                  <td className="px-5 py-3.5 text-sm">{m.role === "admin_central" ? "Diretoria" : "Equipe"}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{m.role === "admin_central" ? "todos" : m.setores.map(nomeSetor).join(", ") || "nenhum"}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(m.ultimo)}</td>
                  <td className={"px-5 py-3.5 text-sm font-semibold " + (m.mfa ? "text-verde" : "text-alerta")}>
                    <span className="inline-flex items-center gap-1.5">{m.mfa ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}{m.mfa ? "ativo" : "sem"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao eyebrow="Lista 2" titulo={`Contas externas com plano fora do padrão (${r.planosEspeciais.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[760px] text-[0.95rem]">
            <thead>
              <tr className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                <th className="px-5 py-3 whitespace-nowrap">Conta</th><th className="px-5 py-3 whitespace-nowrap">Perfil</th><th className="px-5 py-3 whitespace-nowrap">Plano</th>
                <th className="px-5 py-3 whitespace-nowrap">Origem</th><th className="px-5 py-3 whitespace-nowrap">Válido até</th><th className="px-5 py-3 whitespace-nowrap">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.planosEspeciais.map((p) => (
                <tr key={p.user_id} className="transition-colors hover:bg-superficie-2/60">
                  <td className="px-5 py-3.5"><span className="font-semibold text-texto">{p.nome || "—"}</span><span className="mt-0.5 block text-sm text-texto-2">{p.email}</span></td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{PAPEL_LABEL[p.role] ?? p.role}</td>
                  <td className="px-5 py-3.5 text-sm">{p.plan_id ?? "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{PLAN_ORIGEM_LABEL[p.plan_origem] ?? p.plan_origem}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{p.plan_valido_ate ? new Date(p.plan_valido_ate).toLocaleDateString("pt-BR") : "sem prazo"}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(p.ultimo)}</td>
                </tr>
              ))}
              {!r.planosEspeciais.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-base text-texto-2">Todas as contas externas estão no plano padrão do nicho.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao eyebrow="Lista 3" titulo={`Parceiros com território (${r.parceiros.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[760px] text-[0.95rem]">
            <thead>
              <tr className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                <th className="px-5 py-3 whitespace-nowrap">Parceiro</th><th className="px-5 py-3 whitespace-nowrap">Tipo</th><th className="px-5 py-3 whitespace-nowrap">Território</th>
                <th className="px-5 py-3 whitespace-nowrap">Situação</th><th className="px-5 py-3 whitespace-nowrap">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.parceiros.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-superficie-2/60">
                  <td className="px-5 py-3.5"><span className="font-semibold text-texto">{p.razao_social || p.nome || "—"}</span><span className="mt-0.5 block text-sm text-texto-2">{p.email}</span></td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{PAPEL_LABEL[p.tipo] ?? p.tipo}</td>
                  <td className="px-5 py-3.5 text-sm">{p.regiao ?? "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2">{p.status}</td>
                  <td className="px-5 py-3.5 text-sm text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(p.ultimo)}</td>
                </tr>
              ))}
              {!r.parceiros.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-base text-texto-2">Nenhum parceiro com território definido.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao eyebrow="Registro" titulo="Concluir a revisão">
        <ConcluirRevisao />
        {!!historico?.length && (
          <div className="cartao overflow-hidden divide-y divide-linha">
            {historico.map((h) => (
              <div key={h.id} className="px-5 py-3.5 text-[0.95rem]">
                <span className="font-semibold text-texto tabular-nums">{dataHoraBR(h.created_at)}</span>
                <span className="text-sm text-texto-2"> · {nomePorId.get(h.revisado_por) || "—"}</span>
                {h.observacoes && <p className="text-sm leading-relaxed text-texto-2 mt-1 whitespace-pre-line">{h.observacoes}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="text-sm text-texto-2">As revisões ficam registradas e não podem ser alteradas nem apagadas.</p>
      </Secao>
    </div>
  );
}
