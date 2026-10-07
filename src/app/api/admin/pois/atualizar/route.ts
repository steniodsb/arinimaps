import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator, temSetor } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
import { buscarEVincularPois } from "@/lib/overpass";

/**
 * Atualização periódica dos pontos de interesse (roadmap 2.12).
 *
 * O OpenStreetMap muda: posto que abre, escola que fecha, rodovia nova. Os POIs
 * de cada anúncio eram buscados uma vez, na publicação, e nunca mais. Esta rota
 * põe na fila (`jobs`, tipo `refresh_pois`, processado pelo worker com o mesmo
 * código do `fetch_pois`) os anúncios ativos cujos POIs têm mais de
 * `poi_atualizar_dias` dias (Configurações › Mapa; padrão 90).
 *
 *   POST {}                          → enfileira os vencidos (até `limite`, padrão 200)
 *   POST { "property_id": "<uuid>" } → atualiza aquele imóvel agora, sem fila
 *
 * Feita para ser chamada por um agendador (cron) ou pelo botão da equipe de
 * cartografia. Só setor Cartografia.
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) {
    return falha(403, "sem_permissao", "Restrito à equipe de cartografia da Arini.", {
      solucao: "Entre com uma conta da Arini que atue no setor Cartografia.",
    });
  }
  const body = (await request.json().catch(() => ({}))) as { property_id?: string; limite?: number };
  const admin = supabaseAdmin();

  if (body.property_id) {
    if (!/^[0-9a-f-]{36}$/i.test(body.property_id)) {
      return falha(400, "imovel_invalido", "Identificador de imóvel inválido.");
    }
    const n = await buscarEVincularPois(body.property_id);
    await logAudit({ user_id: a.userId, acao: "pois_atualizar", entidade: "properties", entidade_id: body.property_id,
      property_id: body.property_id, dados_depois: { vinculados: n } });
    return NextResponse.json({ ok: true, imediato: true, vinculados: n });
  }

  const { data: cfg } = await admin.from("settings").select("valor").eq("chave", "poi_atualizar_dias").maybeSingle();
  const dias = Math.max(1, Math.min(3650, Number(cfg?.valor ?? 90) || 90));
  const limite = Math.max(1, Math.min(1000, Number(body.limite ?? 200) || 200));
  const { data, error } = await admin.rpc("fn_enfileirar_refresh_pois", { p_dias: dias, p_limite: limite });
  if (error) return falhaBanco("pois_fila", error);

  await logAudit({ user_id: a.userId, acao: "pois_enfileirar", entidade: "jobs", dados_depois: { dias, limite, enfileirados: data } });
  return NextResponse.json({ ok: true, dias, enfileirados: Number(data ?? 0) });
}
