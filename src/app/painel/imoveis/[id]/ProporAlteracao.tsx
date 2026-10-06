"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api/enviar";
import { CAMPO_REVISAO_LABEL, valorRevisao, type DadosRevisao } from "@/lib/imovel/revisao";

type Atual = {
  titulo: string; descricao: string; valor: number | null; area_declarada: number | null;
  condicoes_venda: string | null; aceita_permuta: boolean; aceita_financiamento: boolean;
};
type Pendente = { id: string; versao: number; dados: Record<string, unknown>; created_at: string } | null;

/**
 * Anúncio publicado: o anunciante não edita direto — propõe uma nova versão
 * que vai para a Matriz (Fluxograma §9). O anúncio atual continua no ar até a
 * decisão.
 */
export default function ProporAlteracao({ propertyId, atual, pendente, tipo }: {
  propertyId: string; atual: Atual; pendente: Pendente; tipo: "urbano" | "rural";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({
    titulo: atual.titulo ?? "",
    descricao: atual.descricao ?? "",
    valor: atual.valor != null ? String(atual.valor) : "",
    area_declarada: atual.area_declarada != null ? String(atual.area_declarada) : "",
    condicoes_venda: atual.condicoes_venda ?? "",
    aceita_permuta: !!atual.aceita_permuta,
    aceita_financiamento: !!atual.aceita_financiamento,
  });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const corpo: DadosRevisao = {
      titulo: form.titulo,
      descricao: form.descricao,
      valor: form.valor.trim() === "" ? null : Number(form.valor.replace(/\./g, "").replace(",", ".")),
      area_declarada: form.area_declarada.trim() === "" ? null : Number(form.area_declarada.replace(/\./g, "").replace(",", ".")),
      condicoes_venda: form.condicoes_venda || null,
      aceita_permuta: form.aceita_permuta,
      aceita_financiamento: form.aceita_financiamento,
    };
    const r = await enviarJson(`/api/imoveis/${propertyId}/revisao`, "POST", corpo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro.mensagem + (r.erro.solucao ? ` ${r.erro.solucao}` : "")); return; }
    setAberto(false);
    router.refresh();
  }

  async function cancelar() {
    if (!confirm("Cancelar a alteração proposta? O anúncio continua como está.")) return;
    setOcupado(true);
    setErro("");
    const r = await enviarJson(`/api/imoveis/${propertyId}/revisao`, "DELETE");
    setOcupado(false);
    if (!r.ok) { setErro(r.erro.mensagem); return; }
    router.refresh();
  }

  const campo = "w-full rounded-lg border border-linha bg-superficie px-3 py-2 text-sm text-texto";

  if (pendente) {
    const campos = Object.keys(pendente.dados ?? {});
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm">
          <p className="text-alerta font-medium">
            Alteração (versão {pendente.versao}) aguardando a Matriz desde {new Date(pendente.created_at).toLocaleDateString("pt-BR")}.
          </p>
          <p className="text-texto-2 text-xs mt-0.5">
            O anúncio atual continua no ar até a Arini aprovar. Se aprovada, os campos abaixo substituem os publicados.
          </p>
        </div>
        <ul className="text-sm divide-y divide-linha">
          {campos.map((c) => (
            <li key={c} className="py-1.5 flex gap-3">
              <span className="text-texto-2 w-40 shrink-0">{CAMPO_REVISAO_LABEL[c as keyof typeof CAMPO_REVISAO_LABEL] ?? c}</span>
              <span className="text-texto whitespace-pre-line">{valorRevisao(c, pendente.dados[c])}</span>
            </li>
          ))}
        </ul>
        <button type="button" disabled={ocupado} onClick={cancelar}
          className="rounded-lg border border-linha px-4 py-2 text-sm text-texto-2 hover:text-texto hover:bg-superficie-2 disabled:opacity-50">
          {ocupado ? "Cancelando…" : "Cancelar proposta"}
        </button>
        {erro && <p className="text-sm text-critico">{erro}</p>}
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-texto-2">
          Seu anúncio está publicado. Mudanças de título, descrição, valor, área ou condições passam pela Matriz
          antes de entrar no ar — enquanto isso, o anúncio atual continua visível.
        </p>
        <button type="button" onClick={() => setAberto(true)}
          className="rounded-lg bg-verde text-white px-4 py-2 text-sm font-medium hover:bg-verde-escuro">
          Propor alteração
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <label className="block text-sm">
        <span className="text-texto-2">Título</span>
        <input className={campo} value={form.titulo} maxLength={120} required minLength={3}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      </label>
      <label className="block text-sm">
        <span className="text-texto-2">Descrição</span>
        <textarea className={campo} rows={5} value={form.descricao} maxLength={5000}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-texto-2">Valor (R$)</span>
          <input className={campo} inputMode="decimal" value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="text-texto-2">Área declarada ({tipo === "rural" ? "ha" : "m²"})</span>
          <input className={campo} inputMode="decimal" value={form.area_declarada}
            onChange={(e) => setForm({ ...form, area_declarada: e.target.value })} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-texto-2">Condições de venda</span>
        <textarea className={campo} rows={3} value={form.condicoes_venda} maxLength={2000}
          onChange={(e) => setForm({ ...form, condicoes_venda: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.aceita_permuta} onChange={(e) => setForm({ ...form, aceita_permuta: e.target.checked })} />
          Aceita permuta
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.aceita_financiamento} onChange={(e) => setForm({ ...form, aceita_financiamento: e.target.checked })} />
          Aceita financiamento
        </label>
      </div>
      {erro && <p className="text-sm text-critico">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={ocupado}
          className="rounded-lg bg-verde text-white px-4 py-2 text-sm font-medium hover:bg-verde-escuro disabled:opacity-50">
          {ocupado ? "Enviando…" : "Enviar para a Matriz"}
        </button>
        <button type="button" disabled={ocupado} onClick={() => setAberto(false)}
          className="rounded-lg border border-linha px-4 py-2 text-sm text-texto-2 hover:bg-superficie-2">
          Voltar
        </button>
      </div>
      <p className="text-xs text-texto-2">
        Só os campos que mudaram entram na proposta. O anúncio publicado continua no ar até a decisão.
      </p>
    </form>
  );
}
