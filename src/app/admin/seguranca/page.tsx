import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { CabecalhoSetor, Indicadores, Secao, TarefasDoSetor, contar, dataHoraBR } from "@/components/admin/Painel";
import { PAPEL_LABEL } from "@/lib/perfis";
import { recursoPorId } from "@/lib/planos";
import { SETORES } from "@/lib/setores";

const MOTIVO_TENTATIVA: Record<string, string> = {
  sem_sessao: "Sem sessão", sem_plano: "Fora do plano", sem_setor: "Fora do setor", sem_equipe: "Não é da equipe",
};
/** Nome legível do recurso ou setor negado. */
function recursoLabel(recurso: string) {
  if (recurso.startsWith("setor:")) {
    const id = recurso.slice(6);
    return `Setor ${SETORES.find((s) => s.id === id)?.nome ?? id}`;
  }
  return recursoPorId(recurso)?.nome ?? recurso;
}
function motivoLabel(motivo: string | null) {
  if (!motivo) return "—";
  if (motivo.startsWith("cota:")) return `Cota esgotada (${motivo.slice(5)})`;
  return MOTIVO_TENTATIVA[motivo] ?? motivo;
}

const EVENTO: Record<string, { rotulo: string; cor: string }> = {
  login_ok: { rotulo: "Entrou", cor: "text-verde" },
  login_falhou: { rotulo: "Senha ou e-mail errados", cor: "text-alerta" },
  login_bloqueado: { rotulo: "Bloqueado por excesso de tentativas", cor: "text-critico" },
  logout: { rotulo: "Saiu", cor: "text-texto-2" },
  recuperacao_pedida: { rotulo: "Pediu recuperação de senha", cor: "text-texto-2" },
  senha_redefinida: { rotulo: "Redefiniu a senha pelo link", cor: "text-texto" },
  senha_alterada: { rotulo: "Trocou a senha", cor: "text-texto" },
  mfa_ativado: { rotulo: "Ativou o segundo fator", cor: "text-verde" },
  mfa_desativado: { rotulo: "Desativou o segundo fator", cor: "text-alerta" },
  mfa_ok: { rotulo: "Confirmou o segundo fator", cor: "text-verde" },
  mfa_falhou: { rotulo: "Errou o código do segundo fator", cor: "text-alerta" },
  sessoes_encerradas: { rotulo: "Encerrou as outras sessões", cor: "text-texto" },
};

/**
 * Segurança: quem entrou, quem tentou e não conseguiu, e como está a proteção
 * das contas da equipe. Os eventos são gravados pelo servidor e não podem ser
 * alterados nem apagados pela tela.
 */
export default async function PainelSeguranca() {
  const user = await exigirSetor("seguranca");
  const admin = supabaseAdmin();
  const ha24h = new Date(Date.now() - 86_400_000).toISOString();
  const ha7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ data: eventos }, falhas24, bloqueios24, entradas24, { data: equipe }, { data: usuarios }, { data: falhasIp }, { data: tentativas }] = await Promise.all([
    admin.from("auth_events").select("id, user_id, email, evento, ip, agente, created_at").order("created_at", { ascending: false }).limit(80),
    contar("auth_events", (q) => q.in("evento", ["login_falhou", "mfa_falhou"]).gte("created_at", ha24h)),
    contar("auth_events", (q) => q.eq("evento", "login_bloqueado").gte("created_at", ha24h)),
    contar("auth_events", (q) => q.eq("evento", "login_ok").gte("created_at", ha24h)),
    admin.from("profiles").select("user_id, nome, role, ativo, setores").in("role", ["admin_central", "analista_arini"]).order("nome"),
    admin.auth.admin.listUsers({ perPage: 500 }),
    admin.from("auth_events").select("ip").in("evento", ["login_falhou", "login_bloqueado"]).gte("created_at", ha7d).limit(2000),
    admin.from("access_attempts").select("id, user_id, role, plan_id, recurso, rota, motivo, ip, created_at")
      .order("created_at", { ascending: false }).limit(50),
  ]);

  // nomes de quem tentou (fluxograma §20: bloqueia e registra), numa segunda consulta
  const idsTentativa = [...new Set((tentativas ?? []).map((t) => t.user_id).filter((v): v is string => !!v))];
  const { data: perfisTentativa } = idsTentativa.length
    ? await admin.from("profiles").select("user_id, nome").in("user_id", idsTentativa)
    : { data: [] as { user_id: string; nome: string | null }[] };
  const nomePorId = new Map((perfisTentativa ?? []).map((p) => [p.user_id, p.nome ?? ""]));

  const authPorId = new Map((usuarios?.users ?? []).map((u) => [u.id, u]));
  const contas = (equipe ?? []).map((p) => {
    const u = authPorId.get(p.user_id);
    return {
      ...p, email: u?.email ?? "",
      mfa: (u?.factors ?? []).some((f) => f.status === "verified"),
      ultimo: u?.last_sign_in_at ?? null,
    };
  });
  const semMfa = contas.filter((c) => c.ativo && !c.mfa).length;

  const ips = new Map<string, number>();
  for (const f of falhasIp ?? []) if (f.ip) ips.set(f.ip, (ips.get(f.ip) ?? 0) + 1);
  const suspeitos = [...ips.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="space-y-7 max-w-5xl">
      <CabecalhoSetor setor="seguranca" />

      <Indicadores itens={[
        { rotulo: "Entradas em 24 h", valor: entradas24 },
        { rotulo: "Tentativas erradas em 24 h", valor: falhas24, destaque: falhas24 > 20 },
        { rotulo: "Bloqueios em 24 h", valor: bloqueios24, destaque: bloqueios24 > 0 },
        { rotulo: "Contas da equipe sem segundo fator", valor: semMfa, destaque: semMfa > 0 },
      ]} />

      <Secao titulo="Contas da equipe">
        <div className="cartao divide-y divide-linha">
          {contas.map((c) => (
            <div key={c.user_id} className="px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
              <span className="flex-1 min-w-48">
                <span className="text-texto">{c.nome || "—"}</span>
                <span className="block text-xs text-texto-2">{c.email} · {c.role === "admin_central" ? "Diretoria" : "Equipe"}</span>
              </span>
              <span className="text-xs text-texto-2">último acesso: {dataHoraBR(c.ultimo)}</span>
              <span className={"text-xs rounded-full px-3 py-1 " + (c.mfa ? "bg-verde/10 text-verde" : "bg-alerta/10 text-alerta")}>
                {c.mfa ? "segundo fator ativo" : "sem segundo fator"}
              </span>
              {!c.ativo && <span className="text-xs rounded-full px-3 py-1 bg-critico/10 text-critico">desativada</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-texto-2">
          Cada pessoa ativa o segundo fator em “Minha segurança”, no rodapé do menu. A diretoria pode torná-lo
          obrigatório para a equipe em Configurações › Segurança.
        </p>
      </Secao>

      {suspeitos.length > 0 && (
        <Secao titulo="Endereços com muitas tentativas erradas (7 dias)">
          <div className="cartao divide-y divide-linha">
            {suspeitos.map(([ip, n]) => (
              <p key={ip} className="px-4 py-2.5 flex justify-between text-sm">
                <span className="font-mono text-xs text-texto">{ip}</span>
                <span className="text-alerta tabular-nums">{n} tentativas</span>
              </p>
            ))}
          </div>
          <p className="text-xs text-texto-2">
            O sistema já limita sozinho: 30 tentativas por endereço a cada 10 minutos e 8 por conta a cada 15.
          </p>
        </Secao>
      )}

      <Secao titulo="Últimos eventos de acesso">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Conta</th>
                <th className="px-4 py-3">Endereço</th>
                <th className="px-4 py-3">Aparelho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {(eventos ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-xs text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(e.created_at)}</td>
                  <td className={"px-4 py-2 " + (EVENTO[e.evento]?.cor ?? "text-texto")}>{EVENTO[e.evento]?.rotulo ?? e.evento}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{e.email ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-texto-2">{e.ip ?? "—"}</td>
                  <td className="px-4 py-2 text-[11px] text-texto-2 max-w-56 truncate" title={e.agente ?? ""}>
                    {(e.agente ?? "").replace(/Mozilla\/5\.0 \(([^)]*)\).*?(Chrome|Firefox|Safari|Edg)\/([\d]+).*/, "$2 $3 · $1") || "—"}
                  </td>
                </tr>
              ))}
              {!eventos?.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-2">Nenhum evento registrado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo="Tentativas bloqueadas (planos e setores)">
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-texto-2 border-b border-linha">
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Recurso</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Rota</th>
                <th className="px-4 py-3">Endereço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {(tentativas ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-xs text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(t.created_at)}</td>
                  <td className="px-4 py-2 text-xs">{t.user_id ? (nomePorId.get(t.user_id) || "conta sem nome") : <span className="text-texto-2">visitante</span>}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{t.role ? PAPEL_LABEL[t.role] ?? t.role : "—"}</td>
                  <td className="px-4 py-2 text-xs text-texto-2">{t.plan_id ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{recursoLabel(t.recurso)}</td>
                  <td className="px-4 py-2 text-xs text-alerta">{motivoLabel(t.motivo)}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-texto-2 max-w-48 truncate" title={t.rota ?? ""}>{t.rota ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-texto-2">{t.ip ?? "—"}</td>
                </tr>
              ))}
              {!tentativas?.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-texto-2">Nenhuma tentativa bloqueada registrada.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-texto-2">
          Toda negação do servidor (recurso fora do plano, cota esgotada, setor sem acesso) é registrada aqui e não pode
          ser apagada pela tela. Muitas tentativas de uma mesma conta podem indicar interesse num plano maior — ou abuso.
        </p>
      </Secao>

      <TarefasDoSetor setor="seguranca" souEu={user.id} />
    </div>
  );
}
