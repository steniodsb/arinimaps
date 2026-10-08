// CAR nacional — passo 1: baixa a malha do SICAR, município por município.
//
// Por que por município: o WFS do SICAR pagina com OFFSET, e numa UF grande
// (MG ≈ 1 milhão de imóveis) a página 400 leva minutos. Por município cada
// pedido é pequeno, e a carga é RETOMÁVEL: município baixado vira um arquivo
// `.geojsonl.gz` + marcador `.ok`; rodar de novo pula o que já está pronto.
// O SICAR cai com frequência — cada pedido tenta de novo até 5 vezes, com
// espera crescente, e o município que falhar fica para a próxima rodada.
//
// Saída: <dados>/car/<uf>/<cod_ibge>.geojsonl.gz — uma feição por linha, só
// os campos que o mapa usa (cod, area_ha, condicao, status, tipo, municipio,
// uf) e coordenadas com 6 casas (~10 cm).
//
// Uso: node scripts/car-nacional/baixar.mjs [uf ...] [--dados <pasta>] [--paralelo 3] [--refazer-dias 30]
//      sem UF: todas, na ordem de PRIORIDADE (região da Arini primeiro).
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createGzip } from "node:zlib";
import { once } from "node:events";

export const PRIORIDADE = [
  "mg", "sp", "go", "ms", "mt", "pr", "ba", "to", "df", "rj", "es", "sc", "rs",
  "ma", "pi", "pa", "ro", "ce", "pe", "pb", "rn", "al", "se", "am", "ac", "ap", "rr",
];
const WFS = "https://geoserver.car.gov.br/geoserver/sicar/ows";
const UA = "AriniImoveisBrasil/1.0 (contato@ariniimoveisbrasil.com.br)";
const PAGINA = 2000;

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
};
const DADOS = resolve(opcao("dados", process.env.CAR_DADOS ?? "../dados"));
const PARALELO = Number(opcao("paralelo", 3));
const REFAZER_DIAS = Number(opcao("refazer-dias", 30));
const ufs = args.filter((a, i) => /^[a-z]{2}$/i.test(a) && !args[i - 1]?.startsWith("--")).map((u) => u.toLowerCase());
const lista = ufs.length ? ufs : PRIORIDADE;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const arredondar = (c) => (typeof c[0] === "number" ? [r6(c[0]), r6(c[1])] : c.map(arredondar));

async function pedir(url, tentativas = 5) {
  let erro;
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j.features)) throw new Error("resposta sem feições");
      return j;
    } catch (e) {
      erro = e;
      await esperar(2000 * 2 ** t); // 2, 4, 8, 16, 32 s
    }
  }
  throw erro;
}

async function municipiosDa(uf) {
  const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
  if (!r.ok) throw new Error(`IBGE HTTP ${r.status}`);
  return (await r.json()).map((m) => ({ cod: m.id, nome: m.nome }));
}

async function baixarMunicipio(uf, m, pasta) {
  const destino = join(pasta, `${m.cod}.geojsonl.gz`);
  const ok = `${destino}.ok`;
  if (existsSync(ok) && Date.now() - statSync(ok).mtimeMs < REFAZER_DIAS * 86_400_000) return { pulou: true };

  const temp = `${destino}.parcial`;
  const gz = createGzip();
  const saida = createWriteStream(temp);
  gz.pipe(saida);
  let inicio = 0, total = Infinity, n = 0;
  while (inicio < total) {
    const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=sicar:sicar_imoveis_${uf}` +
      `&outputFormat=application/json&count=${PAGINA}&startIndex=${inicio}&sortBy=cod_imovel` +
      `&CQL_FILTER=cod_municipio_ibge=${m.cod}`;
    const fc = await pedir(url);
    total = Number(fc.numberMatched ?? fc.totalFeatures ?? fc.features.length);
    for (const f of fc.features) {
      const p = f.properties ?? {};
      if (!f.geometry || !p.cod_imovel || !/Polygon$/.test(f.geometry.type)) continue;
      const linha = {
        type: "Feature",
        geometry: { type: f.geometry.type, coordinates: arredondar(f.geometry.coordinates) },
        properties: {
          cod: p.cod_imovel,
          area_ha: p.area == null || p.area === "" ? null : Math.round(Number(p.area) * 100) / 100,
          condicao: p.condicao ?? null,
          status: p.status_imovel ?? null,
          tipo: p.tipo_imovel ?? null,
          municipio: p.municipio ?? m.nome,
          uf: uf.toUpperCase(),
        },
      };
      if (!gz.write(JSON.stringify(linha) + "\n")) await once(gz, "drain");
      n++;
    }
    if (!fc.features.length) break;
    inicio += fc.features.length;
  }
  gz.end();
  await once(saida, "close");
  if (n < total) throw new Error(`SICAR informou ${total} e vieram ${n}`);
  renameSync(temp, destino);
  writeFileSync(ok, JSON.stringify({ municipio: m.nome, imoveis: n, em: new Date().toISOString() }));
  return { n };
}

const estadoArq = join(DADOS, "car", "estado.json");
mkdirSync(join(DADOS, "car"), { recursive: true });
const estado = existsSync(estadoArq) ? JSON.parse(readFileSync(estadoArq, "utf8")) : {};

for (const uf of lista) {
  const pasta = join(DADOS, "car", uf);
  mkdirSync(pasta, { recursive: true });
  const ms = await municipiosDa(uf);
  const t0 = Date.now();
  let feitos = 0, imoveis = 0, falhas = [];
  for (let i = 0; i < ms.length; i += PARALELO) {
    const lote = ms.slice(i, i + PARALELO);
    const res = await Promise.allSettled(lote.map((m) => baixarMunicipio(uf, m, pasta)));
    res.forEach((r, j) => {
      if (r.status === "fulfilled") { feitos++; imoveis += r.value.n ?? 0; }
      else falhas.push(`${lote[j].nome}: ${r.reason?.message ?? r.reason}`);
    });
    process.stdout.write(`\r${uf.toUpperCase()} ${feitos + falhas.length}/${ms.length} municípios · ${imoveis} imóveis novos · ${falhas.length} falhas   `);
  }
  const s = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${uf.toUpperCase()} concluída em ${s}s${falhas.length ? ` — falharam (rodar de novo): ${falhas.slice(0, 5).join("; ")}` : ""}`);
  estado[uf] = { municipios: ms.length, falhas: falhas.length, em: new Date().toISOString() };
  writeFileSync(estadoArq, JSON.stringify(estado, null, 1));
}
