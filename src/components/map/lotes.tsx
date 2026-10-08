import Link from "next/link";
import { ArrowRight, Flag, ScanSearch } from "lucide-react";
import { VIDRO, BotaoFechar } from "@/components/map/UiMapa";

/** A partir deste zoom os lotes urbanos aparecem e ficam clicáveis. */
export const LOTE_ZOOM_MIN = 15;
/** A partir deste zoom aparecem as metragens dos lados. */
export const MEDIDA_ZOOM_MIN = 18;
/** A partir deste zoom aparecem quadra e número de cada lote (camada `rotulos` do tile). */
export const ROTULO_ZOOM_MIN = 18;
/** Maior lado do retângulo que /api/geo/lotes aceita, em graus. */
export const LOTE_LADO_MAX = 0.06;

export type LoteInfo = {
  id: string;
  area_m2: number;
  perimetro_m: number;
  lados: { m: number }[];
  /** lidos dos textos da planta CAD (scripts/numera-lotes.mjs); null quando a planta não diz */
  numero?: string | null;
  quadra?: string | null;
  municipio: string | null;
  anuncio: string | null;
};

const m2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const metros = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Metragens dos lados, como pontos com texto para o mapa.
 *
 * O CAD traz as cotas como texto solto, que o conversor não aproveita. Aqui a
 * medida é calculada da própria divisa georreferenciada do lote — vale para
 * qualquer planta, inclusive as que vierem sem cota. A etiqueta fica um pouco
 * para DENTRO do lote: dois vizinhos compartilham o mesmo lado, e sem o recuo
 * as duas medidas cairiam uma em cima da outra.
 */
export function medidasDe(fc: GeoJSON.FeatureCollection, tela: { w: number; s: number; e: number; n: number }): GeoJSON.FeatureCollection {
  const pontos: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "Polygon") continue;
    const anel = f.geometry.coordinates[0] as [number, number][];
    if (anel.length < 4) continue;
    const cx = anel.reduce((s, p) => s + p[0], 0) / anel.length;
    const cy = anel.reduce((s, p) => s + p[1], 0) / anel.length;
    if (cx < tela.w || cx > tela.e || cy < tela.s || cy > tela.n) continue;
    const kx = 111_320 * Math.cos((cy * Math.PI) / 180), ky = 110_540;

    for (let i = 0; i < anel.length - 1; i++) {
      const [x0, y0] = anel[i], [x1, y1] = anel[i + 1];
      const dx = (x1 - x0) * kx, dy = (y1 - y0) * ky;
      const comprimento = Math.hypot(dx, dy);
      if (comprimento < 3) continue;
      let mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      // 1,4 m para dentro, na direção do centro do lote
      const vx = (cx - mx) * kx, vy = (cy - my) * ky, v = Math.hypot(vx, vy) || 1;
      mx += ((vx / v) * 1.4) / kx;
      my += ((vy / v) * 1.4) / ky;
      // texto acompanha o lado e nunca fica de cabeça para baixo
      let ang = (-Math.atan2(dy, dx) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      pontos.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [mx, my] },
        properties: { m: metros(comprimento), ang },
      });
    }
  }
  return { type: "FeatureCollection", features: pontos };
}

/** Cartão do lote clicado: medidas e o atalho para o dono anunciar. */
export function CartaoLote({ lote, onFechar }: { lote: LoteInfo; onFechar: () => void }) {
  return (
    <div className={`absolute top-16 left-3 z-10 w-80 max-w-[calc(100%-1.5rem)] p-5 space-y-4 ${VIDRO}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ouro">Lote urbano</p>
          <p className="font-display text-xl font-bold leading-tight text-texto mt-1">
            {[lote.quadra && `Quadra ${lote.quadra}`, lote.numero && `Lote ${lote.numero}`].filter(Boolean).join(" · ") || `${m2(lote.area_m2)} m²`}
          </p>
          <p className="text-xs text-texto-2 mt-1">
            {[(lote.quadra || lote.numero) && `${m2(lote.area_m2)} m²`, lote.municipio].filter(Boolean).join(" · ")}
          </p>
        </div>
        <BotaoFechar onClick={onFechar} />
      </div>
      <dl className="text-sm divide-y divide-linha rounded-xl border border-linha bg-superficie-2/60 px-3.5">
        <div className="flex justify-between gap-2 py-2.5">
          <dt className="text-texto-2">Perímetro</dt><dd className="font-semibold text-texto tabular-nums">{metros(lote.perimetro_m)} m</dd>
        </div>
        <div className="py-2.5">
          <dt className="text-texto-2">Lados</dt>
          <dd className="mt-0.5 text-texto tabular-nums">{lote.lados.filter((l) => l.m >= 1).map((l) => metros(l.m)).join(" · ")} m</dd>
        </div>
      </dl>
      <div className="space-y-2">
        {lote.anuncio ? (
          <Link href={`/imovel/${lote.anuncio}`} className="btn-verde flex w-full items-center justify-center gap-1.5 py-2.5 text-sm">
            Este lote está à venda — ver o anúncio <ArrowRight className="size-4" />
          </Link>
        ) : (
          <Link href={`/painel/novo?lote=${lote.id}`} className="btn-ouro flex w-full items-center justify-center gap-1.5 py-2.5 text-sm">
            Este lote é meu — anunciar <ArrowRight className="size-4" />
          </Link>
        )}
        <Link href={`/consulta/lote/${lote.id}`} className="btn-contorno flex w-full items-center justify-center gap-1.5 py-2.5 text-sm">
          <ScanSearch className="size-4" /> Consultar informações
        </Link>
      </div>
      <Link href={`/cartografia/solicitar?referencia=${encodeURIComponent("lote:" + lote.id)}&tipo=divergencia`}
        className="flex items-center justify-center gap-1.5 text-xs text-texto-2 hover:text-verde transition">
        <Flag className="size-3.5" /> O mapa está divergente deste lote
      </Link>
      <p className="text-[11px] text-texto-2 leading-relaxed border-t border-linha pt-3">
        Medidas calculadas sobre a planta da cidade; quadra e número lidos dos textos do CAD. São
        referência: não substituem a matrícula nem o levantamento do lote. Para publicar, a Arini confere a matrícula.
      </p>
    </div>
  );
}
