// Confere que o ajuste por parte dá a MESMA posição nos três lugares que o
// calculam: a tela/mapa (src/lib/geo/deslocar.ts), o worker que gera lotes
// (worker/jobs/ajustes.mjs) e o mover-no-lugar dos lotes (delta da API).
// Uso: npx tsx scripts/testa-ajuste-parte.ts
import {
  transformarGeoJSON, afim, compor, inverter, aplicarMatrizPonto, centroArea, centroDe,
  type AjusteLocal, type Transform,
} from "../src/lib/geo/deslocar";
// @ts-expect-error módulo JS do worker, sem tipos
import { seletorDeMatriz, pedacosComMatriz } from "../worker/jobs/ajustes.mjs";

let falhas = 0;
const ok = (cond: boolean, nome: string, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!cond) falhas++;
};
const distM = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110_540);

// planta de teste: duas quadras (quadrados de ~50 m) em Iturama
const q = (x: number, y: number): GeoJSON.Feature => ({
  type: "Feature", properties: { layer: "LOTES" },
  geometry: { type: "LineString", coordinates: [[x, y], [x + 0.0005, y], [x + 0.0005, y + 0.0005], [x, y + 0.0005], [x, y]] },
});
const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [q(-50.205, -19.725), q(-50.2, -19.72)] };
const centro = centroDe(fc);
const global: Transform = { offsetLesteM: -25, offsetNorteM: 12.4, rotacaoGraus: 0.35, escala: 1.0012 };
const area: [number, number][] = [[-50.2052, -19.7252], [-50.2043, -19.7252], [-50.2043, -19.7243], [-50.2052, -19.7243]];
const parte: AjusteLocal = { id: "teste-1", nome: "Parte 1", area, t: { offsetLesteM: 6.5, offsetNorteM: -3.2, rotacaoGraus: 1.5, escala: 1 } };

// 1. sem parte, o caminho novo (matriz) bate com o antigo (ponto a ponto)
const semParte = transformarGeoJSON(fc, centro, global);
const comListaVazia = transformarGeoJSON(fc, centro, global, [], []);
ok(JSON.stringify(semParte) === JSON.stringify(comListaVazia), "lista de partes vazia = calibração de sempre");
const viaMatriz = transformarGeoJSON(fc, centro, global, [], [{ ...parte, area: [[0, 0], [0.0001, 0], [0, 0.0001]] }]);
const p0 = (semParte.features[0].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
const p1 = (viaMatriz.features[0].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
ok(distM(p0, p1) < 0.001, "linha fora de qualquer parte: matriz = transformarPonto", `${distM(p0, p1).toExponential(2)} m`);

// 2. com parte: só a quadra de dentro anda, e a de fora fica onde estava
const com = transformarGeoJSON(fc, centro, global, [], [parte]);
const dentroAntes = (semParte.features[0].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
const dentroDepois = (com.features[0].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
const foraAntes = (semParte.features[1].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
const foraDepois = (com.features[1].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
ok(distM(foraAntes, foraDepois) < 0.001, "quadra fora da parte não se mexe");
const andou = distM(dentroAntes, dentroDepois);
ok(andou > 5 && andou < 12, "quadra dentro da parte andou", `${andou.toFixed(2)} m`);

// 3. a quadra continua do mesmo tamanho (parte é rígida)
const lado = (c: number[][]) => distM(c[0] as [number, number], c[1] as [number, number]);
const ladoAntes = lado((semParte.features[0].geometry as GeoJSON.LineString).coordinates);
const ladoDepois = lado((com.features[0].geometry as GeoJSON.LineString).coordinates);
ok(Math.abs(ladoAntes - ladoDepois) < 0.01, "lado do lote não muda", `${ladoAntes.toFixed(3)} → ${ladoDepois.toFixed(3)} m`);

// 4. o worker chega no mesmo ponto
const matrizDe = seletorDeMatriz(centro, {
  dx: global.offsetLesteM, dy: global.offsetNorteM, rot: global.rotacaoGraus, esc: global.escala,
}, [parte]);
const cru = (fc.features[0].geometry as GeoJSON.LineString).coordinates[0] as [number, number];
const m = matrizDe([-50.20475, -19.72475]);
const doWorker: [number, number] = [m.a * cru[0] + m.b * cru[1] + m.xoff, m.d * cru[0] + m.e * cru[1] + m.yoff];
ok(distM(doWorker, dentroDepois) < 0.001, "worker = tela", `${distM(doWorker, dentroDepois).toExponential(2)} m`);

// 5. mover no lugar (API): delta leva a posição antiga à nova, e inv acha o desenho cru
const g = afim(centro, global);
const antiga = compor(g, afim(centroArea(area), { offsetLesteM: 0, offsetNorteM: 0, rotacaoGraus: 0, escala: 1 }));
const nova = compor(g, afim(centroArea(area), parte.t));
const delta = compor(nova, inverter(antiga));
const viaDelta = aplicarMatrizPonto(delta, dentroAntes);
ok(distM(viaDelta, dentroDepois) < 0.001, "delta do banco = tela", `${distM(viaDelta, dentroDepois).toExponential(2)} m`);
const deVolta = aplicarMatrizPonto(inverter(nova), dentroDepois);
ok(distM(deVolta, cru) < 0.001, "inversa volta ao desenho cru");

// 6. desfazer a parte (nova → zero) devolve o lote ao lugar original
const volta = compor(antiga, inverter(nova));
ok(distM(aplicarMatrizPonto(volta, viaDelta), dentroAntes) < 0.001, "remover a parte devolve o lote");

// 7. o DXF chega como UMA MultiLineString por camada: a parte vale linha a linha
const camada: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [{
    type: "Feature", properties: { layer: "LOTES" },
    geometry: {
      type: "MultiLineString",
      coordinates: [
        (fc.features[0].geometry as GeoJSON.LineString).coordinates, // dentro da área
        (fc.features[1].geometry as GeoJSON.LineString).coordinates, // fora
      ],
    },
  }],
};
const ml = transformarGeoJSON(camada, centroDe(camada), global, [], [parte]);
const mlSem = transformarGeoJSON(camada, centroDe(camada), global);
const linhasCom = (ml.features[0].geometry as GeoJSON.MultiLineString).coordinates;
const linhasSem = (mlSem.features[0].geometry as GeoJSON.MultiLineString).coordinates;
ok(distM(linhasCom[0][0] as [number, number], linhasSem[0][0] as [number, number]) > 5, "MultiLineString: a linha dentro da parte anda");
ok(distM(linhasCom[1][0] as [number, number], linhasSem[1][0] as [number, number]) < 0.001, "MultiLineString: a linha fora fica");
const seletor = seletorDeMatriz(centroDe(camada), { dx: global.offsetLesteM, dy: global.offsetNorteM, rot: global.rotacaoGraus, esc: global.escala }, [parte]);
const pedacos = pedacosComMatriz(camada.features[0].geometry, seletor, true) as { geometry: GeoJSON.MultiLineString; m: ReturnType<typeof afim> }[];
ok(pedacos.length === 2, "worker separa a camada em dois grupos de linhas", `${pedacos.length}`);
const doGrupo = pedacos.find((p) => p.geometry.coordinates.length === 1 && p.geometry.coordinates[0][0][0] === cru[0]);
const pW = doGrupo && aplicarMatrizPonto(doGrupo.m, cru);
ok(!!pW && distM(pW, linhasCom[0][0] as [number, number]) < 0.001, "worker = tela na MultiLineString");

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
