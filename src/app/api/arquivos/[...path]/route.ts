import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ator } from "@/lib/authz";
import { falha } from "@/lib/erros";
import { limitar, respostaLimite } from "@/lib/seguranca/limite";
import { caminhoValido, registrarAcessoDocumento, resolverArquivo } from "@/lib/seguranca/documentos";
import { registrarTentativa } from "@/lib/planos-servidor";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

/** Prazo da URL assinada: só o suficiente para o navegador seguir o redirecionamento. */
const VALIDADE_S = 60;

/**
 * Abre um arquivo do cofre privado `docs` (item 6.3 do roadmap).
 *
 *   GET /api/arquivos/imoveis/<id>/matricula-….pdf            → visualizar
 *   GET /api/arquivos/contratos/<oportunidade>/….pdf?acao=baixar → baixar
 *
 * A cada clique: confere a sessão e a permissão (src/lib/seguranca/documentos.ts),
 * registra quem abriu em `document_access_log` — inclusive a tentativa negada —
 * e redireciona para uma URL assinada de 60 segundos. O link da tela nunca é
 * a URL do armazenamento, então copiar o link não dá acesso a quem não pode.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/arquivos/[...path]">) {
  const { path: partes } = await ctx.params;
  const path = (partes ?? []).join("/");
  const url = new URL(request.url);
  const acao = url.searchParams.get("acao") === "baixar" ? "baixar" : "visualizar";
  const semCache = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

  if (!caminhoValido(path)) {
    return falha(400, "caminho_invalido", "Endereço de arquivo inválido.");
  }

  const a = await ator();
  if (!a) {
    // link aberto em outra aba, sem sessão: leva para a entrada em vez de mostrar JSON
    return NextResponse.redirect(new URL("/entrar", request.url), { status: 302, headers: semCache });
  }

  const l = await limitar(`arquivo:${a.userId}`, 120, 600);
  if (!l.permitido) return respostaLimite(l, "abrir arquivos");

  const r = await resolverArquivo(a, path);
  await registrarAcessoDocumento(request, a, path, acao, r);

  if (!r) {
    return falha(404, "arquivo_nao_encontrado", "Arquivo não encontrado.", {
      solucao: "Ele pode ter sido substituído ou descartado. Recarregue a página e tente de novo.",
    });
  }
  if (!r.permitido) {
    await registrarTentativa({ request, userId: a.userId, role: a.role, recurso: `arquivo:${r.categoria}`, motivo: "sem_permissao" });
    return falha(403, "sem_permissao", "Você não tem acesso a este arquivo.", {
      motivo: r.motivo ?? undefined,
      solucao: "Se precisa dele, peça à equipe da Arini.",
    });
  }

  const { data, error } = await supabaseAdmin().storage.from("docs")
    .createSignedUrl(path, VALIDADE_S, acao === "baixar" ? { download: r.nome } : undefined);
  if (error || !data?.signedUrl) {
    return falha(502, "armazenamento_indisponivel", "O arquivo não pôde ser aberto agora.", {
      motivo: error?.message, solucao: "Tente de novo em instantes.",
    });
  }

  if (r.propertyId && r.categoria !== "cartografia") {
    void registrarEventoImovel({
      propertyId: r.propertyId, tipo: "documento", userId: a.userId, partnerId: a.partnerId, request,
      detalhe: { acao: acao === "baixar" ? "download" : "abertura", categoria: r.categoria, nome: r.nome },
    });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: semCache });
}
