/**
 * Endereço interno para abrir um arquivo do cofre privado (`docs`).
 *
 * Nunca entregue a URL assinada do armazenamento direto para a tela: ela vale
 * para quem tiver o link, durante o prazo inteiro, e ninguém fica sabendo que
 * foi aberta. Este endereço passa por /api/arquivos, que confere a permissão
 * a cada clique, registra quem abriu (document_access_log) e só então
 * redireciona para uma URL assinada de 60 segundos.
 *
 * Pode ser usado no navegador e no servidor.
 */
export function urlArquivo(storagePath: string, acao: "visualizar" | "baixar" = "visualizar") {
  const caminho = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/arquivos/${caminho}${acao === "baixar" ? "?acao=baixar" : ""}`;
}
