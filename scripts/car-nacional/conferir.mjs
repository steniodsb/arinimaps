// Confere um PMTiles gerado: cabeçalho, metadados e alguns tiles decodificados.
// Uso: node scripts/car-nacional/conferir.mjs <arquivo.pmtiles> [z x y ...]
import { openSync, readSync, fstatSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const [arquivo, ...coords] = process.argv.slice(2);
const fd = openSync(arquivo, "r");
const tamanho = fstatSync(fd).size;
const fonte = {
  getKey: () => arquivo,
  getBytes: async (offset, length) => {
    const b = Buffer.alloc(Math.min(length, tamanho - offset));
    readSync(fd, b, 0, b.length, offset);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  },
};
const p = new PMTiles(fonte);
const h = await p.getHeader();
const meta = await p.getMetadata();
console.log("zoom", h.minZoom, "a", h.maxZoom, "· tiles", h.numAddressedTiles, "· limites", [h.minLon, h.minLat, h.maxLon, h.maxLat].map((v) => v.toFixed(2)).join(","));
console.log("metadados:", meta.name, "·", meta.imoveis, "imóveis ·", meta.ufs?.join(","));
const alvos = [];
for (let i = 0; i < coords.length; i += 3) alvos.push(coords.slice(i, i + 3).map(Number));
for (const [z, x, y] of alvos) {
  const r = await p.getZxy(z, x, y);
  if (!r) { console.log(`${z}/${x}/${y}: vazio`); continue; }
  const bruto = Buffer.from(r.data);
  const vt = new VectorTile(new Pbf(bruto[0] === 0x1f ? gunzipSync(bruto) : bruto));
  const camada = vt.layers.car;
  const f = camada?.feature(0);
  console.log(`${z}/${x}/${y}: ${(bruto.length / 1024).toFixed(1)} KB · ${camada?.length ?? 0} feições · ex.: ${JSON.stringify(f?.properties)}`);
}
