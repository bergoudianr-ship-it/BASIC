const form = document.querySelector("#riskForm");
const inputs = document.querySelectorAll("input, select");
const ratioList = document.querySelector("#ratioList");
const scoreRing = document.querySelector("#scoreRing");
const tabs = document.querySelectorAll(".tab-button");
const panels = document.querySelectorAll(".tab-panel");
const STORAGE_KEY = "energiaRiskDesk.analyses";

let latestAnalysis = null;

const sample = {
  companyName: "Cliente Energia Livre S.A.",
  cnpj: "12.345.678/0001-90",
  counterpartyType: "Consumidor livre",
  currentAssets: 10000000,
  nonCurrentAssets: 25000000,
  futureCurrentAssets: 1800000,
  futureNonCurrentAssets: 4200000,
  currentLiabilities: 8000000,
  nonCurrentLiabilities: 12000000,
  futureCurrentLiabilities: 2500000,
  futureNonCurrentLiabilities: 3500000,
  equity: 15000000,
  revenue: 60000000,
  ebitda: 6000000,
  netIncome: 2500000,
  grossDebt: 14000000,
  cash: 3000000,
  averageVolume: 10,
  contractTerm: 24,
  estimatedExposure: 5000000,
  guarantees: 1500000,
  basePrice: 240,
  priceStress: 35,
  latePayments: 0,
  companyAge: 12,
  relationship: 36,
  dataQuality: 3,
  businessCategory: 1,
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function num(name) {
  const field = form.elements[name];
  return Number(field?.value || 0);
}

function ratio(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasCalculationInput() {
  return Array.from(form.elements).some((field) => "value" in field && field.value.trim() !== "");
}

function clearDashboard() {
  [
    "#scoreValue",
    "#ratingValue",
    "#decisionText",
    "#decisionReason",
    "#limitValue",
    "#expectedLossValue",
    "#netExposureValue",
    "#additionalGuaranteeValue",
    "#pdValue",
    "#lgdValue",
    "#eadValue",
    "#stressExposureValue",
    "#memoText",
  ].forEach((selector) => {
    document.querySelector(selector).textContent = "";
  });
  ratioList.innerHTML = "";
  scoreRing.style.setProperty("--score-angle", "0deg");
  document.querySelector("#decisionBand").style.setProperty("--primary", "var(--primary)");
  latestAnalysis = null;
}

function scoreByThreshold(value, rules) {
  const matched = rules.find((rule) => rule.test(value));
  return matched ? matched.score : 0;
}

function moneyShort(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${currency.format(value / 1000000)} mi`;
  if (absolute >= 1000) return `${currency.format(value / 1000)} mil`;
  return currency.format(value);
}

function ratingFor(score) {
  if (score >= 92) return "AAA";
  if (score >= 85) return "AA";
  if (score >= 75) return "A";
  if (score >= 65) return "BBB";
  if (score >= 55) return "BB";
  if (score >= 42) return "B";
  return "C";
}

function riskColor(score) {
  if (score >= 70) return "var(--green)";
  if (score >= 55) return "var(--amber)";
  return "var(--red)";
}

function decisionFor(score, additionalGuarantee) {
  if (score >= 75) return ["Aprovar com limite normal", "Liquidez positiva, alavancagem controlada e exposição compatível com o porte financeiro."];
  if (score >= 65) return ["Aprovar com monitoramento", "A contraparte é aceitável, mas pede revisão mais frequente e acompanhamento de covenants internos."];
  if (score >= 55) return ["Aprovar com garantia", `Operação possível mediante reforço mínimo de ${moneyShort(additionalGuarantee)} em garantia.`];
  if (score >= 42) return ["Reduzir prazo ou pré-pagar", "Risco elevado para exposição sem proteção. Recomenda-se prazo curto, garantia líquida ou pré-pagamento."];
  return ["Recusar ou operar 100% garantido", "Indicadores financeiros e comerciais não sustentam limite descoberto neste momento."];
}

function healthLabel(score) {
  if (score >= 75) return "Forte";
  if (score >= 58) return "Atenção";
  return "Crítico";
}

function collectMetrics() {
  const currentAssets = num("currentAssets");
  const nonCurrentAssets = num("nonCurrentAssets");
  const futureCurrentAssets = num("futureCurrentAssets");
  const futureNonCurrentAssets = num("futureNonCurrentAssets");
  const currentLiabilities = num("currentLiabilities");
  const nonCurrentLiabilities = num("nonCurrentLiabilities");
  const futureCurrentLiabilities = num("futureCurrentLiabilities");
  const futureNonCurrentLiabilities = num("futureNonCurrentLiabilities");
  const revenue = num("revenue");
  const ebitda = num("ebitda");
  const netIncome = num("netIncome");
  const equity = num("equity");
  const grossDebt = num("grossDebt");
  const cash = num("cash");
  const estimatedExposure = num("estimatedExposure");
  const guarantees = num("guarantees");
  const priceStress = num("priceStress") / 100;

  const adjustedCurrentAssets = currentAssets + futureCurrentAssets;
  const adjustedNonCurrentAssets = nonCurrentAssets + futureNonCurrentAssets;
  const adjustedCurrentLiabilities = currentLiabilities + futureCurrentLiabilities;
  const adjustedNonCurrentLiabilities = nonCurrentLiabilities + futureNonCurrentLiabilities;
  const totalAssets = adjustedCurrentAssets + adjustedNonCurrentAssets;
  const totalLiabilities = adjustedCurrentLiabilities + adjustedNonCurrentLiabilities;
  const netFutureContracts =
    futureCurrentAssets +
    futureNonCurrentAssets -
    futureCurrentLiabilities -
    futureNonCurrentLiabilities;
  const netDebt = grossDebt - cash;
  const workingCapital = adjustedCurrentAssets - adjustedCurrentLiabilities;
  const currentRatio = ratio(adjustedCurrentAssets / adjustedCurrentLiabilities);
  const generalLiquidity = ratio(totalAssets / totalLiabilities);
  const debtToAssets = ratio(totalLiabilities / totalAssets);
  const netDebtToEbitda = ratio(netDebt / ebitda, netDebt > 0 ? 9 : 0);
  const ebitdaMargin = ratio(ebitda / revenue);
  const roe = ratio(netIncome / equity);
  const guaranteeCoverage = ratio(guarantees / estimatedExposure);
  const stressExposure = estimatedExposure * (1 + priceStress);
  const netExposure = Math.max(estimatedExposure - guarantees, 0);

  return {
    currentAssets,
    futureCurrentAssets,
    futureNonCurrentAssets,
    currentLiabilities,
    futureCurrentLiabilities,
    futureNonCurrentLiabilities,
    adjustedCurrentAssets,
    adjustedCurrentLiabilities,
    totalAssets,
    totalLiabilities,
    netFutureContracts,
    revenue,
    ebitda,
    equity,
    netDebt,
    workingCapital,
    estimatedExposure,
    guarantees,
    stressExposure,
    netExposure,
    currentRatio,
    generalLiquidity,
    debtToAssets,
    netDebtToEbitda,
    ebitdaMargin,
    roe,
    guaranteeCoverage,
  };
}

function readStoredAnalyses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function calculateScore(metrics) {
  const liquidityScore =
    scoreByThreshold(metrics.currentRatio, [
      { test: (v) => v >= 1.8, score: 100 },
      { test: (v) => v >= 1.3, score: 84 },
      { test: (v) => v >= 1.0, score: 62 },
      { test: (v) => v >= 0.75, score: 38 },
      { test: () => true, score: 18 },
    ]) * 0.17 +
    scoreByThreshold(metrics.workingCapital, [
      { test: (v) => v > 0, score: 82 },
      { test: () => true, score: 28 },
    ]) * 0.08;

  const leverageScore =
    scoreByThreshold(metrics.netDebtToEbitda, [
      { test: (v) => v <= 1.5, score: 94 },
      { test: (v) => v <= 2.5, score: 78 },
      { test: (v) => v <= 3.5, score: 60 },
      { test: (v) => v <= 5, score: 38 },
      { test: () => true, score: 16 },
    ]) * 0.18 +
    scoreByThreshold(metrics.debtToAssets, [
      { test: (v) => v <= 0.45, score: 90 },
      { test: (v) => v <= 0.65, score: 72 },
      { test: (v) => v <= 0.8, score: 45 },
      { test: () => true, score: 18 },
    ]) * 0.07;

  const profitabilityScore =
    scoreByThreshold(metrics.ebitdaMargin, [
      { test: (v) => v >= 0.18, score: 92 },
      { test: (v) => v >= 0.1, score: 76 },
      { test: (v) => v >= 0.04, score: 54 },
      { test: () => true, score: 24 },
    ]) * 0.09 +
    scoreByThreshold(metrics.roe, [
      { test: (v) => v >= 0.15, score: 88 },
      { test: (v) => v >= 0.08, score: 70 },
      { test: (v) => v >= 0, score: 48 },
      { test: () => true, score: 15 },
    ]) * 0.06;

  const solvencyScore = scoreByThreshold(metrics.equity / Math.max(metrics.totalAssets, 1), [
    { test: (v) => v >= 0.45, score: 90 },
    { test: (v) => v >= 0.3, score: 74 },
    { test: (v) => v >= 0.15, score: 50 },
    { test: () => true, score: 18 },
  ]) * 0.15;

  const latePayments = Number(form.elements.latePayments.value);
  const companyAge = Number(form.elements.companyAge.value);
  const relationship = Number(form.elements.relationship.value);
  const dataQuality = Number(form.elements.dataQuality.value);
  const businessCategory = Number(form.elements.businessCategory.value);

  const historyScore =
    clamp(
      82 - latePayments * 22 + relationship * 0.28 + dataQuality * 4 + Math.min(companyAge, 20) * 0.8 - businessCategory * 5,
      10,
      100,
    ) * 0.1;

  const energyScore =
    scoreByThreshold(metrics.guaranteeCoverage, [
      { test: (v) => v >= 0.8, score: 92 },
      { test: (v) => v >= 0.45, score: 76 },
      { test: (v) => v >= 0.2, score: 58 },
      { test: () => true, score: 38 },
    ]) * 0.04 +
    scoreByThreshold(metrics.netExposure / Math.max(metrics.revenue, 1), [
      { test: (v) => v <= 0.05, score: 92 },
      { test: (v) => v <= 0.12, score: 74 },
      { test: (v) => v <= 0.22, score: 50 },
      { test: () => true, score: 22 },
    ]) * 0.06;

  return Math.round(liquidityScore + leverageScore + profitabilityScore + solvencyScore + historyScore + energyScore);
}

function renderRatios(metrics) {
  const ratios = [
    {
      label: "Liquidez corrente ajustada",
      value: `${metrics.currentRatio.toFixed(2)}x`,
      score: clamp((metrics.currentRatio / 1.8) * 100, 0, 100),
    },
    {
      label: "Contratos futuros líquidos",
      value: moneyShort(metrics.netFutureContracts),
      score: metrics.netFutureContracts >= 0 ? 78 : clamp(70 + metrics.netFutureContracts / 100000, 15, 70),
    },
    {
      label: "Dívida líquida / EBITDA",
      value: `${metrics.netDebtToEbitda.toFixed(2)}x`,
      score: clamp(100 - (metrics.netDebtToEbitda / 5) * 100, 0, 100),
      inverse: true,
    },
    {
      label: "Endividamento",
      value: percent.format(metrics.debtToAssets),
      score: clamp(100 - metrics.debtToAssets * 100, 0, 100),
      inverse: true,
    },
    {
      label: "Margem EBITDA",
      value: percent.format(metrics.ebitdaMargin),
      score: clamp((metrics.ebitdaMargin / 0.2) * 100, 0, 100),
    },
    {
      label: "Cobertura por garantias",
      value: percent.format(metrics.guaranteeCoverage),
      score: clamp(metrics.guaranteeCoverage * 100, 0, 100),
    },
    {
      label: "Capital de giro",
      value: moneyShort(metrics.workingCapital),
      score: metrics.workingCapital > 0 ? 82 : 25,
    },
  ];

  ratioList.innerHTML = ratios
    .map((item) => {
      const color = item.score >= 70 ? "var(--green)" : item.score >= 48 ? "var(--amber)" : "var(--red)";
      return `
        <div class="ratio-row">
          <label><span>${item.label}</span><strong>${item.value}</strong></label>
          <span class="badge" style="--badge-color:${color}">${healthLabel(item.score)}</span>
          <div class="ratio-bar"><span style="--bar-width:${item.score}%;--bar-color:${color}"></span></div>
        </div>
      `;
    })
    .join("");
}

function updateDashboard() {
  if (!hasCalculationInput()) {
    clearDashboard();
    return;
  }

  const metrics = collectMetrics();
  const score = calculateScore(metrics);
  const rating = ratingFor(score);
  const pd = clamp((100 - score) / 1000 + Number(form.elements.latePayments.value) * 0.015, 0.006, 0.18);
  const lgd = clamp(1 - metrics.guaranteeCoverage * 0.72, 0.18, 0.92);
  const ead = metrics.estimatedExposure;
  const expectedLoss = pd * lgd * ead;
  const suggestedLimit = clamp(metrics.ebitda * (score / 100) * 1.3 + metrics.guarantees * 0.6, 0, metrics.revenue * 0.18);
  const targetCoverage = score >= 75 ? 0.2 : score >= 65 ? 0.35 : score >= 55 ? 0.55 : 1;
  const additionalGuarantee = Math.max(ead * targetCoverage - metrics.guarantees, 0);
  const [decision, reason] = decisionFor(score, additionalGuarantee);
  const company = document.querySelector("#companyName").value || "Contraparte analisada";
  const cnpj = document.querySelector("#cnpj").value || "CNPJ não informado";
  const counterpartyType = document.querySelector("#counterpartyType").value;
  const businessCategoryField = form.elements.businessCategory;
  const businessCategory = businessCategoryField.options[businessCategoryField.selectedIndex]?.text || "";
  const companyAge = Number(form.elements.companyAge.value || 0);

  document.querySelector("#scoreValue").textContent = score;
  document.querySelector("#ratingValue").textContent = rating;
  document.querySelector("#decisionText").textContent = decision;
  document.querySelector("#decisionReason").textContent = reason;
  document.querySelector("#limitValue").textContent = moneyShort(suggestedLimit);
  document.querySelector("#expectedLossValue").textContent = moneyShort(expectedLoss);
  document.querySelector("#netExposureValue").textContent = moneyShort(metrics.netExposure);
  document.querySelector("#additionalGuaranteeValue").textContent = moneyShort(additionalGuarantee);
  document.querySelector("#pdValue").textContent = percent.format(pd);
  document.querySelector("#lgdValue").textContent = percent.format(lgd);
  document.querySelector("#eadValue").textContent = moneyShort(ead);
  document.querySelector("#stressExposureValue").textContent = moneyShort(metrics.stressExposure);

  const color = riskColor(score);
  document.querySelector("#decisionBand").style.setProperty("--primary", color);
  scoreRing.style.setProperty("--score-angle", `${score * 3.6}deg`);

  document.querySelector("#memoText").textContent =
    `${company}, ${cnpj}, apresenta rating interno ${rating} e score ${score}/100. ` +
    `A análise indica liquidez corrente ajustada de ${metrics.currentRatio.toFixed(2)}x, contratos futuros líquidos de ${moneyShort(metrics.netFutureContracts)}, ` +
    `dívida líquida/EBITDA de ${metrics.netDebtToEbitda.toFixed(2)}x, endividamento ajustado de ${percent.format(metrics.debtToAssets)} e exposição líquida de ${moneyShort(metrics.netExposure)}. ` +
    `Recomenda-se ${decision.toLowerCase()}, com limite indicativo de ${moneyShort(suggestedLimit)} e perda esperada de ${moneyShort(expectedLoss)}.`;

  latestAnalysis = {
    id: createId(),
    createdAt: new Date().toISOString(),
    company,
    cnpj,
    counterpartyType,
    companyAge,
    businessCategory,
    score,
    rating,
    decision,
    reason,
    suggestedLimit,
    expectedLoss,
    additionalGuarantee,
    pd,
    lgd,
    ead,
    memo: document.querySelector("#memoText").textContent,
    metrics: {
      currentRatio: metrics.currentRatio,
      generalLiquidity: metrics.generalLiquidity,
      debtToAssets: metrics.debtToAssets,
      netFutureContracts: metrics.netFutureContracts,
      adjustedCurrentAssets: metrics.adjustedCurrentAssets,
      adjustedCurrentLiabilities: metrics.adjustedCurrentLiabilities,
      netDebtToEbitda: metrics.netDebtToEbitda,
      ebitdaMargin: metrics.ebitdaMargin,
      roe: metrics.roe,
      workingCapital: metrics.workingCapital,
      netExposure: metrics.netExposure,
      stressExposure: metrics.stressExposure,
      guaranteeCoverage: metrics.guaranteeCoverage,
      revenue: metrics.revenue,
      ebitda: metrics.ebitda,
      equity: metrics.equity,
    },
  };

  renderRatios(metrics);
}

function loadSample() {
  Object.entries(sample).forEach(([key, value]) => {
    const field = document.querySelector(`#${key}`) || form.elements[key];
    if (field) field.value = value;
  });
  updateDashboard();
}

function registerAnalysis() {
  updateDashboard();
  if (!latestAnalysis) {
    alert("Preencha os dados da análise antes de registrar.");
    return;
  }
  const registerButton = document.querySelector("#registerButton");
  const storedAnalyses = readStoredAnalyses();
  const record = { ...latestAnalysis, id: createId() };

  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...storedAnalyses]));
  registerButton.textContent = "Registrado";
  window.setTimeout(() => {
    registerButton.textContent = "Registrar análise";
  }, 1400);
  const historyWindow = window.open("historico.html", "_blank", "noopener");
  if (!historyWindow) window.location.assign("historico.html");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    panels.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("active");
  });
});

inputs.forEach((input) => input.addEventListener("input", updateDashboard));
document.querySelector("#sampleButton").addEventListener("click", loadSample);
document.querySelector("#registerButton").addEventListener("click", registerAnalysis);
document.querySelector("#historyLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.location.href = "historico.html";
});
document.querySelector("#printButton").addEventListener("click", () => window.print());
document.querySelector("#copyButton").addEventListener("click", async () => {
  const text = document.querySelector("#memoText").textContent;
  await navigator.clipboard.writeText(text);
  document.querySelector("#copyButton").textContent = "Copiado";
  window.setTimeout(() => {
    document.querySelector("#copyButton").textContent = "Copiar";
  }, 1400);
});

updateDashboard();
