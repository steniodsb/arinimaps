"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/shell/Avatar";
import { PAPEL_ORG_LABEL, STATUS_MEMBRO_LABEL, TIPOS_ORG, TIPO_ORG_LABEL, type TipoOrg } from "@/lib/organizacoes";

const input = "rounded-lg border border-linha bg-superficie-2 px-3 py-2 text-sm text-texto focus:outline-none focus:ring-2 focus:ring-verde";

type Membro = {
  id: string; user_id: string | null; email: string; papel_org: string; status: string;
  convidado_em: string; aceito_em: string | null; nome: string | null; avatar_url: string | null;
};
export type OrgLinha = {
  id: string; nome: string; cnpj: string | null; tipo: string; plan_id: string | null; plan_valido_ate: string | null;
  region_id: string | null; ativo: boolean; observacoes: string | null; created_at: string; membros: Membro[];
};
type Plano = { id: string; nome: string; escopo: string };
type Regiao = { id: string; nome: string };

async function chamar(metodo: "POST" | "PATCH", corpo: Record<string, unknown>) {
  const res = await fetch("/api/admin/organizacoes", {
    method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, erro: [d.error, d.motivo].filter(Boolean).join(" — ") || "Não foi possível." };
}

const dataBR = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const formatarCnpj = (c: string | null) =>
  c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c ?? "";

function CamposOrg({ valor, onChange, planos, regioes }: {
  valor: Record<string, string>; onChange: (v: Record<string, string>) => void; planos: Plano[]; regioes: Regiao[];
}) {
  const set = (k: string, v: string) => onChange({ ...valor, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 sm:col-span-2">
        <span className="block text-xs text-texto-2">Nome *</span>
        <input required className={input + " w-full"} value={valor.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-texto-2">CNPJ</span>
        <input className={input + " w-full"} placeholder="só números" value={valor.cnpj ?? ""} onChange={(e) => set("cnpj", e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-texto-2">Tipo</span>
        <select className={input + " w-full"} value={valor.tipo ?? "imobiliaria"} onChange={(e) => set("tipo", e.target.value)}>
          {TIPOS_ORG.map((t) => <option key={t} value={t}>{TIPO_ORG_LABEL[t]}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-texto-2">Plano</span>
        <select className={input + " w-full"} value={valor.plan_id ?? ""} onChange={(e) => set("plan_id", e.target.value)}>
          <option value="">Sem plano (cada membro no seu)</option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}{p.escopo !== "organizacao" ? " (escopo conta — não se aplica aos membros)" : ""}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-texto-2">Plano válido até</span>
        <input type="date" className={input + " w-full"} value={valor.plan_valido_ate ?? ""} onChange={(e) => set("plan_valido_ate", e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-texto-2">Região</span>
        <select className={input + " w-full"} value={valor.region_id ?? ""} onChange={(e) => set("region_id", e.target.value)}>
          <option value="">—</option>
          {regioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="block text-xs text-texto-2">Observações internas</span>
        <input className={input + " w-full"} value={valor.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
      </label>
    </div>
  );
}

export default function Organizacoes({ orgs, planos, regioes }: { orgs: OrgLinha[]; planos: Plano[]; regioes: Regiao[] }) {
  const router = useRouter();
  const [nova, setNova] = useState<Record<string, string> | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova) return;
    setOcupado(true); setErro("");
    const r = await chamar("POST", { acao: "criar", ...nova });
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setNova(null); router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!nova && (
          <button type="button" onClick={() => setNova({ tipo: "imobiliaria", plan_id: planos.find((p) => p.escopo === "organizacao")?.id ?? "" })}
            className="btn-verde px-4 py-2 text-sm">+ Nova organização</button>
        )}
      </div>

      {nova && (
        <form onSubmit={criar} className="cartao p-5 space-y-4">
          <h2 className="font-semibold text-texto">Nova organização</h2>
          <CamposOrg valor={nova} onChange={setNova} planos={planos} regioes={regioes} />
          <label className="block space-y-1">
            <span className="block text-xs text-texto-2">E-mail do administrador da organização (recebe convite)</span>
            <input type="email" className={input + " w-full sm:w-96"} value={nova.admin_email ?? ""}
              onChange={(e) => setNova({ ...nova, admin_email: e.target.value })} />
          </label>
          {erro && <p className="text-sm text-critico">{erro}</p>}
          <div className="flex gap-2">
            <button disabled={ocupado} className="btn-verde px-5 py-2 text-sm disabled:opacity-60">Criar</button>
            <button type="button" onClick={() => { setNova(null); setErro(""); }} className="btn-contorno px-5 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      <div className="cartao divide-y divide-linha">
        {orgs.map((o) => (
          <div key={o.id}>
            <button type="button" onClick={() => setAberta(aberta === o.id ? null : o.id)}
              className="w-full px-4 py-3 flex items-center gap-3 flex-wrap text-sm text-left hover:bg-superficie-2 transition">
              <span className="flex-1 min-w-52">
                <span className="block text-texto">{o.nome}{!o.ativo && <span className="text-critico"> · inativa</span>}</span>
                <span className="block text-xs text-texto-2">
                  {TIPO_ORG_LABEL[o.tipo as TipoOrg] ?? o.tipo}{o.cnpj && ` · ${formatarCnpj(o.cnpj)}`}
                  {" · "}{planos.find((p) => p.id === o.plan_id)?.nome ?? "sem plano"}
                  {o.plan_valido_ate && ` até ${dataBR(o.plan_valido_ate)}`}
                  {o.region_id && ` · ${regioes.find((r) => r.id === o.region_id)?.nome ?? ""}`}
                </span>
              </span>
              <span className="flex -space-x-2">
                {o.membros.filter((m) => m.status === "ativo").slice(0, 5).map((m) => (
                  <Avatar key={m.id} nome={m.nome ?? m.email} url={m.avatar_url} tamanho={26} className="ring-2 ring-superficie" />
                ))}
              </span>
              <span className="text-xs text-texto-2 tabular-nums">
                {o.membros.filter((m) => m.status === "ativo").length} membro(s)
                {o.membros.some((m) => m.status === "pendente") && ` · ${o.membros.filter((m) => m.status === "pendente").length} convite(s)`}
              </span>
            </button>
            {aberta === o.id && <DetalheOrg org={o} planos={planos} regioes={regioes} />}
          </div>
        ))}
        {!orgs.length && <p className="px-4 py-8 text-center text-sm text-texto-2">Nenhuma organização cadastrada.</p>}
      </div>
    </div>
  );
}

function DetalheOrg({ org, planos, regioes }: { org: OrgLinha; planos: Plano[]; regioes: Regiao[] }) {
  const router = useRouter();
  const [valor, setValor] = useState<Record<string, string>>({
    nome: org.nome, cnpj: org.cnpj ?? "", tipo: org.tipo, plan_id: org.plan_id ?? "",
    plan_valido_ate: org.plan_valido_ate ? org.plan_valido_ate.slice(0, 10) : "", region_id: org.region_id ?? "",
    observacoes: org.observacoes ?? "",
  });
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("membro");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(metodo: "POST" | "PATCH", corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true); setMsg(null);
    const r = await chamar(metodo, corpo);
    setOcupado(false);
    setMsg(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.erro });
    if (r.ok) router.refresh();
    return r.ok;
  }

  return (
    <div className="px-4 pb-5 space-y-5 bg-superficie-2/40">
      <form className="space-y-3 pt-3" onSubmit={(e) => { e.preventDefault(); rodar("PATCH", { id: org.id, ...valor }, "Organização salva."); }}>
        <CamposOrg valor={valor} onChange={setValor} planos={planos} regioes={regioes} />
        <div className="flex gap-2 flex-wrap">
          <button disabled={ocupado} className="btn-verde px-4 py-2 text-sm disabled:opacity-60">Salvar</button>
          <button type="button" disabled={ocupado} className="btn-contorno px-4 py-2 text-sm"
            onClick={() => rodar("PATCH", { id: org.id, ativo: !org.ativo }, org.ativo ? "Organização desativada." : "Organização reativada.")}>
            {org.ativo ? "Desativar" : "Reativar"}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-texto">Membros</h3>
        <ul className="divide-y divide-linha rounded-xl border border-linha bg-superficie">
          {org.membros.map((m) => (
            <li key={m.id} className="px-3 py-2 flex items-center gap-3 flex-wrap text-sm">
              <Avatar nome={m.nome ?? m.email} url={m.avatar_url} tamanho={28} />
              <span className="flex-1 min-w-48">
                <span className="block text-texto">{m.nome ?? m.email}</span>
                <span className="block text-xs text-texto-2">
                  {m.email} · {PAPEL_ORG_LABEL[m.papel_org]} · {STATUS_MEMBRO_LABEL[m.status]}
                  {m.status === "ativo" ? ` desde ${dataBR(m.aceito_em)}` : ` (convite de ${dataBR(m.convidado_em)})`}
                </span>
              </span>
              {m.status === "ativo" && (
                <button type="button" disabled={ocupado} className="text-xs text-texto-2 hover:text-texto"
                  onClick={() => rodar("POST", { acao: "papel", membro_id: m.id, papel_org: m.papel_org === "admin" ? "membro" : "admin" }, "Papel alterado.")}>
                  {m.papel_org === "admin" ? "Tornar membro" : "Tornar administrador"}
                </button>
              )}
              <button type="button" disabled={ocupado} className="text-xs text-texto-2 hover:text-critico"
                onClick={() => confirm(m.status === "pendente" ? "Cancelar o convite?" : "Remover da organização?") &&
                  rodar("POST", { acao: "remover_membro", membro_id: m.id }, "Removido.")}>
                {m.status === "pendente" ? "Cancelar convite" : "Remover"}
              </button>
            </li>
          ))}
          {!org.membros.length && <li className="px-3 py-3 text-xs text-texto-2">Nenhum membro ainda.</li>}
        </ul>
        <form className="flex gap-2 flex-wrap" onSubmit={async (e) => {
          e.preventDefault();
          if (await rodar("POST", { acao: "convidar", org_id: org.id, email, papel_org: papel }, `Convite enviado para ${email}.`)) setEmail("");
        }}>
          <input type="email" required placeholder="convidar por e-mail" className={input + " flex-1 min-w-56"} value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className={input} value={papel} onChange={(e) => setPapel(e.target.value)}>
            <option value="membro">Membro</option>
            <option value="admin">Administrador</option>
          </select>
          <button disabled={ocupado} className="btn-contorno px-4 py-2 text-sm">Convidar</button>
        </form>
        <p className="text-xs text-texto-2">O convite é aceito quando a pessoa entra com esse e-mail (ou em Minha conta).</p>
      </div>
      {msg && <p className={"text-sm " + (msg.ok ? "text-verde" : "text-critico")}>{msg.texto}</p>}
    </div>
  );
}
