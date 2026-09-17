import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";

/**
 * Calibração da planta: deslocamento em metros, giro, escala, camadas do CAD
 * visíveis, opacidade e faixa de zoom. Cada limite abaixo tem motivo:
 * calibração não é lugar de mover a planta para outra cidade nem de espremer o
 * desenho até ele deixar de ser a planta — quando o número foge da faixa, o
 * problema é o arquivo, não o ajuste.
 */
const LIMITES = {
  offset: 5_000,     // 5 km: acima disso não é erro de datum, é planta errada
  rotacao: 45,       // planta de cidade não vem girada meia-volta
  escalaMin: 0.5,
  escalaMax: 2,
};

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/cartografia/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (!a?.ehArini) {
    return falha(403, "sem_permissao", "Restrito à equipe da Arini.", {
      solucao: "Entre com uma conta da Arini para calibrar a cartografia.",
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return falha(400, "corpo_invalido", "O pedido chegou sem dados.", {
      motivo: "O corpo da requisição não é JSON válido.",
      solucao: "Recarregue a página e tente de novo.",
    });
  }

  const patch: Record<string, unknown> = {};
  const fora: string[] = [];
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

  const leste = num(body.offset_leste_m);
  if (leste !== null) {
    if (Math.abs(leste) > LIMITES.offset) fora.push(`deslocamento leste de ${leste.toFixed(0)} m (limite ${LIMITES.offset} m)`);
    else patch.offset_leste_m = leste;
  }
  const norte = num(body.offset_norte_m);
  if (norte !== null) {
    if (Math.abs(norte) > LIMITES.offset) fora.push(`deslocamento norte de ${norte.toFixed(0)} m (limite ${LIMITES.offset} m)`);
    else patch.offset_norte_m = norte;
  }
  const rot = num(body.rotacao_graus);
  if (rot !== null) {
    if (Math.abs(rot) > LIMITES.rotacao) fora.push(`giro de ${rot.toFixed(2)}° (limite ${LIMITES.rotacao}°)`);
    else patch.rotacao_graus = rot;
  }
  const esc = num(body.escala);
  if (esc !== null) {
    if (esc < LIMITES.escalaMin || esc > LIMITES.escalaMax) fora.push(`escala ${esc.toFixed(3)}× (faixa ${LIMITES.escalaMin}–${LIMITES.escalaMax})`);
    else patch.escala = esc;
  }
  const op = num(body.opacidade);
  if (op !== null) patch.opacidade_padrao = Math.min(1, Math.max(0.05, op));
  const mz = num(body.min_zoom);
  if (mz !== null) patch.min_zoom = Math.min(18, Math.max(0, Math.round(mz)));
  if (Array.isArray(body.layers_ocultos)) {
    patch.layers_ocultos = body.layers_ocultos.map(String).slice(0, 500);
  }
  if (Array.isArray(body.pontos_controle)) {
    patch.pontos_controle = body.pontos_controle.slice(0, 20);
  }
  if (typeof body.datum === "string" && ["sirgas", "sad69", "corrego"].includes(body.datum)) {
    patch.datum = body.datum;
  }

  if (fora.length) {
    return falha(400, "ajuste_fora_da_faixa", "O ajuste pedido está fora do que a calibração aceita.", {
      motivo: fora.join("; ") + ".",
      solucao: "Um desvio dessa ordem quase sempre é zona UTM ou município errado no envio — reenvie a planta em vez de forçar o ajuste.",
      detalhes: { limites: LIMITES },
    });
  }
  if (!Object.keys(patch).length) {
    return falha(400, "nada_para_ajustar", "Nenhum valor válido chegou para ajustar.", {
      motivo: "O pedido não trouxe deslocamento, giro, escala, opacidade nem seleção de camadas.",
      solucao: "Mova a planta ou marque as camadas antes de salvar.",
    });
  }

  const admin = supabaseAdmin();
  const { data: antes } = await admin.from("cartography_layers")
    .select("nome, offset_leste_m, offset_norte_m, rotacao_graus, escala, layers_ocultos")
    .eq("id", id).single();
  if (!antes) {
    return falha(404, "camada_sumiu", "Essa camada não existe mais.", {
      motivo: "Ela pode ter sido removida ou substituída por um envio novo enquanto a tela estava aberta.",
      solucao: "Feche a calibração e recarregue a lista de camadas.",
    });
  }

  const { error } = await admin.from("cartography_layers").update(patch).eq("id", id);
  if (error) return falhaBanco("calibracao_nao_gravou", error);

  await logAudit({
    user_id: a.userId, acao: "cartografia_calibrada",
    entidade: "cartography_layers", entidade_id: id,
    dados_antes: antes, dados_depois: patch,
  });
  return NextResponse.json({ ok: true, aplicado: patch });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/cartografia/[id]">) {
  const { id } = await ctx.params;
  const a = await ator();
  if (a?.role !== "admin_central") {
    return falha(403, "sem_permissao", "Só a diretoria remove camadas do mapa.", {
      motivo: `Seu acesso é "${a?.role ?? "sem sessão"}".`,
      solucao: "Peça a alguém da diretoria, ou esconda as camadas do CAD em vez de remover a planta.",
    });
  }
  const admin = supabaseAdmin();
  const { data: camada } = await admin.from("cartography_layers").select("tiles_path, nome").eq("id", id).single();
  if (!camada) {
    return falha(404, "camada_sumiu", "Essa camada já não existe.", {
      solucao: "Recarregue a lista.",
    });
  }
  const { error } = await admin.from("cartography_layers").delete().eq("id", id);
  if (error) return falhaBanco("camada_nao_removeu", error);

  await logAudit({
    user_id: a.userId, acao: "cartografia_removida",
    entidade: "cartography_layers", entidade_id: id, dados_antes: { nome: camada.nome },
  });
  return NextResponse.json({ ok: true });
}
