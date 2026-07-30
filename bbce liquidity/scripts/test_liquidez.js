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
  // Aba Análise (horizontes) — volume total por família.
  liquidez: { MEN: "36.551,068", ANU: "4.448,366", TRI: "5.056,977", SEM: "2.581,138" },
  // Aba Preços — estatísticas de preço.
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
  await page.waitForSelector("#tbl-MEN", { timeout: 8000 });
  await page.waitForTimeout(400);

  let failures = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}` + (ok ? "" : `  |  ${detail}`));
    if (!ok) failures++;
  };

  // Aba Análise (horizontes): totais de volume por família
  for (const [fam, expected] of Object.entries(EXPECTED.liquidez)) {
    const total = await page.textContent(`#tbl-${fam} tbody tr.total`).catch(() => "");
    check(`${fam}: volume ${expected}`, total && total.includes(expected), `obtido: ${total}`);
  }

  // Aba Preços: estatísticas de preço
  await page.click('.tab-btn[data-tab="precos"]');
  await page.waitForSelector("#tab-precos .kpi", { timeout: 5000 });
  await page.waitForTimeout(200);
  const kpis = await page.$$eval("#tab-precos .kpi", (els) =>
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

  const fwdRows = await page.$$eval("#tab-precos .block table tbody tr", (t) => t.length).catch(() => 0);
  check("curva a termo tem linhas", fwdRows > 0, `linhas: ${fwdRows}`);

  const menVwap = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#tab-precos table tbody tr"));
    for (const r of rows) {
      const head = r.querySelector(".rowhead");
      if (head && head.textContent.trim() === "MEN" && r.children.length >= 4) {
        return r.children[3].textContent.trim();
      }
    }
    return "";
  });
  check(`MEN VWAP ≈ ${EXPECTED.menVwap}`, Math.abs(numBR(menVwap) - EXPECTED.menVwap) < TOL, `obtido ${menVwap}`);

  // Abas: apenas Análise e Preços (Comparador e Dados BBCE removidos)
  const tabs = await page.$$eval("#tabbar .tab-btn", (els) => els.map((e) => e.dataset.tab));
  check(`abas = Análise + Preços`, tabs.length === 2 && tabs.includes("analise") && tabs.includes("precos"), `abas: ${tabs.join(",")}`);

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
