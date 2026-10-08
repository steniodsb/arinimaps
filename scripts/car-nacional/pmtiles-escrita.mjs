// Escritor mínimo de PMTiles v3 (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
//
// A biblioteca `pmtiles` do npm só LÊ; para escrever sem tippecanoe/GDAL, este
// módulo monta o arquivo: cabeçalho de 127 bytes, diretório raiz, metadados,
// diretórios-folha e os tiles. Os tiles entram num arquivo temporário à medida
// que são gerados (memória constante); tile repetido (mesmo conteúdo) é gravado
// uma vez só e os dois endereços apontam para ele.
import { createHash } from "node:crypto";
import { closeSync, createReadStream, createWriteStream, openSync, unlinkSync, writeSync } from "node:fs";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { zxyToTileId } from "pmtiles";

function varint(n, saida) {
  while (n >= 0x80) {
    saida.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  saida.push(n);
}

function serializarDiretorio(entradas) {
  const b = [];
  varint(entradas.length, b);
  let ultimo = 0;
  for (const e of entradas) { varint(e.tileId - ultimo, b); ultimo = e.tileId; }
  for (const e of entradas) varint(e.run, b);
  for (const e of entradas) varint(e.length, b);
  entradas.forEach((e, i) => {
    const anterior = entradas[i - 1];
    if (i > 0 && e.offset === anterior.offset + anterior.length) varint(0, b);
    else varint(e.offset + 1, b);
  });
  return gzipSync(Buffer.from(b));
}

/** Diretório raiz que cabe em 16 KB (exigência do formato) + folhas, se precisar. */
function montarDiretorios(entradas) {
  const raiz = serializarDiretorio(entradas);
  if (raiz.length <= 16384 - 127) return { raiz, folhas: Buffer.alloc(0) };
  for (let porFolha = 4096; ; porFolha *= 2) {
    const partes = [];
    const raizEntradas = [];
    let offset = 0;
    for (let i = 0; i < entradas.length; i += porFolha) {
      const folha = serializarDiretorio(entradas.slice(i, i + porFolha));
      raizEntradas.push({ tileId: entradas[i].tileId, offset, length: folha.length, run: 0 });
      partes.push(folha);
      offset += folha.length;
    }
    const r = serializarDiretorio(raizEntradas);
    if (r.length <= 16384 - 127) return { raiz: r, folhas: Buffer.concat(partes) };
  }
}

export class EscritorPMTiles {
  constructor(destino) {
    this.destino = destino;
    this.temp = `${destino}.tiles.tmp`;
    this.fd = openSync(this.temp, "w");
    this.offset = 0;
    this.entradas = [];
    this.porHash = new Map();
    this.conteudos = 0;
  }

  /** `dados` já comprimido (gzip). */
  adicionar(z, x, y, dados) {
    const hash = createHash("sha1").update(dados).digest("base64");
    let pos = this.porHash.get(hash);
    if (!pos) {
      writeSync(this.fd, dados);
      pos = { offset: this.offset, length: dados.length };
      this.offset += dados.length;
      this.porHash.set(hash, pos);
      this.conteudos++;
    }
    this.entradas.push({ tileId: zxyToTileId(z, x, y), offset: pos.offset, length: pos.length, run: 1 });
  }

  async finalizar({ minZoom, maxZoom, bounds, centro, metadados }) {
    closeSync(this.fd);
    this.entradas.sort((a, b) => a.tileId - b.tileId);
    const { raiz, folhas } = montarDiretorios(this.entradas);
    const meta = gzipSync(Buffer.from(JSON.stringify(metadados)));

    const h = Buffer.alloc(127);
    h.write("PMTiles", 0, "ascii");
    h.writeUInt8(3, 7);
    const raizOff = 127, metaOff = raizOff + raiz.length, folhasOff = metaOff + meta.length, dadosOff = folhasOff + folhas.length;
    const u64 = (v, p) => h.writeBigUInt64LE(BigInt(v), p);
    u64(raizOff, 8); u64(raiz.length, 16);
    u64(metaOff, 24); u64(meta.length, 32);
    u64(folhasOff, 40); u64(folhas.length, 48);
    u64(dadosOff, 56); u64(this.offset, 64);
    u64(this.entradas.length, 72); u64(this.entradas.length, 80); u64(this.conteudos, 88);
    h.writeUInt8(0, 96); // não agrupado por tileId (gravado na ordem de geração)
    h.writeUInt8(2, 97); // diretórios em gzip
    h.writeUInt8(2, 98); // tiles em gzip
    h.writeUInt8(1, 99); // MVT
    h.writeUInt8(minZoom, 100);
    h.writeUInt8(maxZoom, 101);
    const e7 = (v) => Math.round(v * 1e7);
    h.writeInt32LE(e7(bounds[0]), 102); h.writeInt32LE(e7(bounds[1]), 106);
    h.writeInt32LE(e7(bounds[2]), 110); h.writeInt32LE(e7(bounds[3]), 114);
    h.writeUInt8(centro[2], 118);
    h.writeInt32LE(e7(centro[0]), 119); h.writeInt32LE(e7(centro[1]), 123);

    const saida = createWriteStream(this.destino);
    for (const parte of [h, raiz, meta, folhas]) {
      if (!saida.write(parte)) await once(saida, "drain");
    }
    await pipeline(createReadStream(this.temp), saida);
    unlinkSync(this.temp);
    return { tiles: this.entradas.length, conteudos: this.conteudos, bytes: dadosOff + this.offset };
  }
}
