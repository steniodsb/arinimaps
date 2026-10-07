import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { Indicadores, Secao, dataHoraBR } from "@/components/admin/Painel";
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
    <div className="space-y-7 max-w-5xl">
      <div>
        <Link href="/admin/seguranca" className="text-xs text-texto-2 hover:text-verde">← Segurança</Link>
        <h1 className="text-2xl font-semibold text-texto mt-1">Revisão de acessos</h1>
        <p className="text-sm text-texto-2 max-w-2xl">
          A cada {REVISAO_DIAS} dias, confira quem acessa o quê. Ajustes de papel, setor e plano são feitos em{" "}
          <Link href="/admin/usuarios" className="text-verde hover:underline">Equipe e usuários</Link>; depois marque a revisão como concluída.
        </p>
      </div>

      <Indicadores itens={[
        { rotulo: "Última revisão", valor: ultima ? dataHoraBR(ultima.created_at).split(" ")[0] : "nunca", nota: ultima?.nome ?? undefined },
        { rotulo: "Próxima revisão", valor: proxima ? proxima.toLocaleDateString("pt-BR") : "agora", destaque: atrasada },
        { rotulo: "Equipe sem segundo fator", valor: semMfa, destaque: semMfa > 0 },
        { rotulo: "Equipe sem entrar há 90 dias", valor: parados, destaque: parados > 0, nota: "candidatas a desativar" },
      ]} />

      <Secao titulo={`Equipe da Matriz (${r.equipe.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Pessoa</th><th className="px-4 py-3">Papel</th><th className="px-4 py-3">Setores</th>
                <th className="px-4 py-3">Último acesso</th><th className="px-4 py-3">Segundo fator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.equipe.map((m) => (
                <tr key={m.user_id} className={m.ativo ? "" : "opacity-60"}>
                  <td className="px-4 py-2"><span className="text-texto">{m.nome || "—"}</span>
                    <span className="block text-xs text-texto-2">{m.email}{!m.ativo && " · desativada"}</span></td>
                  <td className="px-4 py-2 text-xs">{m.role === "admin_central" ? "Diretoria" : "Equipe"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{m.role === "admin_central" ? "todos" : m.setores.map(nomeSetor).join(", ") || "nenhum"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(m.ultimo)}</td>
                  <td className={"px-4 py-2 text-xs " + (m.mfa ? "text-verde" : "text-alerta")}>{m.mfa ? "ativo" : "sem"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo={`Contas externas com plano fora do padrão (${r.planosEspeciais.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Conta</th><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Origem</th><th className="px-4 py-3">Válido até</th><th className="px-4 py-3">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.planosEspeciais.map((p) => (
                <tr key={p.user_id}>
                  <td className="px-4 py-2"><span className="text-texto">{p.nome || "—"}</span><span className="block text-xs text-texto-2">{p.email}</span></td>
                  <td className="px-4 py-2 text-xs text-texto-2">{PAPEL_LABEL[p.role] ?? p.role}</td>
                  <td className="px-4 py-2 text-xs">{p.plan_id ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{PLAN_ORIGEM_LABEL[p.plan_origem] ?? p.plan_origem}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{p.plan_valido_ate ? new Date(p.plan_valido_ate).toLocaleDateString("pt-BR") : "sem prazo"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(p.ultimo)}</td>
                </tr>
              ))}
              {!r.planosEspeciais.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-texto-2">Todas as contas externas estão no plano padrão do nicho.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo={`Parceiros com território (${r.parceiros.length})`}>
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Parceiro</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Território</th>
                <th className="px-4 py-3">Situação</th><th className="px-4 py-3">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {r.parceiros.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2"><span className="text-texto">{p.razao_social || p.nome || "—"}</span><span className="block text-xs text-texto-2">{p.email}</span></td>
                  <td className="px-4 py-2 text-xs text-texto-2">{PAPEL_LABEL[p.tipo] ?? p.tipo}</td>
                  <td className="px-4 py-2 text-xs">{p.regiao ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{p.status}</td>
                  <td className="px-4 py-2 text-xs text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(p.ultimo)}</td>
                </tr>
              ))}
              {!r.parceiros.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-2">Nenhum parceiro com território definido.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Concluir a revisão">
        <ConcluirRevisao />
        {!!historico?.length && (
          <div className="cartao divide-y divide-linha">
            {historico.map((h) => (
              <div key={h.id} className="px-4 py-2.5 text-sm">
                <span className="text-texto">{dataHoraBR(h.created_at)}</span>
                <span className="text-xs text-texto-2"> · {nomePorId.get(h.revisado_por) || "—"}</span>
                {h.observacoes && <p className="text-xs text-texto-2 mt-0.5 whitespace-pre-line">{h.observacoes}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-texto-2">As revisões ficam registradas e não podem ser alteradas nem apagadas.</p>
      </Secao>
    </div>
  );
}
