// Worker do Arini Maps — polling da tabela jobs (Postgres/Supabase).
// Processa: render_video · screenshot_og · tile_raster · fetch_pois · refresh_pois · gerar_lotes · descarte_retencao · verificar_fontes
// 1 job por vez, teto de memória no container (ver docker-compose).
import pg from "pg";
import { renderVideo } from "./jobs/renderVideo.mjs";
import { screenshotOg } from "./jobs/screenshotOg.mjs";
import { tileRaster } from "./jobs/tileRaster.mjs";
import { fetchPois } from "./jobs/fetchPois.mjs";
import { gerarLotes } from "./jobs/gerarLotes.mjs";
import { descarteRetencao } from "./jobs/descarteRetencao.mjs";
import { verificarFontes } from "./jobs/verificarFontes.mjs";

const INTERVALO_MS = Number(process.env.WORKER_INTERVALO_MS ?? 15000);
const MAX_TENTATIVAS = 3;

export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL, // postgres://postgres:SENHA@db.REF.supabase.co:5432/postgres
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const HANDLERS = {
  render_video: renderVideo,
  screenshot_og: screenshotOg,
  tile_raster: tileRaster,
  fetch_pois: fetchPois,
  // atualização periódica dos POIs (POST /api/admin/pois/atualizar): mesmo trabalho, outra origem
  refresh_pois: fetchPois,
  gerar_lotes: gerarLotes,
  descarte_retencao: descarteRetencao,
  // teste de queda e lentidão das fontes oficiais (PENDENCIAS 3.16)
  verificar_fontes: verificarFontes,
};

async function proximoJob() {
  // claim atômico: só um worker pega cada job
  const { rows } = await db.query(`
    update jobs set status = 'processando', tentativas = tentativas + 1, updated_at = now()
    where id = (
      select id from jobs
      where status = 'pendente' or (status = 'erro' and tentativas < $1)
      order by created_at
      limit 1
      for update skip locked
    )
    returning id, tipo, payload, tentativas
  `, [MAX_TENTATIVAS]);
  return rows[0] ?? null;
}

async function loop() {
  const job = await proximoJob().catch((e) => {
    console.error("erro ao buscar job:", e.message);
    return null;
  });

  if (job) {
    console.log(`[job ${job.id}] ${job.tipo} (tentativa ${job.tentativas})`);
    const handler = HANDLERS[job.tipo];
    try {
      if (!handler) throw new Error(`tipo desconhecido: ${job.tipo}`);
      await handler(job.payload, db, job);
      await db.query(`update jobs set status = 'concluido', erro = null where id = $1`, [job.id]);
      console.log(`[job ${job.id}] concluído`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[job ${job.id}] falhou: ${msg}`);
      await db.query(`update jobs set status = 'erro', erro = $2 where id = $1`, [job.id, msg.slice(0, 2000)]);
    }
    setImmediate(loop); // tem fila? segue direto
    return;
  }
  setTimeout(loop, INTERVALO_MS);
}

// Rotinas diárias: enfileira o descarte por prazo de guarda (item 6.4) uma vez
// a cada 24 h. Com os prazos em 0 (padrão) o job termina sem fazer nada; com
// prazos e "Descartar de verdade" desligado, só simula e registra.
async function agendarRotinas() {
  try {
    await db.query(`
      insert into jobs (tipo, payload)
      select 'descarte_retencao', '{}'::jsonb
      where not exists (
        select 1 from jobs where tipo = 'descarte_retencao' and created_at > now() - interval '23 hours'
      )`);
  } catch (e) {
    console.error("agendar rotinas falhou:", e.message);
  }
}

// Teste de queda e lentidão das fontes oficiais a cada 6 h (VERIFICA_FONTES_HORAS).
// Três falhas seguidas deixam a fonte "instável" no relatório e no /admin/fontes.
const VERIFICA_FONTES_HORAS = Number(process.env.VERIFICA_FONTES_HORAS ?? 6);
async function agendarVerificacaoFontes() {
  try {
    await db.query(`
      insert into jobs (tipo, payload)
      select 'verificar_fontes', '{"origem":"worker"}'::jsonb
      where not exists (
        select 1 from jobs where tipo = 'verificar_fontes'
          and created_at > now() - make_interval(mins => $1::int)
      )`, [Math.max(10, Math.round(VERIFICA_FONTES_HORAS * 60) - 10)]);
  } catch (e) {
    console.error("agendar verificação das fontes falhou:", e.message);
  }
}

console.log("Arini Maps worker iniciado.");
agendarVerificacaoFontes();
setInterval(agendarVerificacaoFontes, 30 * 60 * 1000);
agendarRotinas();
setInterval(agendarRotinas, 60 * 60 * 1000);
loop();
