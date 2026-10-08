import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ufsDoEnvelope } from "@/lib/rural/ufs";
import { CAR_WFS } from "@/lib/geo/car";

/**
 * CAR sob demanda (08/10/2026): o mapa é nacional, a base importada é regional.
 *
 * Quando alguém aproxima o mapa (zoom ≥ 11) numa área, o servidor divide a
 * janela em células (tiles z11, ~19 km de lado) e, para cada célula que
 * nunca foi buscada ou cuja busca venceu (VALIDADE_DIAS), pergunta ao WFS do
 * SICAR pelos imóveis daquele envelope e grava em `car_imoveis` com o mesmo
 * `fn_car_upsert` da importação por município. Daí em diante os tiles
 * vetoriais desenham a área como desenham a região piloto.
 *
 * Por que células e não a janela exata: duas pessoas olhando lugares
 * vizinhos reaproveitam a mesma busca, e a tabela `car_celulas` responde
 * "já tenho isso?" com uma consulta por chave.
 */
const Z_CELULA = 11;
const MAX_CELULAS = 12; // janela de zoom 11 numa tela grande cobre ~6–9 células
const VALIDADE_DIAS = 30;
const PAGINA = 2000;
const UA = "AriniImoveisBrasil/1.0 (contato@ariniimoveisbrasil.com.br)";

export type Envelope = { xmin: number; ymin: number; xmax: number; ymax: number };

const lon2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export function celulasDo(env: Envelope) {
  const x0 = lon2x(env.xmin, Z_CELULA), x1 = lon2x(env.xmax, Z_CELULA);
  const y0 = lat2y(env.ymax, Z_CELULA), y1 = lat2y(env.ymin, Z_CELULA);
  const lista: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) lista.push({ x, y });
  return lista;
}

const envelopeDa = (c: { x: number; y: number }): Envelope => ({
  xmin: x2lon(c.x, Z_CELULA), xmax: x2lon(c.x + 1, Z_CELULA),
  ymin: y2lat(c.y + 1, Z_CELULA), ymax: y2lat(c.y, Z_CELULA),
});

// a mesma célula pedida por duas telas ao mesmo tempo: uma busca só
const emAndamento = new Map<string, Promise<number>>();

async function buscarCelula(c: { x: number; y: number }): Promise<number> {
  const env = envelopeDa(c);
  const admin = supabaseAdmin();
  let gravados = 0;
  for (const uf of ufsDoEnvelope(env)) {
    const camada = `sicar:sicar_imoveis_${uf}`;
    let inicio = 0;
    for (;;) {
      // BBOX em EPSG:4326 no WFS 2.0: ordem lat,lon (eixo da norma)
      const url = `${CAR_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${camada}` +
        `&outputFormat=application/json&count=${PAGINA}&startIndex=${inicio}&sortBy=cod_imovel` +
        `&srsName=EPSG:4326&bbox=${env.ymin},${env.xmin},${env.ymax},${env.xmax},urn:ogc:def:crs:EPSG::4326`;
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`SICAR respondeu HTTP ${r.status} (${uf})`);
      const fc = await r.json();
      if (!Array.isArray(fc.features)) throw new Error(`SICAR sem feições (${uf})`);
      if (fc.features.length) {
        const { data, error } = await admin.rpc("fn_car_upsert", { p_fc: fc });
        if (error) throw new Error(`banco recusou o CAR: ${error.message}`);
        gravados += Number(data ?? 0);
      }
      if (fc.features.length < PAGINA) break;
      inicio += fc.features.length;
    }
  }
  await admin.from("car_celulas").upsert({ z: Z_CELULA, x: c.x, y: c.y, buscado_em: new Date().toISOString(), quantidade: gravados, erro: null });
  return gravados;
}

/**
 * Garante o CAR da janela. Devolve quantas células foram buscadas agora e
 * quantos imóveis entraram (0 e 0 = já estava tudo salvo).
 */
export async function garantirCarJanela(env: Envelope) {
  const todas = celulasDo(env);
  if (todas.length > MAX_CELULAS) return { celulas: 0, imoveis: 0, longe: true };

  const admin = supabaseAdmin();
  const corte = new Date(Date.now() - VALIDADE_DIAS * 86_400_000).toISOString();
  const { data: feitas } = await admin.from("car_celulas")
    .select("x, y").eq("z", Z_CELULA).gte("buscado_em", corte).is("erro", null)
    .in("x", [...new Set(todas.map((c) => c.x))]).in("y", [...new Set(todas.map((c) => c.y))]);
  const ja = new Set((feitas ?? []).map((f) => `${f.x}/${f.y}`));
  const faltam = todas.filter((c) => !ja.has(`${c.x}/${c.y}`));

  let imoveis = 0;
  const erros: string[] = [];
  // em paralelo, mas poucas por vez: o SICAR é serviço público
  for (let i = 0; i < faltam.length; i += 4) {
    const lote = faltam.slice(i, i + 4);
    const res = await Promise.allSettled(lote.map((c) => {
      const chave = `${c.x}/${c.y}`;
      let p = emAndamento.get(chave);
      if (!p) {
        p = buscarCelula(c).finally(() => emAndamento.delete(chave));
        emAndamento.set(chave, p);
      }
      return p;
    }));
    res.forEach((r, j) => {
      if (r.status === "fulfilled") imoveis += r.value;
      else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        erros.push(msg);
        // anota a falha (não conta como buscada: tenta de novo na próxima visita)
        void admin.from("car_celulas").upsert({ z: Z_CELULA, x: lote[j].x, y: lote[j].y, erro: msg.slice(0, 300) });
      }
    });
  }
  return { celulas: faltam.length, imoveis, erros: erros.length ? erros.slice(0, 3) : undefined };
}
