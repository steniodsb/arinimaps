// Copia o build ESM do maplibre-gl (node_modules) para public/vendor.
//
// O mapa NÃO entra no bundle do Next (ver src/lib/map/maplibre.ts): o navegador
// importa /vendor/maplibre-gl.mjs em runtime e o próprio MapLibre cria o worker a
// partir de /vendor/maplibre-gl-worker.mjs (URL resolvida por import.meta.url).
// Roda no `prebuild` (e à mão: `npm run vendor:maplibre` depois de atualizar o
// pacote, para o dev). Não é postinstall de propósito: no Nixpacks o install pode
// rodar só com o package.json copiado, sem a pasta scripts/.
// O comentário de sourcemap é retirado (os .map têm ~8 MB e não são publicados).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raiz, "package.json"));
const pkg = require.resolve("maplibre-gl/package.json");
const dist = join(dirname(pkg), "dist");
const destino = join(raiz, "public", "vendor");
mkdirSync(destino, { recursive: true });

for (const nome of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs"]) {
  const texto = readFileSync(join(dist, nome), "utf8").replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");
  writeFileSync(join(destino, nome), texto);
}
// Restos do build UMD da v5 (o CSS vem do pacote via globals.css)
for (const velho of ["maplibre-gl.js", "maplibre-gl.css"]) rmSync(join(destino, velho), { force: true });

const { version } = JSON.parse(readFileSync(pkg, "utf8"));
console.log(`maplibre-gl ${version} copiado para public/vendor`);
