import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { ADAPTADORES, type Bbox, type ResultadoFonte } from "@/lib/rural/adaptadores";
import { ipDoPedido, limitar, respostaLimite } from "@/lib/seguranca/limite";
import {
  acessoAtual, conferirRecurso, consultasAreaNoMes, registrarTentativa, respostaNegacao,
} from "@/lib/planos-servidor";
import type { FonteConsultada } from "@/components/rural/FontesLista";

/**
 * Consulta de área às fontes oficiais ao vivo — o mesmo caminho para os três
 * alvos que o mapa oferece:
 *
 *   car:<cod>    imóvel do CAR importado (desde 01/10/2026)
 *   lote:<id>    lote urbano da planta da cidade (roadmap 2.10)
 *   geo:<sha1>   área desenhada pelo usuário em qualquer ponto do Brasil (5.6)
 *
 * Cada alvo só sabe dizer QUAL é o retângulo; todo o resto é igual e mora aqui:
 * conta obrigatória, plano (`consulta_area`) com cota mensal, limite por
 * usuário, registro em `consultas_area_log` (quem, o quê, quando, IP) e cache
 * por fonte em `consultas_area` (só refaz o que venceu ou falhou).
 */

/** Resultado em cache vale por 7 dias: as bases oficiais não mudam de hora em hora. */
export const VALIDADE_CONSULTA_MS = 7 * 86_400_000;

export type AlvoConsulta = {
  chave: string;
  /** folga ao redor da área, em metros — gravada junto do cache */
  raioM: number;
  /** fontes que não fazem sentido para o alvo (o próprio CAR na consulta do CAR) */
  excluir?: string[];
  /** envelope com a folga; null = alvo não existe */
  bbox: () => Promise<Bbox | null>;
  naoEncontrado: string;
};

/** Executa a consulta (rota POST). Devolve a resposta HTTP pronta. */
export async function executarConsultaArea(request: Request, alvo: AlvoConsulta): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) {
    await registrarTentativa({ request, recurso: "consulta_area", motivo: "sem_sessao" });
    return NextResponse.json({ error: "Entre na sua conta para consultar as informações da área.", codigo: "sem_sessao" }, { status: 401 });
  }

  // planos por nicho: a consulta de área é recurso da consulta profissional e
  // tem cota mensal por plano (a básica tem umas poucas, de degustação)
  const { negacao } = await conferirRecurso(request, user, "consulta_area", { cota: "consultas_area_mes" });
  if (negacao) return respostaNegacao(negacao);

  const limite = await limitar(`consulta:${user.id}`, 20, 3600);
  if (!limite.permitido) return respostaLimite(limite, "consulta");

  const bbox = await alvo.bbox();
  if (!bbox) return NextResponse.json({ error: alvo.naoEncontrado, codigo: "nao_encontrado" }, { status: 404 });

  const admin = supabaseAdmin();
  await admin.from("consultas_area_log").insert({ user_id: user.id, chave: alvo.chave, acao: "consulta", ip: ipDoPedido(request) });

  const { data: emCache } = await admin.from("consultas_area")
    .select("fonte_id, erro, consultado_em").eq("chave", alvo.chave).eq("raio_m", alvo.raioM);
  const frescas = new Set(
    (emCache ?? [])
      .filter((c) => !c.erro && Date.now() - new Date(c.consultado_em).getTime() < VALIDADE_CONSULTA_MS)
      .map((c) => c.fonte_id)
  );
  const excluir = new Set(alvo.excluir ?? []);
  const pendentes = ADAPTADORES.filter((a) => !excluir.has(a.id) && !frescas.has(a.id));

  const resultados: ResultadoFonte[] = await Promise.all(pendentes.map((a) => a.fn(bbox)));
  for (const r of resultados) {
    await admin.from("consultas_area").upsert({
      chave: alvo.chave, fonte_id: r.fonte_id, raio_m: alvo.raioM,
      resultado: { itens: r.itens }, quantidade: r.quantidade, incide: r.incide,
      erro: r.erro ?? null, consultado_em: new Date().toISOString(),
    }, { onConflict: "chave,fonte_id,raio_m" });
  }

  return NextResponse.json({
    ok: true,
    chave: alvo.chave,
    consultadas: resultados.length,
    do_cache: frescas.size,
    falharam: resultados.filter((r) => r.erro).map((r) => r.fonte_id),
  });
}

/**
 * O que a página de uma consulta precisa mostrar: fontes (com o resultado em
 * cache, se houver), quem está olhando e o que o plano dele permite.
 */
export async function carregarConsultaArea(chave: string, opcoes: { excluir?: string[] } = {}) {
  const admin = supabaseAdmin();
  const [{ data: fontes }, { data: consultas }, user, { userId, acesso }] = await Promise.all([
    admin.from("fontes_externas").select("id, nome, orgao, prioridade, ativa, tipo, classificacao, situacao, ficha").order("prioridade"),
    admin.from("consultas_area").select("fonte_id, quantidade, raio_m, erro, consultado_em, resultado").eq("chave", chave),
    currentUser(),
    acessoAtual(),
  ]);

  const podeConsultar = acesso.recursos.has("consulta_area");
  const limiteMes = acesso.cotas.consultas_area_mes;
  const cotaRestante = podeConsultar && userId && limiteMes != null && !acesso.equipe
    ? Math.max(0, Number(limiteMes) - (await consultasAreaNoMes(userId)))
    : null;

  const excluir = new Set(opcoes.excluir ?? []);
  const porFonte = new Map((consultas ?? []).map((c) => [c.fonte_id, c]));
  const lista: FonteConsultada[] = (fontes ?? [])
    .filter((f) => f.ativa && ["wfs", "arcgis"].includes(f.tipo) && !excluir.has(f.id))
    .map((f) => ({
      id: f.id, nome: f.nome, orgao: f.orgao,
      // 3.15/3.16: classificação da base e aviso de instabilidade vêm do monitor de fontes
      classificacao: (f.classificacao as string | null) ?? null,
      situacao: (f.situacao as string | null) ?? null,
      atualizacao: ((f.ficha as { atualizacao?: string } | null)?.atualizacao) ?? null,
      consulta: (porFonte.get(f.id) as FonteConsultada["consulta"]) ?? null,
    }));
  const pendentes = (fontes ?? []).filter((f) => !f.ativa).map((f) => f.nome as string);

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  return {
    user, usuario, acesso, podeConsultar, cotaRestante, lista, pendentes,
    jaConsultou: lista.some((f) => f.consulta),
  };
}

// ---------------------------------------------------------------------------
// Área desenhada (5.6)
// ---------------------------------------------------------------------------

/** Teto da área desenhada: acima disso a consulta vira varredura de região inteira. */
export const AREA_MAX_HA = 50_000;
/** Retângulo do Brasil (com folga para as ilhas oceânicas), em graus. */
export const BBOX_BRASIL = { oeste: -74.1, sul: -34.0, leste: -28.6, norte: 5.4 } as const;
const MAX_VERTICES = 2000;

export type AreaValidada = { geometria: GeoJSON.Polygon | GeoJSON.MultiPolygon; chave: string };

/**
 * Valida o GeoJSON enviado e calcula a chave estável da área. A geometria é
 * normalizada (coordenadas com 6 casas, ~10 cm, anel fechado) antes do hash:
 * desenhar a mesma área de novo cai no mesmo cache das fontes.
 */
export async function validarAreaDesenhada(bruto: unknown): Promise<{ ok: true; area: AreaValidada } | { ok: false; erro: string }> {
  const g = (bruto && typeof bruto === "object" && "type" in bruto && (bruto as { type: string }).type === "Feature")
    ? (bruto as GeoJSON.Feature).geometry
    : bruto as GeoJSON.Geometry | null;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    return { ok: false, erro: "Desenhe um polígono (no mínimo três pontos)." };
  }
  const poligonos = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let vertices = 0;
  const arred = (n: number) => Math.round(n * 1e6) / 1e6;
  const normal: number[][][][] = [];
  for (const pol of poligonos) {
    if (!Array.isArray(pol) || !pol.length) return { ok: false, erro: "Polígono vazio." };
    const aneis: number[][][] = [];
    for (const anel of pol) {
      if (!Array.isArray(anel) || anel.length < 4) return { ok: false, erro: "O polígono precisa de pelo menos três pontos." };
      const pts: number[][] = [];
      for (const p of anel) {
        const [x, y] = p as number[];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, erro: "Coordenada inválida no desenho." };
        if (x < BBOX_BRASIL.oeste || x > BBOX_BRASIL.leste || y < BBOX_BRASIL.sul || y > BBOX_BRASIL.norte) {
          return { ok: false, erro: "A área precisa estar dentro do Brasil." };
        }
        pts.push([arred(x), arred(y)]);
      }
      const [a, b] = [pts[0], pts[pts.length - 1]];
      if (a[0] !== b[0] || a[1] !== b[1]) pts.push([...a]);
      vertices += pts.length;
      aneis.push(pts);
    }
    normal.push(aneis);
  }
  if (vertices > MAX_VERTICES) return { ok: false, erro: `Desenho com pontos demais (máximo ${MAX_VERTICES}).` };

  const turf = await import("@turf/turf");
  const geometria: GeoJSON.Polygon | GeoJSON.MultiPolygon = normal.length === 1
    ? { type: "Polygon", coordinates: normal[0] }
    : { type: "MultiPolygon", coordinates: normal };
  const ha = turf.area(geometria) / 10_000;
  if (!(ha > 0)) return { ok: false, erro: "A área desenhada tem tamanho zero." };
  if (ha > AREA_MAX_HA) {
    return { ok: false, erro: `A área tem ${Math.round(ha).toLocaleString("pt-BR")} ha; o máximo por consulta é ${AREA_MAX_HA.toLocaleString("pt-BR")} ha.` };
  }

  const chave = "geo:" + createHash("sha1").update(JSON.stringify(geometria)).digest("hex");
  return { ok: true, area: { geometria, chave } };
}
