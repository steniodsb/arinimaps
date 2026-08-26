// Diagnóstico do mapa: falhas de rede, estado do maplibre, chamadas de API.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const falhas = [];
  const respostas = [];
  page.on("requestfailed", (r) => falhas.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
  page.on("response", (r) => {
    const url = r.url();
    if (/cartocdn|arcgisonline|api\/geo|supabase/.test(url)) {
      respostas.push(`${r.status()} ${url.slice(0, 110)}`);
    }
  });
  page.on("console", (m) => {
    if (["error", "warn"].includes(m.type())) console.log("CONSOLE:", m.text().slice(0, 250));
  });
  await page.goto("http://localhost:3000/mapa", { waitUntil: "networkidle2", timeout: 60000 });
  const vitais = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const conta = () => { n++; if (n < 1000) requestAnimationFrame(conta); };
    requestAnimationFrame(conta);
    setTimeout(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      res({ framesEm2s: n, webgl: gl ? "ok" : "SEM WEBGL", hidden: document.hidden });
    }, 2000);
  }));
  console.log("=== VITAIS ===", JSON.stringify(vitais));
  await new Promise((r) => setTimeout(r, 8000));

  console.log("=== FALHAS DE REDE ===");
  console.log(falhas.slice(0, 12).join("\n") || "(nenhuma)");
  console.log("=== RESPOSTAS RELEVANTES (primeiras 15) ===");
  console.log(respostas.slice(0, 15).join("\n") || "(nenhuma)");
} finally {
  await browser.close();
}
