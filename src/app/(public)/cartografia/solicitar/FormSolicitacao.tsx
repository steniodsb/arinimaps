"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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

  const input = "w-full rounded-lg cartao px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verde";
  const label = "block text-sm font-medium text-texto mb-1";
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
      <div className="cartao p-6 space-y-4">
        <p className="text-[10px] tracking-[0.22em] uppercase text-ouro">Solicitação aberta</p>
        <p className="text-3xl font-semibold font-mono text-texto">{resultado.protocolo}</p>
        <p className="text-sm text-texto-2">
          Guarde este protocolo. A equipe de cartografia faz a triagem, analisa e, se for o caso, vetoriza ou
          corrige o mapa. Você recebe um e-mail a cada etapa importante e acompanha tudo em Mapa: solicitações.
        </p>
        {resultado.falharam.length > 0 && (
          <p className="text-sm rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-alerta">
            Não conseguimos salvar: {resultado.falharam.join(", ")}. Você pode reenviar pela página da solicitação quando
            a equipe pedir documentação.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/painel/cartografia/${resultado.id}`} className="btn-verde px-5 py-2.5 text-sm">Ver a solicitação</Link>
          <Link href="/painel/cartografia" className="btn-contorno px-5 py-2.5 text-sm">Minhas solicitações</Link>
          <Link href="/mapa" className="btn-contorno px-5 py-2.5 text-sm">Voltar ao mapa</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      {imovel && (
        <p className="text-xs rounded-lg bg-ouro/10 border border-ouro/30 px-3 py-2 text-texto">
          Sobre o imóvel <span className="font-mono">{imovel.codigo}</span> · {imovel.titulo}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
          <p className="text-xs rounded-lg bg-ouro/10 border border-ouro/30 px-3 py-2 mb-2 text-texto">{referencia.rotulo}</p>
        )}
        {!referencia && centro && (
          <p className="text-xs text-texto-2 mb-2">
            O mapa abre onde você estava. Marque o ponto do imóvel ou desenhe a divisa; se não marcar nada, enviamos a
            posição aproximada da sua vista.
          </p>
        )}
        <DesenhoMapa onChange={setGeometria} inicial={inicial} />
        {geometria && (
          <p className="text-xs text-verde font-medium mt-1">
            {geometria.fonte === "ponto" ? "Ponto marcado." : geometria.fonte === "car" ? "Área do CAR selecionada."
              : geometria.fonte === "lote" ? "Lote da planta selecionado." : geometria.fonte === "desenho" ? "Área desenhada."
              : `Área importada do arquivo ${geometria.fonte.toUpperCase()}.`}
          </p>
        )}
      </div>

      <div>
        <label className={label}>Anexos (opcional)</label>
        <input type="file" multiple accept={ARQUIVOS_ACEITOS.accept} className={input} onChange={(e) => { escolherArquivos(e.target.files); e.target.value = ""; }} />
        <p className="text-xs text-texto-2 mt-1">{ARQUIVOS_ACEITOS.descricao} Matrícula, planta, croqui ou foto da placa ajudam na análise.</p>
        {arquivos.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {arquivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-1.5">
                <span className="text-texto truncate">{f.name} <span className="text-texto-2">· {tamanhoLegivel(f.size)}</span></span>
                <button type="button" className="text-critico hover:underline shrink-0"
                  onClick={() => setArquivos((atuais) => atuais.filter((_, j) => j !== i))}>remover</button>
              </li>
            ))}
            <li className="text-texto-2 px-3">{arquivos.length} arquivo(s) · {tamanhoLegivel(totalBytes)}</li>
          </ul>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-texto-2 cartao p-4">
        <input type="checkbox" required checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
        <span>
          Entendo que <strong className="text-texto">a geometria informada não é oficial até a validação da Matriz</strong>:
          o ponto, a área ou os arquivos que envio servem de indicação para a equipe de cartografia, que confere nas fontes
          oficiais antes de qualquer correção no mapa.
        </span>
      </label>

      {erro && (
        <div className="rounded-lg border border-critico/40 bg-critico/10 px-4 py-3 text-sm space-y-0.5">
          <p className="text-critico font-medium">{erro.mensagem}</p>
          {erro.motivo && <p className="text-texto-2">{erro.motivo}</p>}
          {erro.solucao && <p className="text-texto">{erro.solucao}</p>}
          {erro.status === 401 && <Link href="/entrar" className="text-verde hover:underline">Entrar de novo</Link>}
        </div>
      )}

      <button disabled={enviando} className="btn-verde px-6 py-2.5 text-sm disabled:opacity-60">
        {enviando ? "Enviando…" : "Abrir solicitação"}
      </button>
    </form>
  );
}
