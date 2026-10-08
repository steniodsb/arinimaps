import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { iaConfigurada } from "@/lib/ia/config";

/**
 * GET /api/saude — o sistema está de pé? (roadmap 1.10)
 *
 * Para o monitor externo (Uptime Kuma na VPS, Better Stack, UptimeRobot…)
 * chamar a cada 1 minuto. Responde 200 quando o essencial funciona e 503
 * quando o banco ou o armazenamento caíram — o monitor só olha o código.
 *
 * Sem token: só `{ ok }` (não entrega a anatomia do sistema a quem passa).
 * Com `?token=` ou cabeçalho `x-saude-token` igual a SAUDE_TOKEN: o detalhe de
 * cada componente, com o tempo de resposta — é o que o worker usa para avisar.
 *
 * Componentes:
 *  - banco: consulta simples (crítico);
 *  - armazenamento: lista o bucket de mídia (crítico);
 *  - tiles: gera um tile do CAR na região piloto;
 *  - worker: fila parada há mais de 30 min = worker caído;
 *  - fontes: quantas fontes oficiais estão instáveis (3 falhas seguidas);
 *  - ia: chave configurada (aviso, não falha).
 */
export const dynamic = "force-dynamic";

type Item = { ok: boolean; ms?: number; detalhe?: string };

async function medir(fn: () => Promise<string | void>): Promise<Item> {
  const t0 = Date.now();
  try {
    const detalhe = await Promise.race([
      fn(),
      new Promise<never>((_, falha) => setTimeout(() => falha(new Error("sem resposta em 8 s")), 8000)),
    ]);
    return { ok: true, ms: Date.now() - t0, ...(detalhe ? { detalhe } : {}) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detalhe: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: Request) {
  const admin = supabaseAdmin();
  const [banco, armazenamento, tiles, worker, fontes] = await Promise.all([
    medir(async () => {
      const { error } = await admin.from("settings").select("chave").limit(1);
      if (error) throw new Error(error.message);
    }),
    medir(async () => {
      const { error } = await admin.storage.from("media").list("", { limit: 1 });
      if (error) throw new Error(error.message);
    }),
    medir(async () => {
      const { error } = await admin.rpc("fn_tile_car", { z: 12, x: 1476, y: 2277 });
      if (error) throw new Error(error.message);
    }),
    medir(async () => {
      // job pendente há mais de 30 min = ninguém está processando a fila
      const corte = new Date(Date.now() - 30 * 60_000).toISOString();
      const { count, error } = await admin.from("jobs").select("id", { count: "exact", head: true })
        .eq("status", "pendente").lt("created_at", corte);
      if (error) throw new Error(error.message);
      if (count) throw new Error(`${count} tarefa(s) esperando há mais de 30 min — o worker parou?`);
    }),
    medir(async () => {
      // situação mantida pelo job verificar_fontes (3 falhas seguidas = instável)
      const { data, error } = await admin.from("fontes_externas").select("nome, situacao").eq("ativa", true);
      if (error) return "sem dados de saúde das fontes";
      const instaveis = (data ?? []).filter((f) => f.situacao && f.situacao !== "ok");
      if (instaveis.length) return `${instaveis.length} fonte(s) instável(is): ${instaveis.map((f) => f.nome).join(", ")}`;
    }),
  ]);
  const ia: Item = { ok: true, detalhe: iaConfigurada() ? "chave configurada" : "sem ANTHROPIC_API_KEY (assistente desligado)" };

  const ok = banco.ok && armazenamento.ok;
  const url = new URL(request.url);
  const token = request.headers.get("x-saude-token") ?? url.searchParams.get("token");
  const detalhado = !!process.env.SAUDE_TOKEN && token === process.env.SAUDE_TOKEN;
  return NextResponse.json(
    detalhado
      ? { ok, em: new Date().toISOString(), componentes: { banco, armazenamento, tiles, worker, fontes, ia } }
      : { ok },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
