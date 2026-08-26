// Verificação visual headless: captura páginas do app com Chrome/Edge local.
// Uso: node scripts/screenshot.mjs <url> <saida.png> [esperaMs] [largura] [altura] [textoDoBotaoParaClicar]
import puppeteer from "puppeteer-core";

const [, , url, saida, esperaMs = "6000", largura = "1440", altura = "900", clicar] = process.argv;
if (!url || !saida) {
  console.error("Uso: node scripts/screenshot.mjs <url> <saida.png> [esperaMs]");
  process.exit(1);
}

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--window-size=${largura},${altura}`,
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(largura), height: Number(altura) });
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => erros.push("PAGEERROR: " + String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  if (clicar) {
    await new Promise((r) => setTimeout(r, 5000));
    const achou = await page.evaluate((texto) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === texto);
      if (b) { b.click(); return true; }
      return false;
    }, clicar);
    console.log(achou ? `clicou em "${clicar}"` : `botão "${clicar}" não encontrado`);
  }
  await new Promise((r) => setTimeout(r, Number(esperaMs)));
  await page.screenshot({ path: saida, type: "png" });
  console.log("salvo:", saida);
  if (erros.length) console.log("ERROS DO CONSOLE:\n" + erros.slice(0, 8).join("\n"));
} finally {
  await browser.close();
}
