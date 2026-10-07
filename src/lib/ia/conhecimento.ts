/**
 * Base de conhecimento (PENDÊNCIA 5.2): validação dos artigos. Sem
 * "server-only" — o editor usa os mesmos rótulos e limites.
 */

export const STATUS_ARTIGO = ["rascunho", "publicado", "arquivado"] as const;
export type StatusArtigo = (typeof STATUS_ARTIGO)[number];

export const STATUS_ARTIGO_LABEL: Record<StatusArtigo, string> = {
  rascunho: "Rascunho", publicado: "Publicado", arquivado: "Arquivado",
};
export const STATUS_ARTIGO_COR: Record<StatusArtigo, string> = {
  rascunho: "bg-alerta/15 text-alerta", publicado: "bg-verde/15 text-verde", arquivado: "bg-superficie-2 text-texto-2",
};

export type Artigo = {
  id: string; slug: string; titulo: string; conteudo: string; fonte: string;
  data_referencia: string; status: StatusArtigo; versao: number; updated_at: string;
};

export const slugDe = (titulo: string) =>
  titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Valida e normaliza um artigo vindo do formulário. Erro = string. */
export function validarArtigo(b: Record<string, unknown>): { dados: Omit<Artigo, "id" | "versao" | "updated_at"> } | { erro: string } {
  const titulo = String(b.titulo ?? "").trim();
  const conteudo = String(b.conteudo ?? "").trim();
  const fonte = String(b.fonte ?? "").trim();
  const data = String(b.data_referencia ?? "").trim();
  const status = String(b.status ?? "rascunho") as StatusArtigo;
  const slug = (String(b.slug ?? "").trim() || slugDe(titulo)).slice(0, 80);
  if (titulo.length < 3 || titulo.length > 200) return { erro: "Título: entre 3 e 200 caracteres." };
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(slug)) return { erro: "Identificador: só letras minúsculas, números e hífen (mínimo 3)." };
  if (conteudo.length > 20_000) return { erro: "Conteúdo: no máximo 20 mil caracteres." };
  if (!STATUS_ARTIGO.includes(status)) return { erro: "Situação inválida." };
  if (status === "publicado" && (!conteudo || !fonte)) return { erro: "Para publicar, preencha o conteúdo e a fonte." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data de referência inválida." };
  return { dados: { slug, titulo, conteudo, fonte, data_referencia: data, status } };
}
