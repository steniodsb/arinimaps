import { NextResponse } from "next/server";
import { imagemCena, processamentoLigado, type TipoImagem } from "@/lib/sentinel/copernicus";
import { podeUsarCenas } from "@/lib/sentinel/acesso";
import { currentUser } from "@/lib/supabase/server";
import { limitarEmMemoria } from "@/lib/geo/limiteMemoria";
import { ipDoPedido, respostaLimite } from "@/lib/seguranca/limite";

/**
 * GET /api/sentinel/tile/{data}/{cor|ndvi}/{z}/{x}/{y}.png — um tile da cena
 * Sentinel-2 do dia, pelo Sentinel Hub do Copernicus (conta da Arini).
 *
 * A cena de um dia não muda: o tile fica em memória e no navegador por uma
 * semana. Só do zoom 10 ao 16 (10 m por pixel; de longe, cada tile cobriria
 * várias quadrículas e gastaria cota à toa).
 */
const Z_MIN = 10, Z_MAX = 16;
const MEMORIA_MAX = 600;
const memoria = new Map<string, Buffer>();
const CACHE = "private, max-age=604800, immutable";

const MERC = 20037508.342789244;
const bbox3857 = (z: number, x: number, y: number): [number, number, number, number] => {
  const lado = (2 * MERC) / 2 ** z;
  return [-MERC + x * lado, MERC - (y + 1) * lado, -MERC + (x + 1) * lado, MERC - y * lado];
};

export async function GET(request: Request, ctx: RouteContext<"/api/sentinel/tile/[data]/[tipo]/[z]/[x]/[y]">) {
  const l = limitarEmMemoria(`sentinel-tile:${ipDoPedido(request)}`, 1500, 300);
  if (!l.permitido) return respostaLimite(l, "imagens de satélite");
  const { data, tipo, z: zs, x: xs, y: ys } = await ctx.params;
  const z = Number(zs), x = Number(xs), y = Number(ys.replace(/\.png$/i, ""));
  const hoje = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje || !["cor", "ndvi"].includes(tipo)
    || ![z, x, y].every(Number.isInteger) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return NextResponse.json({ error: "Tile inválido." }, { status: 400 });
  }
  if (z < Z_MIN || z > Z_MAX) return new NextResponse(null, { status: 204, headers: { "Cache-Control": CACHE } });

  const acesso = await podeUsarCenas(request, await currentUser());
  if (!acesso.ok) return NextResponse.json({ error: acesso.mensagem }, { status: acesso.status });
  if (!processamentoLigado()) {
    return NextResponse.json({ error: "As cenas do Copernicus ainda não estão ligadas.", codigo: "sem_conta_copernicus" }, { status: 503 });
  }

  const chave = `${data}/${tipo}/${z}/${x}/${y}`;
  let png = memoria.get(chave);
  if (!png) {
    try {
      png = await imagemCena({ bbox3857: bbox3857(z, x, y), data, tipo: tipo as TipoImagem });
    } catch (e) {
      console.error(`tile Sentinel ${chave}:`, e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "O Copernicus não respondeu agora." }, { status: 502 });
    }
    if (memoria.size >= MEMORIA_MAX) memoria.delete(memoria.keys().next().value!);
    memoria.set(chave, png);
  }
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": CACHE } });
}
