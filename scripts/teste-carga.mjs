// Teste de carga: N pessoas simultâneas usando o site (docs/INFRA-NACIONAL.md §5, item 6).
//
// Cada "pessoa" repete, até acabar o tempo, uma mistura parecida com a do pico:
//   60% mexe no mapa   → ~12 tiles do CAR (/api/tiles/car/{z}/{x}/{y}.pbf) em volta de
//                        Iturama, zoom 10–13, 6 de cada vez (como o navegador)
//   15% recarrega os imóveis do mapa (/api/geo/imoveis)
//   25% abre uma página (/, /imoveis, /mapa)
// com uma pausa curta entre ações (PAUSA_MS) — bem menor que a de gente de verdade,
// para que 20 "pessoas" aqui pesem como muito mais do que 20 no site.
//
// Uso:
//   node scripts/teste-carga.mjs
//   BASE_URL=https://homolog.ariniimoveisbrasil.com.br USUARIOS=100 DURACAO_S=60 node scripts/teste-carga.mjs
//
// Variáveis: BASE_URL (padrão http://localhost:3000), USUARIOS (20), DURACAO_S (20),
// PAUSA_MS (pausa máxima entre ações, padrão 1500), RAMPA_S (tempo para todos entrarem,
// padrão 3), SIMULAR_IPS (1 = cada pessoa manda um X-Forwarded-For próprio, para o
// limite por IP valer por pessoa e não derrubar o teste inteiro; 0 = todas com o IP real).
//
// O site em fase de testes pede a senha de acesso: o script faz POST /api/acesso uma vez
// com SITE_SENHA (lida do .env.local, como os outros scripts) e reutiliza o cookie.
//
// ATENÇÃO: contra `next dev` os números NÃO valem para dimensionar — o modo de
// desenvolvimento compila sob demanda, não tem cache de produção e roda com checagens
// extras. Meça contra `next build && next start` (ou a homologação).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// lê .env.local manualmente (sem dotenv), sem sobrescrever o que veio do ambiente
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const USUARIOS = Math.max(1, Number(process.env.USUARIOS) || 20);
const DURACAO_S = Math.max(1, Number(process.env.DURACAO_S) || 20);
const PAUSA_MS = Math.max(0, Number(process.env.PAUSA_MS ?? 1500));
const RAMPA_S = Math.max(0, Number(process.env.RAMPA_S ?? 3));
const SIMULAR_IPS = process.env.SIMULAR_IPS !== "0";
const TIMEOUT_MS = 30_000;

/** Centro do teste: Iturama/MG. */
const CENTRO = { lng: -50.2, lat: -19.73 };
const PAGINAS = ["/", "/imoveis", "/mapa"];

// ---------------------------------------------------------------- medições
/** tipo → { ms: number[], status: Map<string, n>, bytes } */
const medidas = new Map();
function anotar(tipo, ms, status, bytes) {
  let m = medidas.get(tipo);
  if (!m) medidas.set(tipo, (m = { ms: [], status: new Map(), bytes: 0, erros: 0 }));
  m.ms.push(ms);
  m.status.set(status, (m.status.get(status) ?? 0) + 1);
  m.bytes += bytes;
  // erro = falha de rede/tempo, 4xx (inclui 429 do limite e redirecionamento para a senha) e 5xx
  if (!/^(2\d\d|304)$/.test(status)) m.erros++;
}

let cookie = "";

async function pedir(tipo, caminho, ip) {
  const t0 = performance.now();
  let status = "rede";
  let bytes = 0;
  try {
    const r = await fetch(BASE_URL + caminho, {
      redirect: "manual", // página redirecionando para /acesso = senha não aceita: conta como erro
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(ip ? { "X-Forwarded-For": ip } : {}),
        "Accept-Encoding": "gzip",
        "User-Agent": "AriniTesteCarga/1.0",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    bytes = (await r.arrayBuffer()).byteLength; // tempo medido até o fim do corpo
    status = String(r.status);
  } catch (e) {
    status = e?.name === "TimeoutError" ? "tempo" : "rede";
  }
  anotar(tipo, performance.now() - t0, status, bytes);
}

// ---------------------------------------------------------------- ações de uma pessoa
const sortear = (a, b) => a + Math.random() * (b - a);
const inteiro = (a, b) => Math.floor(sortear(a, b + 1));
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Tile XYZ (Web Mercator) que contém o ponto. */
function tileDe(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Um movimento do mapa: tela de 4×3 tiles num ponto qualquer a até ~25 km de Iturama. */
async function moverMapa(ip) {
  const z = inteiro(10, 13);
  const { x, y } = tileDe(CENTRO.lng + sortear(-0.25, 0.25), CENTRO.lat + sortear(-0.25, 0.25), z);
  const tiles = [];
  for (let dx = -2; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push(`/api/tiles/car/${z}/${x + dx}/${y + dy}.pbf`);
  // o navegador abre ~6 conexões por servidor: 6 de cada vez
  for (let i = 0; i < tiles.length; i += 6) {
    await Promise.all(tiles.slice(i, i + 6).map((t) => pedir(`tile z${z}`, t, ip)));
  }
}

async function pessoa(indice, fim) {
  const ip = SIMULAR_IPS ? `10.77.${Math.floor(indice / 250)}.${(indice % 250) + 1}` : null;
  await dormir((RAMPA_S * 1000 * indice) / USUARIOS);
  while (Date.now() < fim) {
    const sorte = Math.random();
    if (sorte < 0.6) await moverMapa(ip);
    else if (sorte < 0.75) await pedir("geo imoveis", "/api/geo/imoveis", ip);
    else {
      const p = PAGINAS[inteiro(0, PAGINAS.length - 1)];
      await pedir(`página ${p}`, p, ip);
    }
    await dormir(sortear(0, PAUSA_MS));
  }
}

// ---------------------------------------------------------------- entrada
async function entrar() {
  const senha = process.env.SITE_SENHA;
  if (!senha) {
    console.log("SITE_SENHA não definida: seguindo sem cookie de acesso (site sem bloqueio?).");
    return;
  }
  const r = await fetch(`${BASE_URL}/api/acesso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senha }),
  });
  if (!r.ok) {
    console.error(`POST /api/acesso respondeu ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  console.log("senha de acesso aceita; cookie reutilizado por todas as pessoas.");
}

// ---------------------------------------------------------------- relatório
function percentil(ordenado, p) {
  if (!ordenado.length) return 0;
  return ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)];
}
const ms = (v) => `${Math.round(v)} ms`.padStart(8);

function relatorio(segundos) {
  const tipos = [...medidas.keys()].sort();
  let total = 0, erros = 0;
  console.log(`\n${"TIPO".padEnd(18)}${"PEDIDOS".padStart(8)}${"REQ/S".padStart(8)}${"P50".padStart(8)}${"P95".padStart(8)}` +
    `${"P99".padStart(8)}${"MÁX".padStart(8)}${"ERRO".padStart(7)}  STATUS`);
  console.log("-".repeat(110));
  const linha = (nome, m) => {
    const o = [...m.ms].sort((a, b) => a - b);
    const status = [...m.status.entries()].sort().map(([s, n]) => `${s}×${n}`).join(" ");
    console.log(`${nome.padEnd(18)}${String(o.length).padStart(8)}${(o.length / segundos).toFixed(1).padStart(8)}` +
      `${ms(percentil(o, 50))}${ms(percentil(o, 95))}${ms(percentil(o, 99))}${ms(o[o.length - 1] ?? 0)}` +
      `${((100 * m.erros) / Math.max(1, o.length)).toFixed(1).padStart(6)}%  ${status}`);
  };
  const todos = { ms: [], status: new Map(), bytes: 0, erros: 0 };
  for (const t of tipos) {
    const m = medidas.get(t);
    linha(t, m);
    total += m.ms.length; erros += m.erros;
    todos.ms.push(...m.ms); todos.bytes += m.bytes; todos.erros += m.erros;
    for (const [s, n] of m.status) todos.status.set(s, (todos.status.get(s) ?? 0) + n);
  }
  console.log("-".repeat(110));
  linha("TOTAL", todos);
  console.log(`\n${total} pedidos em ${segundos.toFixed(1)} s = ${(total / segundos).toFixed(1)} req/s · ` +
    `${(todos.bytes / 1024 / 1024).toFixed(1)} MB recebidos · taxa de erro ${((100 * erros) / Math.max(1, total)).toFixed(2)}%`);
  if (/localhost|127\.0\.0\.1/.test(BASE_URL)) {
    console.log("\nAVISO: medido contra servidor local. Em `next dev` os tempos NÃO são representativos " +
      "(compilação sob demanda, sem otimizações de produção) — servem só para validar o script.");
  }
}

console.log(`Teste de carga: ${USUARIOS} pessoas por ${DURACAO_S} s contra ${BASE_URL}` +
  ` (pausa até ${PAUSA_MS} ms, rampa ${RAMPA_S} s, IPs simulados: ${SIMULAR_IPS ? "sim" : "não"})`);
await entrar();
const inicio = Date.now();
const fim = inicio + DURACAO_S * 1000;
const relogio = setInterval(() => {
  const feitos = [...medidas.values()].reduce((s, m) => s + m.ms.length, 0);
  process.stdout.write(`\r  ${Math.round((Date.now() - inicio) / 1000)} s · ${feitos} pedidos…`);
}, 1000);
await Promise.all(Array.from({ length: USUARIOS }, (_, i) => pessoa(i, fim)));
clearInterval(relogio);
relatorio((Date.now() - inicio) / 1000);
