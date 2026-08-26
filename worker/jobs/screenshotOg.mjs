// Screenshot da página do imóvel para imagem OG de compartilhamento.
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

export async function screenshotOg(payload) {
  const { property_id, codigo } = payload;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630 });
    await page.goto(`${process.env.SITE_URL}/imovel/${codigo}`, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000)); // mapa terminar de pintar
    const png = await page.screenshot({ type: "png" });

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await supa.storage.from("media").upload(`og/${property_id}.png`, png, {
      contentType: "image/png", upsert: true,
    });
    if (error) throw new Error(error.message);
  } finally {
    await browser.close();
  }
}
