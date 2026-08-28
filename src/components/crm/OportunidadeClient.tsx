"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS, ETAPA_LABEL } from "@/lib/funil";

type Parceiro = { id: string; razao_social: string; tipo: string };
type Evento = { id: string; tipo: string; descricao: string; created_at: string; autor: string | null };
type Visita = { id: string; data_hora: string; status: string; feedback: string | null };
type Proposta = { id: string; numero_rodada: number; autor_lado: string; valor: number; entrada: number | null; prazo: string | null; condicoes: string | null; observacoes: string | null; status: string; created_at: string };

type Props = {
  modo: "arini" | "parceiro";
  oportunidade: {
    id: string; etapa: string; responsavel_tipo: string;
    responsavel_partner_id: string | null; partner_comprador_id: string | null;
    motivo_perda: string | null; valor_imovel: number | null;
  };
  parceiros: Parceiro[];
  eventos: Evento[];
  visitas: Visita[];
  propostas: Proposta[];
  contrato: { status: string; documento_path: string | null; assinado_at: string | null } | null;
  venda: { valor_final: number; data_venda: string; comissao: { valor: number; percentual: number; status: string } | null } | null;
  percentualPadrao: number;
};

const input = "w-full rounded-lg cartao px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";
const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function OportunidadeClient(props: Props) {
  const { modo, oportunidade: o, parceiros } = props;
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const base = `/api/oportunidades/${o.id}`;

  async function chamar(method: "PATCH" | "POST", body: unknown) {
    setOcupado(true);
    setErro("");
    const res = await fetch(base, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) { setErro(data.error ?? "Falha na operação."); return false; }
    router.refresh();
    return true;
  }

  // ---------- estados de formulários ----------
  const [nota, setNota] = useState("");
  const [visitaData, setVisitaData] = useState("");
  const [prop, setProp] = useState({ autor_lado: "comprador", valor: "", entrada: "", prazo: "", condicoes: "", observacoes: "" });
  const [venda, setVenda] = useState({
    valor_final: props.propostas.find((p) => p.status === "aceita")?.valor?.toString() ?? o.valor_imovel?.toString() ?? "",
    percentual: String(props.percentualPadrao),
    regra: "",
  });

  const brl = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {erro && <p className="lg:col-span-2 text-sm text-critico bg-critico/10 rounded-lg px-4 py-2">{erro}</p>}

      {/* ---------- etapa + encaminhamento ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Etapa do funil</h2>
        <div className="flex gap-2 flex-wrap">
          <select className={input + " max-w-56"} value={o.etapa}
            onChange={(e) => chamar("PATCH", { acao: "etapa", etapa: e.target.value })} disabled={ocupado}>
            {[...ETAPAS, "perdido"].map((e) => <option key={e} value={e}>{ETAPA_LABEL[e]}</option>)}
          </select>
          <button disabled={ocupado} className={`${btn} bg-critico/10 text-critico border border-critico/30 hover:bg-critico/20`}
            onClick={() => {
              const motivo = prompt("Motivo da perda:");
              if (motivo !== null) chamar("PATCH", { acao: "etapa", etapa: "perdido", motivo });
            }}>
            Marcar perdido
          </button>
        </div>
        {o.motivo_perda && <p className="text-xs text-critico">Perdido: {o.motivo_perda}</p>}

        {modo === "arini" && (
          <div className="pt-2 border-t border-linha space-y-2">
            <h3 className="text-sm font-semibold text-texto">Encaminhamento (intermediação Arini)</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select className={input} value={o.responsavel_tipo} disabled={ocupado}
                onChange={(e) => chamar("PATCH", { acao: "encaminhar", responsavel_tipo: e.target.value, responsavel_partner_id: o.responsavel_partner_id, partner_comprador_id: o.partner_comprador_id })}>
                <option value="arini">Arini atende</option>
                <option value="proprietario">Proprietário atende</option>
                <option value="parceiro">Parceiro atende</option>
              </select>
              <select className={input} value={o.responsavel_partner_id ?? ""} disabled={ocupado}
                onChange={(e) => chamar("PATCH", { acao: "encaminhar", responsavel_tipo: "parceiro", responsavel_partner_id: e.target.value || null, partner_comprador_id: o.partner_comprador_id })}>
                <option value="">Parceiro do imóvel (A)…</option>
                {parceiros.map((p) => <option key={p.id} value={p.id}>{p.razao_social} ({p.tipo})</option>)}
              </select>
            </div>
            <select className={input} value={o.partner_comprador_id ?? ""} disabled={ocupado}
              onChange={(e) => chamar("PATCH", { acao: "encaminhar", responsavel_tipo: o.responsavel_tipo, responsavel_partner_id: o.responsavel_partner_id, partner_comprador_id: e.target.value || null })}>
              <option value="">Parceiro do comprador (B) — opcional</option>
              {parceiros.map((p) => <option key={p.id} value={p.id}>{p.razao_social} ({p.tipo})</option>)}
            </select>
          </div>
        )}
      </section>

      {/* ---------- visitas ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Visitas</h2>
        <div className="flex gap-2">
          <input type="datetime-local" className={input} value={visitaData} onChange={(e) => setVisitaData(e.target.value)} />
          <button disabled={ocupado || !visitaData} className={`${btn} bg-verde text-white hover:bg-verde-escuro`}
            onClick={async () => { if (await chamar("POST", { tipo: "visita", data_hora: visitaData })) setVisitaData(""); }}>
            Agendar
          </button>
        </div>
        <div className="space-y-2">
          {props.visitas.map((v) => (
            <div key={v.id} className="rounded-lg bg-superficie-2 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
              <span className="flex-1">{new Date(v.data_hora).toLocaleString("pt-BR")} — <strong>{v.status}</strong>{v.feedback ? ` · ${v.feedback}` : ""}</span>
              {v.status === "agendada" && (
                <span className="flex gap-1">
                  {(["realizada", "remarcada", "nao_compareceu"] as const).map((s) => (
                    <button key={s} disabled={ocupado}
                      className="text-xs rounded bg-superficie border border-linha px-2 py-1 hover:bg-verde hover:text-white"
                      onClick={() => {
                        const feedback = s === "realizada" ? prompt("Como foi a visita? (opcional)") ?? "" : "";
                        chamar("POST", { tipo: "visita_status", visita_id: v.id, status: s, feedback });
                      }}>
                      {s === "nao_compareceu" ? "não veio" : s}
                    </button>
                  ))}
                </span>
              )}
            </div>
          ))}
          {!props.visitas.length && <p className="text-xs text-texto-2">Nenhuma visita ainda.</p>}
        </div>
      </section>

      {/* ---------- propostas ---------- */}
      <section className="cartao p-5 space-y-3">
        <h2 className="font-semibold text-texto">Propostas e contrapropostas</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={input} value={prop.autor_lado} onChange={(e) => setProp({ ...prop, autor_lado: e.target.value })}>
            <option value="comprador">Proposta do comprador</option>
            <option value="vendedor">Contraproposta do vendedor</option>
          </select>
          <input className={input} placeholder="Valor (R$)" inputMode="numeric" value={prop.valor}
            onChange={(e) => setProp({ ...prop, valor: e.target.value })} />
          <input className={input} placeholder="Entrada (R$, opcional)" inputMode="numeric" value={prop.entrada}
            onChange={(e) => setProp({ ...prop, entrada: e.target.value })} />
          <input className={input} placeholder="Prazo (ex.: 4 parcelas semestrais)" value={prop.prazo}
            onChange={(e) => setProp({ ...prop, prazo: e.target.value })} />
        </div>
        <textarea rows={2} className={input} placeholder="Condições e observações"
          value={prop.condicoes} onChange={(e) => setProp({ ...prop, condicoes: e.target.value })} />
        <button disabled={ocupado || !prop.valor} className={`${btn} bg-verde text-white hover:bg-verde-escuro`}
          onClick={async () => {
            const ok = await chamar("POST", {
              tipo: "proposta", autor_lado: prop.autor_lado,
              valor: Number(prop.valor.replace(/\./g, "").replace(",", ".")),
              entrada: prop.entrada ? Number(prop.entrada.replace(/\./g, "").replace(",", ".")) : null,
              prazo: prop.prazo || null, condicoes: prop.condicoes || null,
            });
            if (ok) setProp({ autor_lado: "comprador", valor: "", entrada: "", prazo: "", condicoes: "", observacoes: "" });
          }}>
          Registrar rodada
        </button>
        <div className="space-y-2">
          {props.propostas.map((p) => (
            <div key={p.id} className="rounded-lg bg-superficie-2 px-3 py-2 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">R{p.numero_rodada}</span>
                <span className="flex-1">{p.autor_lado === "comprador" ? "Comprador" : "Vendedor"}: <strong>{brl(p.valor)}</strong>{p.entrada ? ` (entrada ${brl(p.entrada)})` : ""}{p.prazo ? ` · ${p.prazo}` : ""}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 ${p.status === "aceita" ? "bg-verde text-white" : p.status === "recusada" ? "bg-critico/15 text-critico" : "bg-superficie border border-linha"}`}>{p.status}</span>
                {p.status === "enviada" && (
                  <span className="flex gap-1">
                    <button disabled={ocupado} className="text-xs rounded bg-verde text-white px-2 py-1"
                      onClick={() => chamar("POST", { tipo: "proposta_status", proposta_id: p.id, status: "aceita" })}>aceitar</button>
                    <button disabled={ocupado} className="text-xs rounded bg-critico text-white px-2 py-1"
                      onClick={() => chamar("POST", { tipo: "proposta_status", proposta_id: p.id, status: "recusada" })}>recusar</button>
                  </span>
                )}
              </div>
              {p.condicoes && <p className="text-xs text-texto-2">{p.condicoes}</p>}
            </div>
          ))}
          {!props.propostas.length && <p className="text-xs text-texto-2">Nenhuma proposta registrada.</p>}
        </div>
      </section>

      {/* ---------- contrato + venda (só Arini) ---------- */}
      {modo === "arini" && (
        <section className="cartao p-5 space-y-4">
          <div className="space-y-2">
            <h2 className="font-semibold text-texto">Contrato</h2>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span>Status: <strong>{props.contrato?.status ?? "sem contrato"}</strong></span>
              {(["em_elaboracao", "assinado", "registrado"] as const).map((s) => (
                <button key={s} disabled={ocupado}
                  className="text-xs rounded bg-superficie-2 border border-linha px-2 py-1 hover:bg-verde hover:text-white"
                  onClick={() => chamar("POST", { tipo: "contrato_status", status: s })}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs rounded-lg border border-linha px-3 py-1.5 cursor-pointer hover:bg-superficie-2">
                Anexar documento
                <input type="file" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setOcupado(true);
                  const fd = new FormData();
                  fd.set("arquivo", f);
                  const res = await fetch(`${base}/contrato`, { method: "POST", body: fd });
                  setOcupado(false);
                  if (res.ok) router.refresh(); else setErro("Falha no upload do contrato.");
                }} />
              </label>
              {props.contrato?.documento_path && (
                <button className="text-xs text-verde hover:underline"
                  onClick={async () => {
                    const res = await fetch(`${base}/contrato`);
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank");
                  }}>
                  Baixar contrato
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-linha space-y-2">
            <h2 className="font-semibold text-texto">Registrar venda</h2>
            {props.venda ? (
              <div className="rounded-lg bg-verde text-white px-4 py-3 text-sm">
                Venda registrada: <strong>{brl(props.venda.valor_final)}</strong> em {new Date(props.venda.data_venda + "T12:00:00").toLocaleDateString("pt-BR")}
                {props.venda.comissao && <> · comissão {props.venda.comissao.percentual}% = <strong>{brl(props.venda.comissao.valor)}</strong> ({props.venda.comissao.status})</>}
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={input} placeholder="Valor final (R$)" inputMode="numeric"
                    value={venda.valor_final} onChange={(e) => setVenda({ ...venda, valor_final: e.target.value })} />
                  <input className={input} placeholder="Comissão %" inputMode="decimal"
                    value={venda.percentual} onChange={(e) => setVenda({ ...venda, percentual: e.target.value })} />
                </div>
                <input className={input} placeholder="Regra contratual da comissão (opcional)"
                  value={venda.regra} onChange={(e) => setVenda({ ...venda, regra: e.target.value })} />
                <button disabled={ocupado || !venda.valor_final}
                  className={`${btn} bg-ouro text-texto font-semibold hover:bg-ouro-escuro hover:text-white`}
                  onClick={() => {
                    if (!confirm("Registrar a venda? O imóvel vira VENDIDO e sai da oferta.")) return;
                    chamar("POST", {
                      tipo: "venda",
                      valor_final: Number(venda.valor_final.replace(/\./g, "").replace(",", ".")),
                      percentual: Number(venda.percentual.replace(",", ".")),
                      regra: venda.regra || null,
                    });
                  }}>
                  Registrar venda + comissão
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------- timeline ---------- */}
      <section className="cartao p-5 space-y-3 lg:col-span-2">
        <h2 className="font-semibold text-texto">Timeline do atendimento</h2>
        <div className="flex gap-2">
          <input className={input} placeholder="Registrar contato / anotação…" value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && nota.trim()) {
                if (await chamar("POST", { tipo: "evento", categoria: "contato", descricao: nota })) setNota("");
              }
            }} />
          <button disabled={ocupado || !nota.trim()} className={`${btn} bg-verde text-white hover:bg-verde-escuro`}
            onClick={async () => { if (await chamar("POST", { tipo: "evento", categoria: "contato", descricao: nota })) setNota(""); }}>
            Registrar
          </button>
        </div>
        <ol className="space-y-1.5 text-sm">
          {props.eventos.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="text-xs text-texto-2 tabular-nums shrink-0 w-32">
                {new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="flex-1">{e.descricao}{e.autor ? <span className="text-texto-2"> — {e.autor}</span> : null}</span>
            </li>
          ))}
          {!props.eventos.length && <p className="text-xs text-texto-2">Sem eventos ainda.</p>}
        </ol>
      </section>
    </div>
  );
}
