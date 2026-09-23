"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { GeometriaEscolhida } from "@/components/map/DesenhoMapa";

const DesenhoMapa = dynamic(() => import("@/components/map/DesenhoMapa"), { ssr: false });

type Municipio = { id: string; nome: string };
type Condicao = "autorizacao" | "exclusividade" | "parceiro";

const EQUIPE_ARINI = ["admin_central", "analista_arini"];
const PARCEIROS = ["corretor", "imobiliaria", "engenheiro"];

export default function NovoImovel() {
  const router = useRouter();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [geometria, setGeometria] = useState<GeometriaEscolhida | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    tipo: "rural", titulo: "", descricao: "", valor: "", area_declarada: "",
    municipality_id: "", condicoes_venda: "", parent_codigo: "",
    aceita_permuta: false, aceita_financiamento: false,
  });
  const [papel, setPapel] = useState<string | null>(null);
  const [condicao, setCondicao] = useState<Condicao>("autorizacao");
  const [aceite, setAceite] = useState(false);
  const ehParceiro = !!papel && PARCEIROS.includes(papel);
  const ehEquipe = !!papel && EQUIPE_ARINI.includes(papel);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
      setPapel(data?.role ?? null);
      if (data?.role && PARCEIROS.includes(data.role)) setCondicao("parceiro");
    });
  }, []);

  useEffect(() => {
    fetch("/api/geo/municipios")
      .then((r) => r.json())
      .then((fc) =>
        setMunicipios(
          (fc.features ?? [])
            .map((f: { properties: Municipio }) => f.properties)
            .sort((a: Municipio, b: Municipio) => a.nome.localeCompare(b.nome))
        )
      )
      .catch(() => undefined);
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!geometria) {
      setErro("Marque a localização do imóvel no mapa (desenho, ponto ou KML).");
      return;
    }
    setEnviando(true);

    const fd = new FormData();
    fd.set("dados", JSON.stringify({
      ...form,
      valor: form.valor ? Number(form.valor.replace(/\./g, "").replace(",", ".")) : null,
      area_declarada: form.area_declarada ? Number(form.area_declarada.replace(",", ".")) : null,
      municipality_id: form.municipality_id || null,
      caracteristicas: { unidade_area: form.tipo === "rural" ? "ha" : "m2" },
      condicao,
      aceite_termos: aceite,
    }));
    fd.set("geometria", JSON.stringify(geometria));
    for (const f of fotos) fd.append("fotos", f);

    const res = await fetch("/api/imoveis", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error ?? "Não foi possível enviar o imóvel.");
      setEnviando(false);
      return;
    }
    router.push("/painel?enviado=" + data.codigo);
    router.refresh();
  }

  const input = "w-full rounded-lg cartao px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";
  const label = "block text-sm font-medium text-texto mb-1";

  return (
    <form onSubmit={enviar} className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-texto">Anunciar imóvel</h1>
        <p className="text-sm text-texto-2">
          Preencha os dados e marque a localização. O imóvel vai para a análise da Arini antes de publicar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Tipo</label>
          <select className={input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="rural">Rural (fazenda, sítio, chácara)</option>
            <option value="urbano">Urbano (casa, lote, comercial)</option>
          </select>
        </div>
        <div>
          <label className={label}>Município</label>
          <select className={input} value={form.municipality_id}
            onChange={(e) => setForm({ ...form, municipality_id: e.target.value })}>
            <option value="">Detectar pelo mapa</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Título do anúncio</label>
        <input required className={input} placeholder='Ex.: "Fazenda dupla aptidão às margens da BR-364"'
          value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      </div>

      <div>
        <label className={label}>Descrição</label>
        <textarea rows={5} className={input}
          placeholder="Benfeitorias, água, acesso, documentação, detalhes que valorizam o imóvel…"
          value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Valor pedido (R$)</label>
          <input className={input} placeholder="Ex.: 3.800.000" inputMode="numeric"
            value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        </div>
        <div>
          <label className={label}>Área declarada ({form.tipo === "rural" ? "hectares" : "m²"})</label>
          <input className={input} placeholder={form.tipo === "rural" ? "Ex.: 84" : "Ex.: 420"} inputMode="decimal"
            value={form.area_declarada} onChange={(e) => setForm({ ...form, area_declarada: e.target.value })} />
        </div>
      </div>

      <div>
        <label className={label}>Localização no mapa</label>
        <DesenhoMapa onChange={setGeometria} />
        {geometria && (
          <p className="text-xs text-verde font-medium mt-1">
            Geometria definida ({geometria.fonte === "ponto" ? "ponto" : geometria.fonte === "desenho" ? "desenho" : "arquivo " + geometria.fonte.toUpperCase()}).
          </p>
        )}
      </div>

      <div>
        <label className={label}>Fotos (até 20)</label>
        <input type="file" accept="image/*" multiple className={input}
          onChange={(e) => setFotos(Array.from(e.target.files ?? []).slice(0, 20))} />
        {fotos.length > 0 && <p className="text-xs text-texto-2 mt-1">{fotos.length} foto(s) selecionada(s). A primeira vira capa.</p>}
      </div>

      {form.tipo === "urbano" && (
        <div>
          <label className={label}>Faz parte de um empreendimento? (opcional)</label>
          <input className={input} placeholder="Código do imóvel principal — ex.: ARINI-MAP-000010"
            value={form.parent_codigo} onChange={(e) => setForm({ ...form, parent_codigo: e.target.value })} />
          <p className="text-xs text-texto-2 mt-0.5">
            Para apartamentos em bloco ou lotes de um loteamento: cadastre o empreendimento uma vez e
            aponte cada unidade para ele — a página do empreendimento lista todas as unidades à venda.
          </p>
        </div>
      )}

      <div>
        <label className={label}>Condições de venda</label>
        <textarea rows={2} className={input} placeholder="Entrada, parcelamento, prazo…"
          value={form.condicoes_venda} onChange={(e) => setForm({ ...form, condicoes_venda: e.target.value })} />
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          {([["aceita_permuta", "Aceita permuta"], ["aceita_financiamento", "Aceita financiamento"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
              {l}
            </label>
          ))}
        </div>
      </div>

      <fieldset className="cartao p-4 space-y-3">
        <legend className="text-sm font-medium text-texto px-1">Condição de comercialização *</legend>
        {ehParceiro ? (
          <p className="text-sm text-texto-2">
            Imóvel de parceiro: a autorização do proprietário é com você, e a Arini intermedia os
            interessados que chegam pela plataforma, conforme o{" "}
            <Link href="/termos/parceiros" target="_blank" className="text-verde underline">Termo de Parceria</Link>.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["autorizacao", "Autorização de venda", "Sem exclusividade: você pode vender por conta própria a quem a Arini não apresentou."],
              ["exclusividade", "Exclusividade Arini", "Só a Arini (e parceiros indicados por ela) intermedia durante o prazo, com compromissos de prazo de atendimento."],
            ] as const).map(([v, t, d]) => (
              <label key={v}
                className={"rounded-lg border p-3 text-sm cursor-pointer transition " +
                  (condicao === v ? "border-verde bg-verde/5" : "border-linha")}>
                <span className="flex items-center gap-2 font-medium text-texto">
                  <input type="radio" name="condicao" checked={condicao === v} onChange={() => setCondicao(v)} />
                  {t}
                </span>
                <span className="block text-xs text-texto-2 mt-1">{d}</span>
              </label>
            ))}
          </div>
        )}

        {ehEquipe ? (
          <p className="text-xs text-texto-2">
            Cadastro feito pela equipe Arini: não há aceite eletrônico do proprietário. Anexe a
            autorização assinada em Documentos, na análise do imóvel.
          </p>
        ) : (
          <label className="flex items-start gap-2 text-xs text-texto-2">
            <input type="checkbox" required checked={aceite}
              onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
            <span>
              {ehParceiro ? (
                <>Declaro ter autorização escrita do proprietário para anunciar este imóvel, no preço e nas
                condições acima, e aceito o{" "}
                <Link href="/termos/parceiros" target="_blank" className="text-verde underline">Termo de Parceria</Link></>
              ) : (
                <>Declaro ser proprietário (ou ter poderes para vender) e aceito o{" "}
                <Link href="/termos/autorizacao" target="_blank" className="text-verde underline">Termo de Autorização de Venda</Link>
                {condicao === "exclusividade" && <>, o{" "}
                  <Link href="/termos/exclusividade" target="_blank" className="text-verde underline">Termo de Exclusividade</Link>
                </>}</>
              )}
              {" "}e a{" "}
              <Link href="/termos/remuneracao" target="_blank" className="text-verde underline">Regra de Remuneração</Link>.
            </span>
          </label>
        )}
      </fieldset>

      {erro && <p className="text-sm text-critico">{erro}</p>}

      <button disabled={enviando}
        className="rounded-lg bg-verde text-white font-semibold px-6 py-2.5 hover:bg-verde-escuro disabled:opacity-60">
        {enviando ? "Enviando…" : "Enviar para análise da Arini"}
      </button>
    </form>
  );
}
