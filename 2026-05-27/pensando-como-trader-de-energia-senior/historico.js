const STORAGE_KEY = "energiaRiskDesk.analyses";
const list = document.querySelector("#historyList");
const detailTitle = document.querySelector("#detailTitle");
const detailBody = document.querySelector("#detailBody");
const search = document.querySelector("#historySearch");
const deleteAnalysisButton = document.querySelector("#deleteAnalysisButton");

let selectedRecordId = null;

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

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function readStoredAnalyses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function moneyShort(value) {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  if (absolute >= 1000000) return `${currency.format(numeric / 1000000)} mi`;
  if (absolute >= 1000) return `${currency.format(numeric / 1000)} mil`;
  return currency.format(numeric);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function riskClass(score) {
  if (score >= 70) return "good";
  if (score >= 55) return "watch";
  return "bad";
}

function filteredRecords() {
  const term = search.value.trim().toLowerCase();
  const records = readStoredAnalyses();
  if (!term) return records;
  return records.filter((record) => `${record.company} ${record.cnpj}`.toLowerCase().includes(term));
}

function updateSummary(records) {
  const companies = new Set(records.map((record) => record.cnpj || record.company));
  const average = records.length ? Math.round(records.reduce((sum, record) => sum + Number(record.score || 0), 0) / records.length) : 0;

  document.querySelector("#totalAnalyses").textContent = records.length;
  document.querySelector("#totalCounterparties").textContent = companies.size;
  document.querySelector("#averageScore").textContent = average;
  document.querySelector("#latestDate").textContent = records[0] ? dateTime.format(new Date(records[0].createdAt)) : "-";
}

function selectRecord(id) {
  const record = readStoredAnalyses().find((item) => item.id === id);
  if (!record) return;

  selectedRecordId = id;
  deleteAnalysisButton.disabled = false;
  detailTitle.textContent = record.company;
  detailBody.classList.remove("empty-state");
  detailBody.innerHTML = `
    <div class="detail-score ${riskClass(record.score)}">
      <strong>${escapeHtml(record.score)}</strong>
      <span>${escapeHtml(record.rating)} · ${escapeHtml(record.decision)}</span>
    </div>
    <dl class="detail-grid">
      <div><dt>Data</dt><dd>${dateTime.format(new Date(record.createdAt))}</dd></div>
      <div><dt>CNPJ</dt><dd>${escapeHtml(record.cnpj)}</dd></div>
      <div><dt>Tipo</dt><dd>${escapeHtml(record.counterpartyType)}</dd></div>
      <div><dt>Anos da empresa</dt><dd>${escapeHtml(record.companyAge ?? "")}</dd></div>
      <div><dt>Categoria do negócio</dt><dd>${escapeHtml(record.businessCategory || "")}</dd></div>
      <div><dt>Limite sugerido</dt><dd>${moneyShort(record.suggestedLimit)}</dd></div>
      <div><dt>Contratos futuros líquidos</dt><dd>${moneyShort(record.metrics?.netFutureContracts)}</dd></div>
      <div><dt>Exposição líquida</dt><dd>${moneyShort(record.metrics?.netExposure)}</dd></div>
      <div><dt>Garantia adicional</dt><dd>${moneyShort(record.additionalGuarantee)}</dd></div>
      <div><dt>PD</dt><dd>${percent.format(record.pd || 0)}</dd></div>
      <div><dt>LGD</dt><dd>${percent.format(record.lgd || 0)}</dd></div>
      <div><dt>Dívida líquida / EBITDA</dt><dd>${Number(record.metrics?.netDebtToEbitda || 0).toFixed(2)}x</dd></div>
      <div><dt>Liquidez corrente ajustada</dt><dd>${Number(record.metrics?.currentRatio || 0).toFixed(2)}x</dd></div>
    </dl>
    <div class="memo-box">
      <span>Parecer</span>
      <p>${escapeHtml(record.memo)}</p>
    </div>
  `;

  document.querySelectorAll(".history-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.id === id);
  });
}

function renderHistory() {
  const records = filteredRecords();
  updateSummary(records);

  if (!records.length) {
    list.innerHTML = `
      <div class="empty-state">
        Nenhuma análise registrada para esse filtro.
      </div>
    `;
    detailTitle.textContent = "Selecione uma análise";
    detailBody.className = "detail-body empty-state";
    detailBody.textContent = "Nenhum registro selecionado.";
    selectedRecordId = null;
    deleteAnalysisButton.disabled = true;
    return;
  }

  list.innerHTML = records
    .map(
      (record) => `
        <button class="history-item" type="button" data-id="${escapeHtml(record.id)}">
          <span>
            <strong>${escapeHtml(record.company)}</strong>
            <small>${escapeHtml(record.cnpj)} · ${dateTime.format(new Date(record.createdAt))}</small>
          </span>
          <b class="${riskClass(record.score)}">${escapeHtml(record.rating)} ${escapeHtml(record.score)}</b>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".history-item").forEach((button) => {
    button.addEventListener("click", () => selectRecord(button.dataset.id));
  });

  selectRecord(records[0].id);
}

search.addEventListener("input", renderHistory);
document.querySelector("#clearHistoryButton").addEventListener("click", () => {
  if (!confirm("Deseja limpar todo o histórico salvo neste navegador?")) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

deleteAnalysisButton.addEventListener("click", () => {
  if (!selectedRecordId) return;
  const records = readStoredAnalyses();
  const selected = records.find((record) => record.id === selectedRecordId);
  if (!selected) return;
  if (!confirm(`Deseja excluir somente a análise de ${selected.company}?`)) return;

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records.filter((record) => record.id !== selectedRecordId)),
  );
  renderHistory();
});

renderHistory();
