// Captura uma página nos dois temas, clicando no botão de tema — assim o que
// se vê é o caminho real do usuário, não um data-tema injetado por fora.
// Uso: node scripts/screenshot-tema.mjs <url> <prefixo> [esperaMs] [largura] [altura]
import puppeteer from "puppeteer-core";

const [, , url, prefixo, esperaMs = "7000", largura = "1440", altura = "1000"] = process.argv;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(largura), height: Number(altura) });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(esperaMs)));
  await page.screenshot({ path: `${prefixo}-escuro.png` });

  const clicou = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => (x.getAttribute("aria-label") ?? "").includes("tema"));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicou) { console.error("BOTÃO DE TEMA NÃO ENCONTRADO"); process.exit(1); }

  await new Promise((r) => setTimeout(r, Number(esperaMs)));
  const tema = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));
  await page.screenshot({ path: `${prefixo}-claro.png` });

  // recarrega para provar que a escolha persiste e não pisca
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  const persistiu = await page.evaluate(() => document.documentElement.getAttribute("data-tema"));

  console.log(`salvo: ${prefixo}-escuro.png e ${prefixo}-claro.png`);
  console.log(`data-tema após clicar: ${tema} | após recarregar: ${persistiu}`);
  if (erros.length) console.log("erros no console:", erros.slice(0, 3));
} finally {
  await browser.close();
}
