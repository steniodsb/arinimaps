// Compara o mesmo ponto do DXF convertido por diferentes datums brasileiros.
// Plantas de prefeitura costumam estar em SAD69 ou Córrego Alegre; tratá-las
// como SIRGAS 2000 desloca a planta dezenas de metros no mapa.
// Uso: node scripts/testa-datum.mjs <arquivo.dxf>
import fs from "node:fs";
import DxfParser from "dxf-parser";
import proj4 from "proj4";

const DATUMS = {
  "SIRGAS 2000": "+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "SAD69": "+proj=utm +zone=22 +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs",
  "SAD69/96 (IBGE)": "+proj=utm +zone=22 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +units=m +no_defs",
  "Córrego Alegre": "+proj=utm +zone=22 +south +ellps=intl +towgs84=-206,172,-6,0,0,0,0 +units=m +no_defs",
  "WGS84": "+proj=utm +zone=22 +south +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};

const arquivo = process.argv[2];
const dxf = new DxfParser().parseSync(fs.readFileSync(arquivo, "utf8"));

// centro do desenho
let sx = 0, sy = 0, n = 0;
for (const e of dxf.entities ?? []) {
  for (const v of e.vertices ?? []) {
    if (v.x > 100000 && v.x < 900000 && v.y > 6000000 && v.y < 10000000) {
      sx += v.x; sy += v.y; n++;
      if (n > 5000) break;
    }
  }
  if (n > 5000) break;
}
const centro = [sx / n, sy / n];
console.log(`centro UTM do desenho: ${centro[0].toFixed(1)}, ${centro[1].toFixed(1)} (${n} pontos)\n`);

const base = proj4(DATUMS["SIRGAS 2000"], "EPSG:4326", centro);
console.log("DATUM".padEnd(18), "LONGITUDE".padEnd(13), "LATITUDE".padEnd(13), "DESLOCAMENTO vs SIRGAS");
console.log("-".repeat(72));
for (const [nome, def] of Object.entries(DATUMS)) {
  const [lng, lat] = proj4(def, "EPSG:4326", centro);
  // metros aproximados na latitude do Triângulo Mineiro
  const dx = (lng - base[0]) * 111320 * Math.cos((lat * Math.PI) / 180);
  const dy = (lat - base[1]) * 110540;
  const dist = Math.hypot(dx, dy);
  console.log(
    nome.padEnd(18),
    lng.toFixed(6).padEnd(13),
    lat.toFixed(6).padEnd(13),
    `${dist.toFixed(1)} m  (leste ${dx.toFixed(1)} / norte ${dy.toFixed(1)})`
  );
}
