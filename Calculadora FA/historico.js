const HISTORY_KEY = "faCcee.history";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function ratio(value) {
  return Number.isFinite(Number(value)) ? `${number.format(Number(value))}x` : "n.a.";
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(records) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

function removeRecord(id) {
  const records = readHistory().filter((record) => record.id !== id);
  saveHistory(records);
  renderHistory();
}

function renderHistory() {
  const records = readHistory();
  const list = document.querySelector("#historyList");

  if (!records.length) {
    list.innerHTML = '<article class="report-item"><strong>Sem analises salvas.</strong><span>As analises salvas aparecem aqui com todos os detalhes.</span></article>';
    return;
  }

  list.innerHTML = records
    .map((record) => {
      const reportHtml = (record.reportItems || [])
        .map((item) => `<li>${item}</li>`)
        .join("");

      return `
        <article class="report-item">
          <strong>${record.companyName}</strong>
          <span>${record.cnpj || "CNPJ nao informado"} | ${new Date(record.timestamp).toLocaleString("pt-BR")}</span>
          <span>Analista: ${record.analyst || "-"}</span>
          <span>Parecer: ${record.decision} | Rating: ${record.rating} | Score: ${number.format(record.score || 0)}</span>
          <span>FA: ${ratio(record.fa)} | FA Risco: ${ratio(record.faRisk)} | RWA: ${money.format(record.rwa || 0)} | PLA: ${money.format(record.pla || 0)}</span>
          <span>VaR: ${money.format(record.varTotal || 0)} | Stress: ${money.format(record.stressTotal || 0)}</span>
          <span>Observacao: ${record.note || "-"}</span>
          <ul>${reportHtml}</ul>
          <button class="ghost delete-analysis" data-id="${record.id}" type="button">Apagar analise</button>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".delete-analysis").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (!window.confirm("Deseja apagar esta analise?")) return;
      removeRecord(id);
    });
  });
}

document.querySelector("#clearHistoryButton").addEventListener("click", () => {
  if (!window.confirm("Deseja apagar todo o historico?")) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();
