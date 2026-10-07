/**
 * Conferência de arquivo enviado pelo conteúdo, não pelo nome (item 6.2).
 *
 * Extensão e `Content-Type` vêm do navegador e qualquer um troca. Aqui o tipo
 * é decidido pelos primeiros bytes ("assinatura" do formato): um HTML
 * renomeado para .jpg é recusado, e o arquivo é gravado com o tipo REAL — é
 * isso que o armazenamento devolve ao abrir, então um arquivo nunca é servido
 * como página (text/html, image/svg+xml) a partir do nosso cofre.
 *
 * Formatos de texto sem assinatura (DXF, KML) são aceitos só quando o
 * conteúdo não tem cara de HTML/script, e são gravados como download.
 */

export type TipoReal =
  | "jpg" | "png" | "webp" | "gif" | "heic" | "avif"
  | "pdf" | "zip" | "ole" | "dwg" | "mp4" | "mov" | "webm"
  | "kml" | "dxf";

export const CONTENT_TYPE: Record<TipoReal, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", avif: "image/avif",
  pdf: "application/pdf",
  zip: "application/zip", ole: "application/octet-stream", dwg: "application/acad",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  kml: "application/vnd.google-earth.kml+xml", dxf: "application/dxf",
};

/** Grupos de aceitação usados pelas rotas. */
export const ACEITA = {
  /** Fotos de anúncio e selfie. */
  imagem: ["jpg", "png", "webp", "heic", "avif", "gif"] as TipoReal[],
  /** Documentos do imóvel, contratos e anexos: PDF, imagem, CAD, KML/KMZ, Office/ZIP. */
  documento: ["pdf", "jpg", "png", "webp", "heic", "gif", "zip", "ole", "dwg", "dxf", "kml"] as TipoReal[],
};

/** Extensões aceitas por tipo real (o nome original pode usar qualquer uma delas). */
const EXT_DO_TIPO: Record<TipoReal, string[]> = {
  jpg: ["jpg", "jpeg", "jfif"], png: ["png"], webp: ["webp"], gif: ["gif"], heic: ["heic", "heif"], avif: ["avif"],
  pdf: ["pdf"], zip: ["zip", "kmz", "docx", "xlsx", "odt", "ods"], ole: ["doc", "xls"],
  dwg: ["dwg"], mp4: ["mp4", "m4v"], mov: ["mov"], webm: ["webm"], kml: ["kml"], dxf: ["dxf"],
};

function comeca(b: Uint8Array, assinatura: number[], deslocamento = 0) {
  return assinatura.every((v, i) => b[deslocamento + i] === v);
}
function ascii(b: Uint8Array, ini: number, fim: number) {
  return String.fromCharCode(...b.slice(ini, fim));
}

/** Tipo pelo conteúdo. null = formato não reconhecido. */
export function tipoReal(bytes: Uint8Array, nome = ""): TipoReal | null {
  const b = bytes;
  if (comeca(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (ascii(b, 0, 4) === "GIF8") return "gif";
  if (ascii(b, 0, 5) === "%PDF-") return "pdf";
  if (comeca(b, [0x50, 0x4b, 0x03, 0x04]) || comeca(b, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  if (/^AC10\d\d/.test(ascii(b, 0, 6))) return "dwg";
  if (comeca(b, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (ascii(b, 4, 8) === "ftyp") {
    const marca = ascii(b, 8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heif)$/.test(marca)) return "heic";
    if (marca === "avif" || marca === "avis") return "avif";
    if (marca === "qt  ") return "mov";
    return "mp4";
  }
  // formatos de texto: só pela extensão, e só se não parecer página/script
  const ext = extensao(nome);
  if (ext === "kml" || ext === "dxf") {
    const inicio = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 2048)).toLowerCase();
    if (/<(html|script|body|iframe|svg|object|embed)\b|javascript:/.test(inicio)) return null;
    if (ext === "kml" && /<kml\b|<\?xml/.test(inicio)) return "kml";
    if (ext === "dxf" && /^\s*0\s*[\r\n]+\s*section/.test(inicio)) return "dxf";
    if (ext === "dxf" && /\bsection\b/.test(inicio)) return "dxf";
  }
  return null;
}

export function extensao(nome: string) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

export type ArquivoConferido = {
  tipo: TipoReal;
  /** extensão para o caminho no armazenamento (a do nome, se combina com o conteúdo) */
  ext: string;
  contentType: string;
  bytes: ArrayBuffer;
};

/**
 * Confere tamanho e conteúdo. Devolve os bytes já lidos (para o upload) ou o
 * erro em linguagem de gente.
 */
export async function conferirArquivo(
  arquivo: File,
  aceitos: TipoReal[],
  maxBytes: number
): Promise<{ ok: true; arquivo: ArquivoConferido } | { ok: false; erro: string }> {
  const nome = arquivo.name || "arquivo";
  if (arquivo.size <= 0) return { ok: false, erro: `O arquivo ${nome} está vazio.` };
  if (arquivo.size > maxBytes) {
    return { ok: false, erro: `O arquivo ${nome} passa de ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const bytes = await arquivo.arrayBuffer();
  const tipo = tipoReal(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096)), nome);
  if (!tipo || !aceitos.includes(tipo)) {
    return { ok: false, erro: `O arquivo ${nome} não é de um formato aceito ou está corrompido.` };
  }
  const extNome = extensao(nome);
  const ext = EXT_DO_TIPO[tipo].includes(extNome) ? extNome : EXT_DO_TIPO[tipo][0];
  return { ok: true, arquivo: { tipo, ext, contentType: CONTENT_TYPE[tipo], bytes } };
}
