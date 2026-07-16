/*
 * Teste de fumaça (smoke test) da Calculadora de Liquidez usando Playwright.
 *
 * Abre liquidez.html (com a base embutida), confere que os totais por família
 * batem com os valores de referência e que o comparador funciona.
 *
 * Uso:
 *   node scripts/test_liquidez.js
 *
 * Requer Playwright/Chromium disponíveis no ambiente.
 */
const path = require("path");

// Ajuste o require conforme onde o Playwright está instalado no seu ambiente.
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

// Totais de referência (SE + CON + Preço Fixo, base Todos_Negocios.csv, 01/01–15/07/2026).
const EXPECTED = {
  MEN: "36.551,068",
  ANU: "4.448,366",
  TRI: "5.056,977",
  SEM: "2.581,138",
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE: " + m.text());
  });

  const file = "file://" + path.resolve(__dirname, "..", "liquidez.html");
  await page.goto(file);
  await page.waitForSelector("#tbl-MEN", { timeout: 8000 });
  await page.waitForTimeout(400);

  let failures = 0;
  for (const [fam, expected] of Object.entries(EXPECTED)) {
    const total = await page.textContent(`#tbl-${fam} tbody tr.total`).catch(() => "");
    const ok = total && total.includes(expected);
    console.log(`${ok ? "PASS" : "FAIL"}  ${fam}: esperado volume ${expected}` + (ok ? "" : `  |  obtido: ${total}`));
    if (!ok) failures++;
  }

  // Comparador
  await page.click('.tab-btn[data-tab="comparador"]');
  await page.waitForTimeout(300);
  const chips = await page.$$eval("#cmp-chips .cmp-chip", (els) => els.length);
  const prods = await page.$$eval("#cmp-prod-list option", (o) => o.length);
  console.log(`${chips > 0 ? "PASS" : "FAIL"}  comparador: ${chips} séries padrão, ${prods} produtos BBCE no autocomplete`);
  if (chips === 0) failures++;

  if (errors.length) {
    console.log("ERROS DE CONSOLE:", errors);
    failures++;
  }

  await browser.close();
  console.log(failures === 0 ? "\nTUDO OK" : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
