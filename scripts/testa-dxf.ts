import fs from "node:fs";
import { Readable } from "node:stream";
import { converterDxf, ErroDxf } from "../src/lib/geo/dxf.ts";

const arq = process.argv[2];
const bytes = fs.statSync(arq).size;
console.log(`arquivo: ${(bytes / 1048576).toFixed(1)} MB`);

const t0 = Date.now();
const web = Readable.toWeb(fs.createReadStream(arq)) as ReadableStream<Uint8Array>;

try {
  const r = await converterDxf(web);
  const heap = process.memoryUsage();
  const json = JSON.stringify(r.geojson);
  console.log("\n=== CONVERSÃO OK ===");
  console.log("linhas aproveitadas :", r.linhas.toLocaleString("pt-BR"));
  console.log("layers do CAD       :", r.layersCad);
  console.log("zona detectada      :", r.zona);
  console.log("centro (lng,lat)    :", r.centro.map((n) => n.toFixed(5)).join(", "));
  console.log("bbox                :", r.bbox.map((n) => n.toFixed(4)).join(", "));
  console.log("geojson             :", (json.length / 1048576).toFixed(1), "MB");
  console.log("tempo               :", ((Date.now() - t0) / 1000).toFixed(1), "s");
  console.log("heap usado          :", (heap.heapUsed / 1048576).toFixed(0), "MB  (pico rss", (heap.rss / 1048576).toFixed(0), "MB)");
  console.log("\ndiagnóstico:");
  console.log("  entidades lidas   :", r.diagnostico.entidadesLidas.toLocaleString("pt-BR"));
  console.log("  geometrias/tipo   :", r.diagnostico.geometriasPorTipo);
  console.log("  ignoradas (texto) :", r.diagnostico.ignoradasSemGeometria.toLocaleString("pt-BR"));
  console.log("  blocos expandidos :", r.diagnostico.blocosExpandidos, "| não resolvidos:", r.diagnostico.blocosNaoResolvidos);
  console.log("  pontos descartados:", r.diagnostico.pontosDescartados.toLocaleString("pt-BR"));
  console.log("  layers            :", r.diagnostico.layers.slice(0, 8).map((l) => `${l.nome}(${l.linhas})`).join(", "));
  fs.writeFileSync(process.argv[3] ?? "saida.geojson", json);
} catch (e) {
  if (e instanceof ErroDxf) {
    console.log("\n=== RECUSADO COM MOTIVO ===");
    console.log("mensagem:", e.message);
    console.log("motivo  :", e.motivo);
    console.log("solução :", e.solucao);
    console.log("detalhes:", e.detalhes);
  } else throw e;
}
