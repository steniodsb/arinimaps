/**
 * Reduz a foto NO NAVEGADOR antes de enviar (08/10/2026).
 *
 * Foto de celular sai com 4–12 MB e 4000+ px; o anúncio mostra no máximo
 * ~1.600 px. Mandar o original fazia 20 fotos atravessarem o servidor com até
 * 400 MB num pedido só. Aqui cada foto vira WebP (ou JPEG, onde não houver
 * WebP) de até 2.048 px no lado maior, qualidade 0,82: ~300–600 KB, sem
 * diferença visível no anúncio.
 *
 * De quebra some o EXIF — inclusive a localização GPS que o celular grava na
 * foto (a casa do proprietário não fica exposta no arquivo público).
 *
 * Se o navegador não conseguir abrir o formato (HEIC no Chrome, por exemplo),
 * a foto segue original: o servidor aceita e confere o conteúdo do mesmo jeito.
 */
const LADO_MAX = 2048;
const QUALIDADE = 0.82;
/** abaixo disto e dentro do tamanho máximo, não vale reprocessar */
const JA_PEQUENA = 700 * 1024;

export async function comprimirFoto(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    return arquivo; // formato que o navegador não decodifica
  }
  try {
    const maior = Math.max(imagem.width, imagem.height);
    if (maior <= LADO_MAX && arquivo.size <= JA_PEQUENA) return arquivo;
    const escala = Math.min(1, LADO_MAX / maior);
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem, 0, 0, largura, altura);

    const gerar = (tipo: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, QUALIDADE));
    let blob = await gerar("image/webp");
    // Safari antigo devolve PNG quando não sabe WebP: aí vai de JPEG
    if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg");
    if (!blob || blob.size >= arquivo.size) return arquivo;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const nome = arquivo.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], nome, { type: blob.type, lastModified: Date.now() });
  } finally {
    imagem.close();
  }
}

/** Várias fotos, duas por vez (celular com pouca memória não segura 20 canvas de 12 MP). */
export async function comprimirFotos(arquivos: File[], aoAvancar?: (feitas: number) => void): Promise<File[]> {
  const saida: File[] = new Array(arquivos.length);
  let feitas = 0;
  for (let i = 0; i < arquivos.length; i += 2) {
    await Promise.all(arquivos.slice(i, i + 2).map(async (f, j) => {
      saida[i + j] = await comprimirFoto(f);
      aoAvancar?.(++feitas);
    }));
  }
  return saida;
}
