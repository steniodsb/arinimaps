import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { CabecalhoSetor, Indicadores, TarefasDoSetor, contar, dataHoraBR } from "@/components/admin/Painel";
import { Etiqueta, NavegacaoInterna, Secao, Vazio } from "@/components/ui/Pagina";
import {
  Archive, ArrowRight, Ban, BellRing, Camera, FileLock2, FileX2, Globe, LogIn, MailCheck, MailX,
  ScrollText, ShieldAlert, ShieldCheck, Users,
} from "lucide-react";
import { PAPEL_LABEL } from "@/lib/perfis";
import { recursoPorId } from "@/lib/planos";
import { SETORES } from "@/lib/setores";
import Link from "next/link";
import { ALERTA_LABEL, type TipoAlerta } from "@/lib/seguranca/alertas";
import { CATEGORIA_ARQUIVO_LABEL, type CategoriaArquivo } from "@/lib/seguranca/documentos";
import { haDias, prazosRetencao, proximaRevisao, revisaoVencida, type Candidatos } from "@/lib/seguranca/retencao";
import { ultimaRevisao } from "@/lib/seguranca/revisao";
import { BotoesRetencao, MarcarAlerta } from "./AcoesSeguranca";

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

const TOM_SEVERIDADE: Record<string, "critico" | "alerta" | "neutro"> = {
  alta: "critico", media: "alerta", baixa: "neutro",
};
const CATEGORIA_DESCARTE: Record<string, string> = {
  selfie: "Selfies", documento_reprovado: "Documentos de anúncio reprovado", documento_reprovado_erro: "Documento (falha)",
  "log:auth_events": "Eventos de acesso", "log:document_access_log": "Aberturas de documentos",
  "log:access_attempts": "Tentativas bloqueadas", "log:consultas_area_log": "Consultas de área", "log:alertas_seguranca": "Alertas",
};

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
  const ha24h = haDias(1);
  const ha7d = haDias(7);

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

  // itens 6.3, 6.4, 6.8 e 6.13: alertas, aberturas de documentos, retenção e revisão
  const prazos = await prazosRetencao();
  const [{ data: alertas }, alertasAbertos, { data: acessosDocs }, negadosDocs7d, { data: descartes }, revisao, candidatos] = await Promise.all([
    admin.from("alertas_seguranca").select("id, email, tipo, severidade, detalhe, ip, created_at, visto_em, notificado")
      .order("created_at", { ascending: false }).limit(40),
    contar("alertas_seguranca", (q) => q.is("visto_em", null)),
    admin.from("document_access_log").select("id, user_id, categoria, storage_path, property_id, acao, permitido, motivo, ip, created_at")
      .order("created_at", { ascending: false }).limit(60),
    contar("document_access_log", (q) => q.eq("permitido", false).gte("created_at", ha7d)),
    admin.from("descartes_log").select("id, simulacao, categoria, quantidade, created_at")
      .order("created_at", { ascending: false }).limit(12),
    ultimaRevisao(),
    prazos.selfie || prazos.docs || prazos.logs
      ? admin.rpc("fn_descarte_candidatos", { p_selfie_dias: prazos.selfie, p_docs_dias: prazos.docs, p_logs_dias: prazos.logs })
          .then((r) => (r.data as Candidatos | null), () => null)
      : Promise.resolve(null),
  ]);
  const proxima = proximaRevisao(revisao?.created_at);
  const revisaoAtrasada = revisaoVencida(proxima);
  const souDiretoria = user.setores.includes("diretoria");
  const idsDocs = [...new Set((acessosDocs ?? []).map((d) => d.user_id).filter((v): v is string => !!v))];
  const idsImoveis = [...new Set((acessosDocs ?? []).map((d) => d.property_id).filter((v): v is string => !!v))];
  const [{ data: perfisDocs }, { data: imoveisDocs }] = await Promise.all([
    idsDocs.length ? admin.from("profiles").select("user_id, nome").in("user_id", idsDocs) : Promise.resolve({ data: [] as { user_id: string; nome: string | null }[] }),
    idsImoveis.length ? admin.from("properties").select("id, codigo").in("id", idsImoveis) : Promise.resolve({ data: [] as { id: string; codigo: string }[] }),
  ]);
  const nomeDoc = new Map((perfisDocs ?? []).map((p) => [p.user_id, p.nome ?? ""]));
  const codigoImovel = new Map((imoveisDocs ?? []).map((p) => [p.id, p.codigo]));

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

  const TH = "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2 whitespace-nowrap";
  const TD = "px-5 py-3.5";
  const NOTA = "text-sm leading-relaxed text-texto-2 max-w-4xl";

  return (
    <div className="mx-auto max-w-[1280px] space-y-10">
      <CabecalhoSetor setor="seguranca" />

      <Indicadores itens={[
        { rotulo: "Entradas em 24 h", valor: entradas24 },
        { rotulo: "Tentativas erradas em 24 h", valor: falhas24, destaque: falhas24 > 20 },
        { rotulo: "Bloqueios em 24 h", valor: bloqueios24, destaque: bloqueios24 > 0 },
        { rotulo: "Contas da equipe sem segundo fator", valor: semMfa, destaque: semMfa > 0 },
        { rotulo: "Alertas não vistos", valor: alertasAbertos, destaque: alertasAbertos > 0 },
        { rotulo: "Documentos negados em 7 dias", valor: negadosDocs7d, destaque: negadosDocs7d > 0 },
        {
          rotulo: "Próxima revisão de acessos", href: "/admin/seguranca/revisao", destaque: revisaoAtrasada,
          valor: proxima ? proxima.toLocaleDateString("pt-BR") : "pendente",
          nota: revisao ? `última: ${new Date(revisao.created_at).toLocaleDateString("pt-BR")}` : "nenhuma revisão registrada",
        },
        {
          rotulo: "Retenção e descarte", valor: prazos.selfie || prazos.docs || prazos.logs ? (prazos.executar ? "ativo" : "simulação") : "desligado",
          nota: "prazos em Configurações › Segurança",
        },
      ]} />

      <NavegacaoInterna itens={[
        { href: "#alertas", rotulo: "Alertas", icone: BellRing, contagem: alertasAbertos || undefined },
        { href: "#contas", rotulo: "Contas da equipe", icone: Users, contagem: contas.length },
        ...(suspeitos.length > 0 ? [{ href: "#enderecos", rotulo: "Endereços suspeitos", icone: Globe, contagem: suspeitos.length }] : []),
        { href: "#eventos", rotulo: "Eventos de acesso", icone: LogIn },
        { href: "#tentativas", rotulo: "Tentativas bloqueadas", icone: Ban },
        { href: "#documentos", rotulo: "Acessos a documentos", icone: FileLock2 },
        { href: "#retencao", rotulo: "Retenção e descarte", icone: Archive },
      ]} />

      <div id="alertas" className="scroll-mt-36">
        <Secao eyebrow="Detecção" titulo="Alertas de acesso anormal" acao={alertasAbertos > 1 ? <MarcarAlerta todos /> : undefined}
          subtitulo={<span className="text-sm">
            Gerados no login: aparelho ou local (faixa de endereço) nunca vistos na conta, 5 senhas erradas em 15 minutos,
            entrada logo após várias falhas e redefinição de senha da equipe. O dono da conta recebe o aviso por e-mail
            quando o serviço de e-mail estiver configurado.
          </span>}>
          {alertas?.length ? (
            <div className="cartao overflow-hidden divide-y divide-linha">
              {alertas.map((al) => {
                const d = (al.detalhe ?? {}) as Record<string, unknown>;
                return (
                  <div key={al.id} className={"px-5 py-3.5 flex items-center gap-4 flex-wrap text-[0.95rem] transition-colors hover:bg-superficie-2/60 " + (al.visto_em ? "opacity-60" : "")}>
                    <Etiqueta tom={TOM_SEVERIDADE[al.severidade] ?? "neutro"} className="w-16 justify-center">{al.severidade}</Etiqueta>
                    <span className="flex-1 min-w-56">
                      <span className="font-semibold text-texto">{ALERTA_LABEL[al.tipo as TipoAlerta] ?? al.tipo}</span>
                      <span className="mt-0.5 block text-sm text-texto-2">
                        {al.email ?? "—"}{d.aparelho ? ` · ${String(d.aparelho)}` : ""}{al.ip ? ` · ${al.ip}` : ""}
                        {d.falhas ? ` · ${String(d.falhas)} falhas` : ""}{d.via ? ` · confirmação: ${String(d.via)}` : ""}
                      </span>
                    </span>
                    <span className="text-sm text-texto-2 tabular-nums whitespace-nowrap">{dataHoraBR(al.created_at)}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-texto-2">
                      {al.notificado ? <MailCheck className="size-3.5" /> : <MailX className="size-3.5" />}
                      {al.notificado ? "e-mail enviado" : "sem e-mail"}
                    </span>
                    {!al.visto_em && <MarcarAlerta id={al.id} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <Vazio icone={ShieldCheck} titulo="Nenhum alerta até agora." />
          )}
        </Secao>
      </div>

      <div id="contas" className="scroll-mt-36">
        <Secao eyebrow="Proteção" titulo="Contas da equipe"
          acao={<Link href="/admin/seguranca/revisao" className="inline-flex items-center gap-1.5 text-sm font-semibold text-verde hover:underline">Revisão trimestral de acessos <ArrowRight className="size-4" /></Link>}
          subtitulo={<span className="text-sm">
            Cada pessoa ativa o segundo fator em “Minha segurança”, no rodapé do menu. A diretoria pode torná-lo
            obrigatório para a equipe em Configurações › Segurança.
          </span>}>
          <div className="cartao overflow-hidden divide-y divide-linha">
            {contas.map((c) => (
              <div key={c.user_id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap text-[0.95rem] transition-colors hover:bg-superficie-2/60">
                <span className="flex-1 min-w-48">
                  <span className="font-semibold text-texto">{c.nome || "—"}</span>
                  <span className="mt-0.5 block text-sm text-texto-2">{c.email} · {c.role === "admin_central" ? "Diretoria" : "Equipe"}</span>
                </span>
                <span className="text-sm text-texto-2 tabular-nums">último acesso: {dataHoraBR(c.ultimo)}</span>
                <Etiqueta tom={c.mfa ? "verde" : "alerta"}>
                  {c.mfa ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                  {c.mfa ? "segundo fator ativo" : "sem segundo fator"}
                </Etiqueta>
                {!c.ativo && <Etiqueta tom="critico">desativada</Etiqueta>}
              </div>
            ))}
          </div>
        </Secao>
      </div>

      {suspeitos.length > 0 && (
        <div id="enderecos" className="scroll-mt-36">
          <Secao eyebrow="Força bruta" titulo="Endereços com muitas tentativas erradas (7 dias)"
            subtitulo={<span className="text-sm">O sistema já limita sozinho: 30 tentativas por endereço a cada 10 minutos e 8 por conta a cada 15.</span>}>
            <div className="cartao overflow-hidden divide-y divide-linha">
              {suspeitos.map(([ip, n]) => (
                <p key={ip} className="px-5 py-3.5 flex justify-between text-[0.95rem]">
                  <span className="font-mono text-sm text-texto">{ip}</span>
                  <span className="font-semibold text-alerta tabular-nums">{n} tentativas</span>
                </p>
              ))}
            </div>
          </Secao>
        </div>
      )}

      <div id="eventos" className="scroll-mt-36">
        <Secao eyebrow="Registro" titulo="Últimos eventos de acesso">
          <div className="cartao overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[0.95rem]">
                <thead className="bg-superficie-2">
                  <tr>
                    <th className={TH}>Quando</th>
                    <th className={TH}>Evento</th>
                    <th className={TH}>Conta</th>
                    <th className={TH}>Endereço</th>
                    <th className={TH}>Aparelho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {(eventos ?? []).map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-superficie-2/60">
                      <td className={TD + " text-sm text-texto-2 tabular-nums whitespace-nowrap"}>{dataHoraBR(e.created_at)}</td>
                      <td className={TD + " font-semibold " + (EVENTO[e.evento]?.cor ?? "text-texto")}>{EVENTO[e.evento]?.rotulo ?? e.evento}</td>
                      <td className={TD + " text-sm text-texto-2"}>{e.email ?? "—"}</td>
                      <td className={TD + " font-mono text-xs text-texto-2"}>{e.ip ?? "—"}</td>
                      <td className={TD + " text-xs text-texto-2 max-w-56 truncate"} title={e.agente ?? ""}>
                        {(e.agente ?? "").replace(/Mozilla\/5\.0 \(([^)]*)\).*?(Chrome|Firefox|Safari|Edg)\/([\d]+).*/, "$2 $3 · $1") || "—"}
                      </td>
                    </tr>
                  ))}
                  {!eventos?.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-base text-texto-2">Nenhum evento registrado ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Secao>
      </div>

      <div id="tentativas" className="scroll-mt-36">
        <Secao eyebrow="Planos e setores" titulo="Tentativas bloqueadas"
          subtitulo={<span className="text-sm">
            Toda negação do servidor (recurso fora do plano, cota esgotada, setor sem acesso) é registrada aqui e não pode
            ser apagada pela tela. Muitas tentativas de uma mesma conta podem indicar interesse num plano maior — ou abuso.
          </span>}>
          <div className="cartao overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-[0.95rem]">
                <thead className="bg-superficie-2">
                  <tr>
                    <th className={TH}>Quando</th>
                    <th className={TH}>Usuário</th>
                    <th className={TH}>Papel</th>
                    <th className={TH}>Plano</th>
                    <th className={TH}>Recurso</th>
                    <th className={TH}>Motivo</th>
                    <th className={TH}>Rota</th>
                    <th className={TH}>Endereço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {(tentativas ?? []).map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-superficie-2/60">
                      <td className={TD + " text-sm text-texto-2 tabular-nums whitespace-nowrap"}>{dataHoraBR(t.created_at)}</td>
                      <td className={TD + " text-sm font-semibold text-texto"}>{t.user_id ? (nomePorId.get(t.user_id) || "conta sem nome") : <span className="font-normal text-texto-2">visitante</span>}</td>
                      <td className={TD + " text-sm text-texto-2"}>{t.role ? PAPEL_LABEL[t.role] ?? t.role : "—"}</td>
                      <td className={TD + " text-sm text-texto-2"}>{t.plan_id ?? "—"}</td>
                      <td className={TD + " text-sm text-texto"}>{recursoLabel(t.recurso)}</td>
                      <td className={TD}><Etiqueta tom="alerta">{motivoLabel(t.motivo)}</Etiqueta></td>
                      <td className={TD + " font-mono text-xs text-texto-2 max-w-48 truncate"} title={t.rota ?? ""}>{t.rota ?? "—"}</td>
                      <td className={TD + " font-mono text-xs text-texto-2"}>{t.ip ?? "—"}</td>
                    </tr>
                  ))}
                  {!tentativas?.length && <tr><td colSpan={8} className="px-5 py-10 text-center text-base text-texto-2">Nenhuma tentativa bloqueada registrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Secao>
      </div>

      <div id="documentos" className="scroll-mt-36">
        <Secao eyebrow="Arquivos sensíveis" titulo="Acessos a documentos"
          subtitulo={<span className="text-sm">
            Documentos do imóvel, selfies do aceite, autorizações, contratos e anexos cartográficos abrem por um endereço
            interno que confere a permissão a cada clique e registra aqui — inclusive as tentativas negadas. O link
            assinado do armazenamento vale só 60 segundos.
          </span>}>
          <div className="cartao overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[0.95rem]">
                <thead className="bg-superficie-2">
                  <tr>
                    <th className={TH}>Quando</th>
                    <th className={TH}>Quem</th>
                    <th className={TH}>Arquivo</th>
                    <th className={TH}>Imóvel</th>
                    <th className={TH}>Ação</th>
                    <th className={TH}>Endereço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {(acessosDocs ?? []).map((d) => (
                    <tr key={d.id} className="transition-colors hover:bg-superficie-2/60">
                      <td className={TD + " text-sm text-texto-2 tabular-nums whitespace-nowrap"}>{dataHoraBR(d.created_at)}</td>
                      <td className={TD + " text-sm font-semibold text-texto"}>{d.user_id ? (nomeDoc.get(d.user_id) || "conta sem nome") : "—"}</td>
                      <td className={TD + " text-sm text-texto"}>
                        {CATEGORIA_ARQUIVO_LABEL[d.categoria as CategoriaArquivo] ?? d.categoria}
                        <span className="block font-mono text-[11px] text-texto-2 max-w-56 truncate" title={d.storage_path}>{d.storage_path.split("/").pop()}</span>
                      </td>
                      <td className={TD + " text-sm"}>
                        {d.property_id ? <Link href={`/admin/imoveis/${d.property_id}`} className="font-mono font-semibold text-verde hover:underline">{codigoImovel.get(d.property_id) ?? "abrir"}</Link> : "—"}
                      </td>
                      <td className={TD}>
                        {d.permitido
                          ? <Etiqueta tom="neutro">{d.acao === "baixar" ? "baixou" : "abriu"}</Etiqueta>
                          : <Etiqueta tom="critico">{`negado${d.motivo ? ` (${d.motivo})` : ""}`}</Etiqueta>}
                      </td>
                      <td className={TD + " font-mono text-xs text-texto-2"}>{d.ip ?? "—"}</td>
                    </tr>
                  ))}
                  {!acessosDocs?.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-base text-texto-2">Nenhuma abertura de documento registrada ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Secao>
      </div>

      <div id="retencao" className="scroll-mt-36">
        <Secao eyebrow="LGPD" titulo="Retenção e descarte" acao={souDiretoria && (prazos.selfie || prazos.docs || prazos.logs) ? <BotoesRetencao executar={prazos.executar} /> : undefined}>
          <div className="grid gap-5 md:grid-cols-3">
            {([
              ["Selfies", prazos.selfie ? `${prazos.selfie} dias após a autorização` : "não descartar", Camera],
              ["Documentos de anúncio reprovado", prazos.docs ? `${prazos.docs} dias` : "não descartar", FileX2],
              ["Registros de acesso", prazos.logs ? `${prazos.logs} dias` : "não descartar", ScrollText],
            ] as const).map(([rotulo, valor, Icone]) => (
              <div key={rotulo} className="cartao p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-verde/12 text-verde"><Icone className="size-5" /></span>
                <p className="mt-4 text-sm text-texto-2">{rotulo}</p>
                <p className="lp-display mt-1 text-lg text-texto">{valor}</p>
              </div>
            ))}
          </div>
          <div className="cartao p-6 space-y-3">
            {candidatos && (
              <p className="text-[0.95rem] text-texto">
                Hoje passaram do prazo: <strong className="tabular-nums">{candidatos.selfies.length}</strong> selfie(s), <strong className="tabular-nums">{candidatos.documentos.length}</strong> documento(s) e{" "}
                <strong className="tabular-nums">{Object.values(candidatos.logs ?? {}).reduce((s, n) => s + Number(n), 0)}</strong> registro(s) de acesso.
                {prazos.executar ? " A rotina diária do worker apaga." : " A rotina diária só simula (“Descartar de verdade” desligado)."}
              </p>
            )}
            <p className={NOTA}>
              Os prazos aguardam a decisão 8.9 (Carlos e jurídico) e ficam em Configurações › Segurança. Enquanto estiverem em 0,
              nada é descartado. Registros de acesso nunca ficam menos de 180 dias (Marco Civil da Internet, art. 15).
              A auditoria e o histórico do imóvel não entram no descarte.
            </p>
          </div>
          {!!descartes?.length && (
            <div className="cartao overflow-hidden divide-y divide-linha">
              {descartes.map((d) => (
                <p key={d.id} className="px-5 py-3.5 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_12rem_10rem] gap-3 text-[0.95rem]">
                  <span className="font-semibold text-texto">{CATEGORIA_DESCARTE[d.categoria] ?? d.categoria}</span>
                  <span className="text-texto-2 tabular-nums">{d.simulacao ? "simulação" : "descartado"} · {d.quantidade}</span>
                  <span className="text-sm text-texto-2 tabular-nums sm:text-right">{dataHoraBR(d.created_at)}</span>
                </p>
              ))}
            </div>
          )}
        </Secao>
      </div>

      <TarefasDoSetor setor="seguranca" souEu={user.id} />
    </div>
  );
}
