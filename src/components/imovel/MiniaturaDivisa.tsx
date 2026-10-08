import { urlTileAtivo } from "@/lib/map/config";

/**
 * Miniatura do terreno: tiles do mesmo satélite do mapa + a divisa desenhada
 * por cima, tudo num único SVG em coordenadas de pixel do mundo (Web
 * Mercator), então o contorno cai exatamente onde está no mapa. O zoom é
 * escolhido para o terreno ocupar ~60% da largura. Sem hooks: serve em
 * componente de servidor.
 *
 * `soContorno`: só o desenho da divisa, sem satélite (selo no canto da foto).
 */
type Anel = number[][];
export type GeoDivisa = { type: "Polygon"; coordinates: Anel[] } | { type: "MultiPolygon"; coordinates: Anel[][] };

const TILE = 256;
const px = (lng: number, lat: number, z: number) => {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
};

function aneisDe(g: GeoDivisa): Anel[] {
  return g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
}

export default function MiniaturaDivisa({
  geom, proporcao = 16 / 10, soContorno = false, className = "", cor = "#45D98A",
}: {
  geom: GeoDivisa; proporcao?: number; soContorno?: boolean; className?: string; cor?: string;
}) {
  const aneis = aneisDe(geom);
  const todos = aneis.flat();
  if (!todos.length) return null;

  // largura do terreno em pixels no zoom 0 → zoom em que ele ocupa ~420 px
  const [ax, ay] = px(Math.min(...todos.map((c) => c[0])), Math.max(...todos.map((c) => c[1])), 0);
  const [bx, by] = px(Math.max(...todos.map((c) => c[0])), Math.min(...todos.map((c) => c[1])), 0);
  const larg0 = Math.max(bx - ax, (by - ay) * proporcao, 1e-9);
  const z = Math.max(3, Math.min(soContorno ? 22 : 17, Math.floor(Math.log2(420 / larg0))));

  const pts = aneis.map((a) => a.map(([lng, lat]) => px(lng, lat, z)));
  const xs = pts.flat().map((p) => p[0]);
  const ys = pts.flat().map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // lote pequeno no zoom máximo do satélite: mostra o entorno (a quadra) em
  // vez de esticar a imagem — no mínimo 360 px de janela
  const w = Math.max(
    (Math.max(...xs) - Math.min(...xs)) / 0.6,
    ((Math.max(...ys) - Math.min(...ys)) / 0.7) * proporcao,
    soContorno ? 0 : 360,
  );
  const h = w / proporcao;
  // tudo relativo ao canto da janela: em z18 o pixel do mundo passa de 60
  // milhões, e o SVG (float de 32 bits) desenha com erro ou nem desenha
  const ox = cx - w / 2, oy = cy - h / 2;
  const vb = [0, 0, w, h];
  const caminho = pts.map((a) => "M" + a.map((p) => `${(p[0] - ox).toFixed(2)},${(p[1] - oy).toFixed(2)}`).join("L") + "Z").join("");
  const traco = w / 140;

  if (soContorno) {
    return (
      <svg viewBox={vb.join(" ")} className={className} aria-hidden="true">
        <path d={caminho} fill={cor} fillOpacity={0.25} stroke={cor} strokeWidth={traco * 1.6} strokeLinejoin="round" />
      </svg>
    );
  }

  // tiles que cobrem a janela (o servidor de tiles vai até z17)
  const zt = Math.min(z, 17);
  const esc = 2 ** (z - zt);
  const lado = TILE * esc;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(ox / lado); tx <= Math.floor((ox + w) / lado); tx++)
    for (let ty = Math.floor(oy / lado); ty <= Math.floor((oy + h) / lado); ty++) tiles.push({ x: tx, y: ty });

  return (
    <svg viewBox={vb.join(" ")} preserveAspectRatio="xMidYMid slice" className={`bg-[#0E2C1E] ${className}`} aria-hidden="true">
      {tiles.map((t) => (
        <image key={`${t.x}-${t.y}`} href={urlTileAtivo(zt, t.x, t.y)} x={t.x * lado - ox} y={t.y * lado - oy}
          width={lado + 0.5} height={lado + 0.5} preserveAspectRatio="none" />
      ))}
      <path d={caminho} fill={cor} fillOpacity={0.22} stroke={cor} strokeWidth={traco} strokeLinejoin="round" />
    </svg>
  );
}
