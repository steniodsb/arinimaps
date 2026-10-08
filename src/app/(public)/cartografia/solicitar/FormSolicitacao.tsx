"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, CircleCheck, Info, Paperclip, Send, X } from "lucide-react";
import { CAMPO, ROTULO } from "@/components/ui/Pagina";
import type { GeometriaEscolhida } from "@/components/map/DesenhoMapa";
import type { ErroApi } from "@/lib/api/enviar";
import {
  ARQUIVOS_ACEITOS, TIPO_SOLICITACAO_LABEL, TIPOS_SOLICITACAO, tamanhoLegivel, type TipoSolicitacao,
} from "@/lib/cartografia/solicitacoes";

const DesenhoMapa = dynamic(() => import("@/components/map/DesenhoMapa"), { ssr: false });

type Props = {
  tipoInicial: TipoSolicitacao;
  /** onde o usuário estava no mapa quando clicou em "Não encontrei meu imóvel" */
  centro: { lng: number; lat: number; zoom: number } | null;
  /** área do CAR ou lote clicado no mapa, já resolvida no servidor */
  referencia: { codigo: string; rotulo: string; geometry: GeoJSON.Geometry; fonte: "car" | "lote" } | null;
  municipios: { id: string; nome: string }[];
  municipioInicial: string;
  imovel: { id: string; codigo: string; titulo: string } | null;
};

/**
 * O DesenhoMapa só enquadra o que recebe em `inicial`; não tem prop de centro.
 * Para abrir o mapa onde o usuário estava, mandamos uma geometria invisível
 * (duas linhas de comprimento zero nos cantos da vista) — o mapa enquadra e
 * nada aparece desenhado. O tamanho da caixa segue o zoom pedido.
 */
function geometriaDeEnquadramento(c: { lng: number; lat: number; zoom: number }): GeometriaEscolhida {
  const metrosPorPixel = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** c.zoom;
  const meiaLargura = 150 * metrosPorPixel; // ~300 px de caixa: o fitBounds devolve um zoom parecido
  const dLng = meiaLargura / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const dLat = meiaLargura / 110574;
  const a: [number, number] = [c.lng - dLng, c.lat - dLat];
  const b: [number, number] = [c.lng + dLng, c.lat + dLat];
  return { geometry: { type: "MultiLineString", coordinates: [[a, a], [b, b]] }, fonte: "desenho" };
}

export default function FormSolicitacao({ tipoInicial, centro, referencia, municipios, municipioInicial, imovel }: Props) {
  const [tipo, setTipo] = useState<TipoSolicitacao>(tipoInicial);
  const [municipio, setMunicipio] = useState(municipioInicial);
  const [descricao, setDescricao] = useState("");
  const [geometria, setGeometria] = useState<GeometriaEscolhida | null>(
    referencia ? { geometry: referencia.geometry, fonte: referencia.fonte } : null
  );
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [resultado, setResultado] = useState<{ id: string; protocolo: string; falharam: string[] } | null>(null);

  const inicial = useMemo<GeometriaEscolhida | null>(() => {
    if (referencia) return { geometry: referencia.geometry, fonte: referencia.fonte };
    if (centro) return geometriaDeEnquadramento(centro);
    return null;
  }, [referencia, centro]);

  const input = CAMPO;
  const label = ROTULO;
  const totalBytes = arquivos.reduce((s, f) => s + f.size, 0);

  function escolherArquivos(lista: FileList | null) {
    const novos = Array.from(lista ?? []);
    setArquivos((atuais) => [...atuais, ...novos].slice(0, ARQUIVOS_ACEITOS.maxQuantidade));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const grande = arquivos.find((f) => f.size > ARQUIVOS_ACEITOS.maxBytes);
    if (grande) {
      setErro({ status: 0, codigo: "arquivo_grande", mensagem: `O arquivo ${grande.name} passa de ${ARQUIVOS_ACEITOS.maxMB} MB.`, solucao: "Envie uma versão menor ou comprimida." });
      return;
    }
    const temLocal = !!geometria || !!referencia || !!centro;
    if (!temLocal && !arquivos.length) {
      setErro({ status: 0, codigo: "sem_localizacao", mensagem: "Indique onde fica o imóvel.", solucao: "Marque um ponto ou desenhe a área no mapa, ou anexe um KML/PDF." });
      return;
    }
    if (descricao.trim().length < 10 && !(tipo === "inclusao" && geometria)) {
      setErro({ status: 0, codigo: "descricao_curta", mensagem: "Descreva o que está errado ou faltando no mapa.", solucao: "Uma frase basta — o que você esperava ver e o que aparece." });
      return;
    }
    setEnviando(true);

    // sem desenho, mas veio do mapa: o centro da vista é o ponto aproximado
    const ponto = !geometria && centro ? { lng: centro.lng, lat: centro.lat } : null;
    const fd = new FormData();
    fd.set("dados", JSON.stringify({
      tipo, descricao: descricao.trim(),
      municipality_id: municipio || null,
      referencia: referencia?.codigo ?? null,
      property_id: imovel?.id ?? null,
      ponto,
      // a divisa do CAR/lote vai pela referência; o servidor busca no banco
      geometria: geometria && geometria.fonte !== "car" && geometria.fonte !== "lote" ? geometria.geometry : null,
    }));
    for (const f of arquivos) fd.append("arquivos", f);

    let res: Response;
    try {
      res = await fetch("/api/cartografia/solicitacoes", { method: "POST", body: fd });
    } catch {
      setErro({ status: 0, codigo: "sem_resposta", mensagem: "O servidor não respondeu.", solucao: "Confira a internet e tente de novo." });
      setEnviando(false);
      return;
    }
    const texto = await res.text();
    let corpo: Record<string, unknown> = {};
    try { corpo = texto ? JSON.parse(texto) : {}; } catch { corpo = {}; }
    setEnviando(false);
    if (!res.ok) {
      setErro({
        status: res.status, codigo: String(corpo.codigo ?? `erro_${res.status}`),
        mensagem: typeof corpo.error === "string" ? corpo.error : `O servidor respondeu ${res.status}.`,
        motivo: typeof corpo.motivo === "string" ? corpo.motivo : undefined,
        solucao: typeof corpo.solucao === "string" ? corpo.solucao : undefined,
      });
      return;
    }
    setResultado({
      id: String(corpo.id), protocolo: String(corpo.protocolo),
      falharam: Array.isArray(corpo.arquivos_falharam) ? (corpo.arquivos_falharam as string[]) : [],
    });
  }

  if (resultado) {
    return (
      <div className="cartao space-y-5 p-6 md:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-verde/12 text-verde">
          <CircleCheck className="size-6" />
        </span>
        <p className="lp-eyebrow !text-xs">Solicitação aberta</p>
        <p className="font-mono text-3xl font-bold text-texto md:text-4xl">{resultado.protocolo}</p>
        <p className="text-base leading-relaxed text-texto-2">
          Guarde este protocolo. A equipe de cartografia faz a triagem, analisa e, se for o caso, vetoriza ou
          corrige o mapa. Você recebe um e-mail a cada etapa importante e acompanha tudo em Mapa: solicitações.
        </p>
        {resultado.falharam.length > 0 && (
          <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta">
            Não conseguimos salvar: {resultado.falharam.join(", ")}. Você pode reenviar pela página da solicitação quando
            a equipe pedir documentação.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/painel/cartografia/${resultado.id}`} className="lp-btn lp-btn-verde !px-5 !py-3 text-[0.95rem]">Ver a solicitação <ArrowRight /></Link>
          <Link href="/painel/cartografia" className="lp-btn lp-btn-contorno !px-5 !py-3 text-[0.95rem]">Minhas solicitações</Link>
          <Link href="/mapa" className="lp-btn lp-btn-contorno !px-5 !py-3 text-[0.95rem]">Voltar ao mapa</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao space-y-6 p-6 md:p-8">
      {imovel && (
        <p className="rounded-xl border border-ouro/30 bg-ouro/10 px-4 py-3 text-sm text-texto">
          Sobre o imóvel <span className="font-mono">{imovel.codigo}</span> · {imovel.titulo}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label}>O que está acontecendo? *</label>
          <select className={input} value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitacao)}>
            {TIPOS_SOLICITACAO.map((t) => <option key={t} value={t}>{TIPO_SOLICITACAO_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Município</label>
          <select className={input} value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
            <option value="">Não sei / detectar pelo mapa</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Descreva o problema{tipo === "inclusao" ? "" : " *"}</label>
        <textarea rows={4} className={input} value={descricao} onChange={(e) => setDescricao(e.target.value)}
          placeholder={tipo === "inclusao"
            ? "Nome da propriedade, acesso, matrícula, vizinhos — o que ajudar a equipe a localizar."
            : "O que você esperava ver e o que aparece no mapa. Ex.: a divisa norte avança sobre a estrada; a área correta é 48 ha."} />
      </div>

      <div>
        <label className={label}>Indique a área</label>
        {referencia && (
          <p className="mb-3 rounded-xl border border-ouro/30 bg-ouro/10 px-4 py-3 text-sm text-texto">{referencia.rotulo}</p>
        )}
        {!referencia && centro && (
          <p className="mb-3 flex gap-2 text-sm leading-relaxed text-texto-2">
            <Info className="mt-0.5 size-4 shrink-0 text-verde" />
            O mapa abre onde você estava. Marque o ponto do imóvel ou desenhe a divisa; se não marcar nada, enviamos a
            posição aproximada da sua vista.
          </p>
        )}
        <div className="overflow-hidden rounded-[20px] border border-linha">
          <DesenhoMapa onChange={setGeometria} inicial={inicial} />
        </div>
        {geometria && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-verde">
            <CircleCheck className="size-4" />
            {geometria.fonte === "ponto" ? "Ponto marcado." : geometria.fonte === "car" ? "Área do CAR selecionada."
              : geometria.fonte === "lote" ? "Lote da planta selecionado." : geometria.fonte === "desenho" ? "Área desenhada."
              : `Área importada do arquivo ${geometria.fonte.toUpperCase()}.`}
          </p>
        )}
      </div>

      <div>
        <label className={label}>Anexos (opcional)</label>
        <input type="file" multiple accept={ARQUIVOS_ACEITOS.accept} className={input + " file:mr-3 file:rounded-lg file:border-0 file:bg-verde/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-verde"} onChange={(e) => { escolherArquivos(e.target.files); e.target.value = ""; }} />
        <p className="mt-1.5 text-xs text-texto-2">{ARQUIVOS_ACEITOS.descricao} Matrícula, planta, croqui ou foto da placa ajudam na análise.</p>
        {arquivos.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {arquivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-linha bg-superficie-2 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2 truncate text-texto"><Paperclip className="size-4 shrink-0 text-texto-2" />{f.name} <span className="text-texto-2">· {tamanhoLegivel(f.size)}</span></span>
                <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-critico hover:underline"
                  onClick={() => setArquivos((atuais) => atuais.filter((_, j) => j !== i))}><X className="size-3.5" /> remover</button>
              </li>
            ))}
            <li className="px-4 text-xs text-texto-2">{arquivos.length} arquivo(s) · {tamanhoLegivel(totalBytes)}</li>
          </ul>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-linha bg-superficie-2 p-4 text-sm leading-relaxed text-texto-2">
        <input type="checkbox" required checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--verde)]" />
        <span>
          Entendo que <strong className="text-texto">a geometria informada não é oficial até a validação da Matriz</strong>:
          o ponto, a área ou os arquivos que envio servem de indicação para a equipe de cartografia, que confere nas fontes
          oficiais antes de qualquer correção no mapa.
        </span>
      </label>

      {erro && (
        <div className="space-y-0.5 rounded-xl border border-critico/40 bg-critico/10 px-4 py-3 text-sm">
          <p className="text-critico font-medium">{erro.mensagem}</p>
          {erro.motivo && <p className="text-texto-2">{erro.motivo}</p>}
          {erro.solucao && <p className="text-texto">{erro.solucao}</p>}
          {erro.status === 401 && <Link href="/entrar" className="text-verde hover:underline">Entrar de novo</Link>}
        </div>
      )}

      <button disabled={enviando} className="lp-btn lp-btn-verde disabled:opacity-60">
        {enviando ? "Enviando…" : <>Abrir solicitação <Send /></>}
      </button>
    </form>
  );
}
