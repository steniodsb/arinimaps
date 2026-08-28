// Screenshot depois de clicar num item da lista (para ver o painel do imóvel).
import puppeteer from "puppeteer-core";
const [, , url, saida, seletor, espera = "9000", w = "1440", h = "850"] = process.argv;
const b = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const p = await b.newPage();
  await p.setViewport({ width: Number(w), height: Number(h) });
  await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  const ok = await p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, seletor);
  console.log(ok ? "clicou em " + seletor : "seletor nao encontrado: " + seletor);
  await new Promise((r) => setTimeout(r, Number(espera)));
  await p.screenshot({ path: saida });
  console.log("salvo:", saida);
} finally {
  await b.close();
}
