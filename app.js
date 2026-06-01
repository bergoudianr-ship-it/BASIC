const months = ["M+0", "M+1", "M+2", "M+3", "M+4", "M+5", "M+6"];
const ratings = {
  AAA: 0.001,
  AA: 0.0025,
  A: 0.006,
  BBB: 0.015,
  BB: 0.04,
  B: 0.1,
  CCC: 0.25,
  "Sem rating": 0.08,
};

const defaultState = {
  company: {
    name: "",
    cnpj: "",
    analyst: "",
    note: "",
  },
  financial: {
    equity: 50000000,
    goodwill: 0,
    intangibles: 1200000,
    deductibleInvestments: 0,
    taxCredits: 800000,
    realEstate: 0,
    prepaid: 150000,
    subordinatedDebtAssets: 0,
    revenue: 180000000,
    ebitda: 12000000,
    netIncome: 4500000,
    cash: 18000000,
    grossDebt: 26000000,
    currentAssets: 64000000,
    currentLiabilities: 42000000,
  },
  parameters: {
    faReference: 1.5,
    confidence: 95,
    phiZ: 1.64,
    liquidationDays: 5,
    correlation: 1,
    k: 0,
    theta: 0.25,
    rwaCredit: 0,
    rwaOperational: 0,
    lgd: 55,
    stressUp: 32,
    stressDown: 24,
    pldMin: 61,
    pldMax: 752,
    includeExpectedLossInRwa: false,
    useStressAsAdditional: true,
  },
  portfolio: months.map((month, index) => ({
    month,
    hours: [744, 672, 744, 720, 744, 720, 744][index],
    exposure: [18, -10, 14, -6, 8, 4, -3][index],
    forward: [168, 171, 176, 181, 185, 190, 196][index],
    volatility: [18, 17, 17, 16, 16, 15, 15][index],
    rec: [42, 25, 36, 22, 25, 18, 14][index],
    pmRec: [155, 158, 160, 164, 168, 171, 175][index],
    req: [24, 35, 22, 28, 17, 14, 17][index],
    pmReq: [162, 166, 170, 174, 177, 181, 185][index],
    reqPv: 0,
    spreadReqPv: 0,
    recPv: 0,
    spreadRecPv: 0,
    acrRevenue: 0,
  })),
  counterparties: [
    { name: "Contraparte A", exposure: 6200000, mitigator: 2500000, rating: "A", revenueShare: 18 },
    { name: "Contraparte B", exposure: 3800000, mitigator: 500000, rating: "BBB", revenueShare: 11 },
    { name: "Contraparte C", exposure: 2100000, mitigator: 0, rating: "BB", revenueShare: 6 },
    { name: "", exposure: 0, mitigator: 0, rating: "Sem rating", revenueShare: 0 },
    { name: "", exposure: 0, mitigator: 0, rating: "Sem rating", revenueShare: 0 },
  ],
};

let state = clone(defaultState);

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeState(base, imported) {
  if (Array.isArray(base)) return Array.isArray(imported) ? imported : base;
  if (base && typeof base === "object") {
    return Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, mergeState(value, imported?.[key])]),
    );
  }
  return imported ?? base;
}

function getPath(path) {
  return path.split(".").reduce((acc, key) => acc?.[key], state);
}

function setPath(path, value) {
  const parts = path.split(".");
  let target = state;
  parts.slice(0, -1).forEach((part) => {
    target = target[part];
  });
  target[parts.at(-1)] = value;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "n.a.";
  return `${number.format(value)}x`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "n.a.";
  return percent.format(value);
}

function riskText(fa, reference, rating, pla) {
  if (pla <= 0) return "Critica";
  if (!Number.isFinite(fa) || fa > reference || rating === "CCC") return "Risco alto";
  if (fa > reference * 0.75 || ["BB", "B"].includes(rating)) return "Atencao";
  return "Operavel";
}

function renderPortfolioRows() {
  const body = document.querySelector("#portfolioRows");
  body.innerHTML = state.portfolio
    .map(
      (row, index) => `
        <tr>
          <td><strong>${row.month}</strong></td>
          <td><input data-path="portfolio.${index}.hours" type="number" step="1"></td>
          <td><input data-path="portfolio.${index}.exposure" type="number" step="0.1"></td>
          <td><input data-path="portfolio.${index}.forward" type="number" step="0.01"></td>
          <td><input data-path="portfolio.${index}.volatility" type="number" step="0.1"></td>
          <td><input data-path="portfolio.${index}.rec" type="number" step="0.1"></td>
          <td><input data-path="portfolio.${index}.pmRec" type="number" step="0.01"></td>
          <td><input data-path="portfolio.${index}.req" type="number" step="0.1"></td>
          <td><input data-path="portfolio.${index}.pmReq" type="number" step="0.01"></td>
          <td><input data-path="portfolio.${index}.acrRevenue" type="number" step="1000"></td>
          <td class="row-risk" id="rowRisk${index}">R$ 0</td>
        </tr>
      `,
    )
    .join("");
}

function renderCounterpartyRows() {
  const body = document.querySelector("#counterpartyRows");
  body.innerHTML = state.counterparties
    .map(
      (row, index) => `
        <tr>
          <td><input data-path="counterparties.${index}.name" type="text" placeholder="Nome"></td>
          <td><input data-path="counterparties.${index}.exposure" type="number" step="1000"></td>
          <td><input data-path="counterparties.${index}.mitigator" type="number" step="1000"></td>
          <td>
            <select data-path="counterparties.${index}.rating">
              ${Object.keys(ratings).map((rating) => `<option value="${rating}">${rating}</option>`).join("")}
            </select>
          </td>
          <td><input data-path="counterparties.${index}.revenueShare" type="number" step="0.1"></td>
          <td class="row-risk" id="counterpartyEad${index}">R$ 0</td>
        </tr>
      `,
    )
    .join("");
}

function syncInputs() {
  document.querySelectorAll("[data-path]").forEach((input) => {
    const value = getPath(input.dataset.path);
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
      return;
    }
    input.value = value ?? "";
  });
}

function calculate() {
  const f = state.financial;
  const p = state.parameters;
  const deductions =
    f.goodwill +
    f.intangibles +
    f.deductibleInvestments +
    f.taxCredits +
    f.realEstate +
    f.prepaid +
    f.subordinatedDebtAssets;
  const pla = f.equity - deductions;
  const sqrtD = Math.sqrt(Math.max(0, p.liquidationDays));
  const confidence = clamp(p.confidence / 100, 0.5, 0.999);
  const lgd = clamp(p.lgd / 100, 0, 1);

  const monthResults = state.portfolio.map((row) => {
    const sigma = Math.max(0, row.volatility / 100);
    const mtm = row.exposure * row.forward * row.hours;
    const resContr = (row.req * row.pmReq - row.rec * row.pmRec) * row.hours;
    const finPv = (row.reqPv * row.spreadReqPv - row.recPv * row.spreadRecPv) * row.hours;
    const varValue = Math.abs(mtm) * p.phiZ * sigma * sqrtD;
    const cvar = Math.abs(mtm) * sigma * sqrtD * (normalPdf(p.phiZ) / Math.max(0.001, 1 - confidence));
    const stressPrice =
      row.exposure >= 0
        ? Math.max(p.pldMin, row.forward * (1 - p.stressDown / 100))
        : Math.min(p.pldMax, row.forward * (1 + p.stressUp / 100));
    const stressLoss = Math.abs(row.exposure) * row.hours * Math.abs(row.forward - stressPrice);
    const risk = varValue + (p.useStressAsAdditional ? stressLoss * p.theta : cvar * p.theta);
    return { ...row, mtm, resContr, finPv, varValue, cvar, stressLoss, risk };
  });

  const varVector = monthResults.map((row) => row.varValue);
  const rho = clamp(p.correlation, -1, 1);
  let varQuadratic = 0;
  for (let i = 0; i < varVector.length; i += 1) {
    for (let j = 0; j < varVector.length; j += 1) {
      varQuadratic += varVector[i] * (i === j ? 1 : rho) * varVector[j];
    }
  }

  const varTotal = Math.sqrt(Math.max(0, varQuadratic));
  const stressTotal = monthResults.reduce((sum, row) => sum + row.stressLoss, 0);
  const cvarTotal = monthResults.reduce((sum, row) => sum + row.cvar, 0);
  const additionalRisk = p.useStressAsAdditional ? stressTotal : cvarTotal;
  const rwaMarket = Math.max(p.k * varTotal, varTotal) + p.theta * Math.max(p.k * additionalRisk, additionalRisk);

  const counterparties = state.counterparties.map((row) => {
    const ead = Math.max(0, row.exposure - row.mitigator);
    const pd = ratings[row.rating] ?? ratings["Sem rating"];
    const expectedLoss = ead * pd * lgd;
    return { ...row, ead, pd, expectedLoss };
  });

  const eadTotal = counterparties.reduce((sum, row) => sum + row.ead, 0);
  const expectedLoss = counterparties.reduce((sum, row) => sum + row.expectedLoss, 0);
  const topEad = Math.max(0, ...counterparties.map((row) => row.ead));
  const revenueConcentration = Math.max(0, ...counterparties.map((row) => row.revenueShare / 100));
  const rwaCredit = p.rwaCredit + (p.includeExpectedLossInRwa ? expectedLoss : 0);
  const rwa = rwaMarket + rwaCredit + p.rwaOperational;

  const pnl = monthResults.reduce((sum, row) => sum + row.mtm, 0) + monthResults.reduce((sum, row) => sum + row.resContr, 0);
  const finPv = monthResults.reduce((sum, row) => sum + row.finPv, 0);
  const acrRevenue = monthResults.reduce((sum, row) => sum + row.acrRevenue, 0);
  const resFin = pnl + finPv + acrRevenue;
  const faRisk = pla !== 0 ? rwa / pla : Infinity;
  const fa = pla > 0 ? Math.max(0, (rwa - resFin) / pla) : Infinity;

  const liquidity = f.currentLiabilities > 0 ? f.currentAssets / f.currentLiabilities : Infinity;
  const netDebt = f.grossDebt - f.cash;
  const netDebtEbitda = f.ebitda !== 0 ? netDebt / f.ebitda : Infinity;
  const ebitdaMargin = f.revenue > 0 ? f.ebitda / f.revenue : 0;
  const netMargin = f.revenue > 0 ? f.netIncome / f.revenue : 0;
  const exposureNet = state.portfolio.reduce((sum, row) => sum + row.exposure, 0);
  const concentrationPenalty = pla > 0 ? topEad / pla : 1;
  const expectedLossRatio = pla > 0 ? expectedLoss / pla : 1;
  const faPenalty = Number.isFinite(fa) ? fa : 4;
  const faRiskPenalty = Number.isFinite(faRisk) ? faRisk : 4;
  const liquidityPenalty = Number.isFinite(liquidity) ? Math.max(0, 1.1 - liquidity) : 0;
  const leveragePenalty = Number.isFinite(netDebtEbitda) ? Math.max(0, netDebtEbitda - 2.5) : 8;
  const marginPenalty = Math.max(0, 0.04 - ebitdaMargin);
  const score = clamp(
    100 -
      faPenalty * 18 -
      faRiskPenalty * 8 -
      liquidityPenalty * 20 -
      leveragePenalty * 5 -
      marginPenalty * 160 -
      expectedLossRatio * 130 -
      concentrationPenalty * 22 -
      revenueConcentration * 10 -
      (netMargin < 0 ? 8 : 0),
    0,
    100,
  );
  const rating =
    score >= 90 ? "AAA" : score >= 80 ? "AA" : score >= 70 ? "A" : score >= 60 ? "BBB" : score >= 50 ? "BB" : score >= 40 ? "B" : "CCC";

  return {
    deductions,
    pla,
    monthResults,
    varTotal,
    stressTotal,
    cvarTotal,
    additionalRisk,
    rwaMarket,
    rwaCredit,
    rwa,
    pnl,
    finPv,
    acrRevenue,
    resFin,
    faRisk,
    fa,
    liquidity,
    netDebt,
    netDebtEbitda,
    ebitdaMargin,
    netMargin,
    counterparties,
    eadTotal,
    expectedLoss,
    topEad,
    revenueConcentration,
    exposureNet,
    score,
    rating,
  };
}

function riskClass(value, warning, bad) {
  if (!Number.isFinite(value) || value >= bad) return "risk-bad";
  if (value >= warning) return "risk-watch";
  return "risk-good";
}

function updateText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function updateUI() {
  const m = calculate();
  const p = state.parameters;
  const faClass = riskClass(m.fa, p.faReference * 0.75, p.faReference);
  const topRatio = m.pla > 0 ? m.topEad / m.pla : Infinity;
  const decision = riskText(m.fa, p.faReference, m.rating, m.pla);

  updateText("#faValue", Number.isFinite(m.fa) ? formatRatio(m.fa) : "n.a.");
  document.querySelector("#faValue").className = faClass;
  updateText("#faRiskValue", Number.isFinite(m.faRisk) ? formatRatio(m.faRisk) : "n.a.");
  updateText("#rwaValue", money.format(m.rwa));
  updateText("#rwaDetail", `${money.format(m.rwaMarket)} mercado`);
  updateText("#plaValue", money.format(m.pla));
  updateText("#deductionsValue", money.format(m.deductions));
  updateText("#ratingValue", m.rating);
  updateText("#ratingDetail", `${number.format(m.score)} pontos`);
  updateText("#scoreValue", Math.round(m.score));
  updateText("#decisionPill", decision);
  updateText("#portfolioDirection", m.exposureNet > 0.5 ? "Net long" : m.exposureNet < -0.5 ? "Net short" : "Net zerado");
  updateText("#portfolioStatus", `${money.format(m.varTotal)} VaR`);
  updateText("#financialStatus", `${money.format(m.deductions)} em deducoes`);
  updateText("#plaStatus", m.pla > 0 ? "PLA positivo" : "PLA negativo ou zerado");
  updateText("#liquidityValue", formatRatio(m.liquidity));
  updateText("#leverageValue", formatRatio(m.netDebtEbitda));
  updateText("#marginValue", formatPct(m.ebitdaMargin));
  updateText("#eadValue", money.format(m.eadTotal));
  updateText("#elValue", money.format(m.expectedLoss));
  updateText("#topEadValue", formatPct(topRatio));
  updateText("#revenueConcentrationValue", formatPct(m.revenueConcentration));
  updateText("#rwaCreditValue", money.format(m.rwaCredit));
  updateText("#lgdDisplayValue", formatPct(clamp(p.lgd / 100, 0, 1)));
  updateText(
    "#counterpartyStatus",
    topRatio > 0.25 ? "Concentracao alta" : topRatio > 0.1 ? "Acompanhar concentracao" : "Concentracao baixa",
  );
  updateText(
    "#faNote",
    m.pla <= 0 ? "PLA negativo ou zerado" : m.fa > p.faReference ? "Acima da referencia" : "Dentro da referencia",
  );

  const maxNeedle = Math.max(0.01, p.faReference * 1.5);
  const needle = clamp((Number.isFinite(m.fa) ? m.fa : maxNeedle) / maxNeedle, 0, 1);
  document.querySelector("#gaugeNeedle").style.transform = `rotate(${-180 + needle * 180}deg)`;
  document.querySelector("#scoreRing").style.setProperty("--score-angle", `${m.score * 3.6}deg`);

  m.monthResults.forEach((row, index) => {
    updateText(`#rowRisk${index}`, money.format(row.risk));
  });
  m.counterparties.forEach((row, index) => {
    updateText(`#counterpartyEad${index}`, money.format(row.ead));
  });

  renderMonthBars(m);
  renderReport(m, decision);
}

function renderMonthBars(metrics) {
  const max = Math.max(1, ...metrics.monthResults.map((row) => row.risk));
  document.querySelector("#monthBars").innerHTML = metrics.monthResults
    .map(
      (row) => `
        <div class="bar-row">
          <strong>${row.month}</strong>
          <div class="bar-track"><span style="width:${clamp((row.risk / max) * 100, 1, 100)}%"></span></div>
          <small>${money.format(row.risk)}</small>
        </div>
      `,
    )
    .join("");
}

function renderReport(m, decision) {
  const p = state.parameters;
  const company = state.company.name || "Empresa analisada";
  const flags = [];

  if (m.pla <= 0) flags.push(["PLA", "Patrimonio liquido ajustado negativo ou zerado. O FA fica sem leitura economica robusta."]);
  if (m.fa > p.faReference) flags.push(["FA", `FA de ${formatRatio(m.fa)} acima da referencia de ${formatRatio(p.faReference)}. A carteira consome capital economico demais para o PLA informado.`]);
  if (m.resFin < 0) flags.push(["Resultado prudencial", `RES_FIN negativo em ${money.format(m.resFin)}. O resultado financeiro agrava o fator total em vez de mitigar o RWA.`]);
  if (m.exposureNet > 0.5) flags.push(["Energia", `Portfolio liquido long em ${number.format(m.exposureNet)} MWm. Choque de queda nos precos pesa mais no stress.`]);
  if (m.exposureNet < -0.5) flags.push(["Energia", `Portfolio liquido short em ${number.format(Math.abs(m.exposureNet))} MWm. Choque de alta nos precos pesa mais no stress.`]);
  if (m.liquidity < 1) flags.push(["Liquidez", `Liquidez corrente de ${formatRatio(m.liquidity)}. Pode haver tensao de caixa antes da liquidacao economica da posicao.`]);
  if (m.netDebtEbitda > 3.5) flags.push(["Divida", `Divida liquida / EBITDA de ${formatRatio(m.netDebtEbitda)}. A contraparte tem menos folga para absorver MtM adverso.`]);
  if (m.expectedLoss > m.pla * 0.03 && m.pla > 0) flags.push(["Contraparte", `Perda esperada equivale a ${formatPct(m.expectedLoss / m.pla)} do PLA. Revise mitigadores e concentracao.`]);
  if (!flags.length) flags.push(["Leitura", "Cenario sem gatilho critico nos parametros atuais. O ponto sensivel passa a ser qualidade dos dados de preco, PLA e concentracao."]);

  const summary = [
    ["Parecer", `${company}: ${decision}. Rating interno ${m.rating}, score ${number.format(m.score)} e FA ${formatRatio(m.fa)}.`],
    ["Alavancagem", `FA_Risco ${formatRatio(m.faRisk)} com RWA total de ${money.format(m.rwa)} e PLA de ${money.format(m.pla)}.`],
    ["Mercado", `VaR total ${money.format(m.varTotal)}, stress ${money.format(m.stressTotal)} e RWA de mercado ${money.format(m.rwaMarket)}.`],
    ["Resultado", `RES_FIN ${money.format(m.resFin)}, composto por PnL ${money.format(m.pnl)}, FIN_PV ${money.format(m.finPv)} e ACR ${money.format(m.acrRevenue)}.`],
    ["Credito", `EAD liquido ${money.format(m.eadTotal)}, perda esperada ${money.format(m.expectedLoss)} e maior exposicao equivalente a ${formatPct(m.pla > 0 ? m.topEad / m.pla : Infinity)} do PLA.`],
  ];

  document.querySelector("#reportText").innerHTML = [...summary, ...flags]
    .map(([title, text]) => `<div class="report-item"><strong>${title}</strong><span>${text}</span></div>`)
    .join("");
}

function bindEvents() {
  document.addEventListener("input", (event) => {
    const input = event.target.closest("[data-path]");
    if (!input) return;
    const value = input.type === "checkbox" ? input.checked : input.type === "text" || input.tagName === "SELECT" ? input.value : toNumber(input.value);
    setPath(input.dataset.path, value);
    updateUI();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab, .tab-panel").forEach((element) => element.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.tab}`).classList.add("active");
    });
  });

  document.querySelector("#sampleButton").addEventListener("click", () => {
    state = clone(defaultState);
    renderAll();
  });

  document.querySelector("#exportButton").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cenario-fa-ccee.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  document.querySelector("#importButton").addEventListener("click", () => {
    document.querySelector("#importFile").click();
  });

  document.querySelector("#importFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = mergeState(clone(defaultState), imported);
      renderAll();
    } catch {
      alert("Arquivo JSON invalido.");
    } finally {
      event.target.value = "";
    }
  });

  document.querySelector("#printButton").addEventListener("click", () => window.print());

  document.querySelector("#copyReportButton").addEventListener("click", async () => {
    const text = Array.from(document.querySelectorAll(".report-item"))
      .map((item) => item.textContent.trim())
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    document.querySelector("#copyReportButton").textContent = "Copiado";
    window.setTimeout(() => {
      document.querySelector("#copyReportButton").textContent = "Copiar";
    }, 1400);
  });
}

function renderAll() {
  renderPortfolioRows();
  renderCounterpartyRows();
  syncInputs();
  updateUI();
}

bindEvents();
renderAll();
