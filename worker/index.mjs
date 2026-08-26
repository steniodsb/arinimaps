// Worker do Arini Maps — polling da tabela jobs (Postgres/Supabase).
// Processa: render_video · screenshot_og · tile_raster · fetch_pois
// 1 job por vez, teto de memória no container (ver docker-compose).
import pg from "pg";
import { renderVideo } from "./jobs/renderVideo.mjs";
import { screenshotOg } from "./jobs/screenshotOg.mjs";
import { tileRaster } from "./jobs/tileRaster.mjs";
import { fetchPois } from "./jobs/fetchPois.mjs";

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
      await handler(job.payload, db);
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

console.log("Arini Maps worker iniciado.");
loop();
