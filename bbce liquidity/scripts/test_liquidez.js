/*
 * Teste de fumaça (smoke test) da Análise de Preços usando Playwright.
 *
 * Abre liquidez.html (com a base embutida), confere que as estatísticas de
 * preço (VWAP, volatilidade, nº de produtos, curva a termo, tabela por família)
 * batem com os valores de referência e que o comparador funciona.
 *
 * Uso:
 *   node scripts/test_liquidez.js
 *
 * Requer Playwright/Chromium disponíveis no ambiente.
 */
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

// Referência: SE + CON + Preço Fixo, base Todos_Negocios.csv, período completo,
// após excluir cancelados e filtrar outliers intradiários (±20%). Valores
// conferidos por recálculo independente em Python a partir do CSV.
const EXPECTED = {
  produtos: 87,
  incluidos: "21.364",
  vwap: 284.62,
  volatilidade: 75.14,
  menVwap: 285.48,
};
const TOL = 0.1;

function numBR(s) {
  if (!s) return NaN;
  const m = String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(m);
}

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
  await page.waitForSelector("#tab-analise .kpi", { timeout: 8000 });
  await page.waitForTimeout(400);

  let failures = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}` + (ok ? "" : `  |  ${detail}`));
    if (!ok) failures++;
  };

  // KPIs de preço
  const kpis = await page.$$eval("#tab-analise .kpi", (els) =>
    els.map((e) => ({
      label: e.querySelector(".label").textContent.trim(),
      value: e.querySelector(".value").textContent.trim(),
      sub: (e.querySelector(".sub") || {}).textContent || "",
    }))
  );
  const find = (frag) => kpis.find((k) => k.label.toLowerCase().includes(frag)) || {};

  const prod = find("produtos");
  check(`produtos = ${EXPECTED.produtos}`, numBR(prod.value) === EXPECTED.produtos, `obtido ${prod.value}`);
  check(`incluídos ${EXPECTED.incluidos}`, (prod.sub || "").includes(EXPECTED.incluidos), `sub: ${prod.sub}`);

  const vwap = numBR(find("vwap").value);
  check(`VWAP ≈ ${EXPECTED.vwap}`, Math.abs(vwap - EXPECTED.vwap) < TOL, `obtido ${vwap}`);

  const vol = numBR(find("volatilidade").value);
  check(`volatilidade ≈ ${EXPECTED.volatilidade}`, Math.abs(vol - EXPECTED.volatilidade) < TOL, `obtido ${vol}`);

  // Curva a termo: tem linhas
  const fwdRows = await page.$$eval("#tab-analise .block table tbody tr", (t) => t.length).catch(() => 0);
  check("curva a termo tem linhas", fwdRows > 0, `linhas: ${fwdRows}`);

  // Tabela por família: VWAP de MEN
  const menVwap = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#tab-analise table tbody tr"));
    for (const r of rows) {
      const head = r.querySelector(".rowhead");
      if (head && head.textContent.trim() === "MEN" && r.children.length >= 4) {
        return r.children[3].textContent.trim();
      }
    }
    return "";
  });
  check(`MEN VWAP ≈ ${EXPECTED.menVwap}`, Math.abs(numBR(menVwap) - EXPECTED.menVwap) < TOL, `obtido ${menVwap}`);

  // Comparador
  await page.click('.tab-btn[data-tab="comparador"]');
  await page.waitForTimeout(300);
  const chips = await page.$$eval("#cmp-chips .cmp-chip", (els) => els.length);
  const prods = await page.$$eval("#cmp-prod-list option", (o) => o.length);
  check(`comparador: ${chips} séries, ${prods} produtos`, chips > 0 && prods > 100, `chips ${chips}, prods ${prods}`);

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
