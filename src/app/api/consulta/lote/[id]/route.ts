import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Bbox } from "@/lib/rural/adaptadores";
import { executarConsultaArea } from "@/lib/geo/consultaArea";
import { buscarPoisAoRedor } from "@/lib/overpass";

export const maxDuration = 120;

/**
 * "Consultar informações" do lote urbano (roadmap 2.10) — o mesmo cruzamento
 * da consulta do CAR, com o retângulo do lote e 500 m de folga (no urbano o que
 * interessa é o entorno imediato: APP de córrego, linha de transmissão,
 * processo minerário). Aproveita a chamada para atualizar o cache de pontos de
 * interesse ao redor do lote, que a página mostra com a distância.
 */
const RAIO_LOTE_M = 500;

export async function POST(request: Request, ctx: RouteContext<"/api/consulta/lote/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Lote inválido.", codigo: "lote_invalido" }, { status: 400 });

  let centro: { lng: number; lat: number } | null = null;
  const resposta = await executarConsultaArea(request, {
    chave: `lote:${id}`,
    raioM: RAIO_LOTE_M,
    naoEncontrado: "Lote não encontrado. A planta pode ter sido atualizada — clique de novo no lote no mapa.",
    bbox: async () => {
      const { data } = await supabaseAdmin().rpc("fn_lote_bbox", { p_id: id, p_buffer_m: RAIO_LOTE_M });
      const b = (data as Bbox | null) ?? null;
      if (b) centro = { lng: b.lng, lat: b.lat };
      return b;
    },
  });
  // POIs só quando a consulta passou (plano, cota e limite já conferidos)
  const c = centro as { lng: number; lat: number } | null;
  if (resposta.ok && c) await buscarPoisAoRedor(c.lng, c.lat, 4000).catch(() => 0);
  return resposta;
}
