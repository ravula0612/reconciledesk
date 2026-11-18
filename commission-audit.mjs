import { audit, auditWorkbook, explain, inputHeaders, invoiceHeaders } from "./commission.mjs";
import { money } from "./logic.mjs";

const get = id => document.getElementById(id);
const samples = {
  invoices: "invoice_id,sales_rep,invoice_amount\nINV-1001,Asha,1000\nINV-1002,Ravi,1500\nINV-1003,Asha,420\nINV-1004,Meera,900\nINV-1005,Meera,1100\n",
  costs: "cost_id,invoice_id,cost_amount\nC-01,INV-1001,250\nC-02,INV-1001,150\nC-03,INV-1002,600\nC-04,INV-1004,300\nC-04,INV-1004,300\nC-05,INV-1005,1105\nC-06,INV-9999,90\n",
  recorded: "invoice_id,recorded_commission\nINV-1001,60\nINV-1002,130\nINV-1003,42\nINV-1004,60\nINV-1005,0\n",
};
const previewLimit = 100;
const cleanStatuses = new Set(["Agrees", "Calculated"]);
const shownColumns = [0, 1, 2, 3, 5, 6, 7, 8];
let result;

function display(value) {
  if (typeof value === "bigint") return money(value);
  return value ?? "-";
}

function table(target, headers, rows) {
  const head = document.createElement("thead");
  const headerRow = head.insertRow();
  for (const name of headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    headerRow.append(cell);
  }
  const body = document.createElement("tbody");
  for (const values of rows.slice(0, previewLimit)) {
    const row = body.insertRow();
    for (const value of values) row.insertCell().textContent = display(value);
  }
  target.replaceChildren(head, body);
}

function renderInvoices() {
  const filter = get("filter").value;
  const rows = result.invoiceRows.filter(row => {
    switch (filter) {
      case "review": return !cleanStatuses.has(row[8]);
      case "held": return row[5] === null;
      case "difference": return row[7] !== null && row[7] !== 0n;
      default: return true;
    }
  });
  table(get("invoice-table"), shownColumns.map(column => invoiceHeaders[column]),
    rows.slice(0, previewLimit).map(row => shownColumns.map(column => row[column])));
  const shown = Math.min(rows.length, previewLimit);
  get("counter").textContent = shown + " of " + rows.length + " invoices shown for this filter.";
}

function render() {
  const metrics = [
    ["Invoices checked", result.invoiceRows.length], ["Calculations on hold", result.held],
    ["Commission differences", result.compared ? result.differences + " of " + result.compared : "-"],
    ["Calculated commission", money(result.calculatedTotal)],
  ];
  const cards = metrics.map(([label, value]) => {
    const card = document.createElement("div");
    card.className = "metric";
    const caption = document.createElement("small");
    const amount = document.createElement("strong");
    caption.textContent = label;
    amount.textContent = value;
    card.append(caption, amount);
    return card;
  });
  get("metrics").replaceChildren(...cards);
  get("source").textContent = result.names.filter(Boolean).join(" � ") + " � " + result.rate + "% of positive gross profit";
  get("filter").value = "all";
  get("explain-form").reset();
  get("explanation").hidden = true;
  renderInvoices();
  const inputRows = result.inputRows;
  get("input-title").textContent = "Input audit � " + result.inputIssues + " flagged � " +
    Math.min(inputRows.length, previewLimit) + " of " + inputRows.length + " rows shown";
  const byIssue = [...inputRows.filter(row => row[4] !== "Linked"), ...inputRows.filter(row => row[4] === "Linked")];
  table(get("input-table"), inputHeaders, byIssue);
  get("results").hidden = false;
  get("results-heading").focus();
}

async function readFile(file) {
  if (!file) return null;
  if (file.size > 10_000_000) throw new Error(file.name + " exceeds 10 MB.");
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(file.name + ": save as UTF-8 CSV and try again.");
  }
}

async function run(load) {
  get("run").disabled = get("demo").disabled = true;
  get("status").hidden = get("results").hidden = true;
  result = undefined;
  try {
    const values = await load();
    result = audit(...values);
    render();
  } catch (error) {
    get("status").textContent = error.message;
    get("status").hidden = false;
  } finally {
    get("run").disabled = get("demo").disabled = false;
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

get("audit-form").addEventListener("submit", event => {
  event.preventDefault();
  const files = Object.keys(samples).map(id => get(id).files[0]);
  const rate = get("rate").value;
  run(async () => [...await Promise.all(files.map(readFile)), rate, files.map(file => file?.name)]);
});
get("demo").addEventListener("click", () => run(() => {
  get("rate").value = "10";
  return [...Object.values(samples), "10", Object.keys(samples).map(id => "sample-" + id + ".csv")];
}));
get("samples").addEventListener("click", () => {
  const picker = get("sample-picker");
  picker.hidden = !picker.hidden;
  get("samples").setAttribute("aria-expanded", String(!picker.hidden));
});
for (const [id, content] of Object.entries(samples))
  get("sample-" + id).addEventListener("click", () => download(new Blob([content], { type: "text/csv;charset=utf-8" }), "sample-" + id + ".csv"));

get("filter").addEventListener("change", renderInvoices);
get("explain-form").addEventListener("submit", event => {
  event.preventDefault();
  const invoiceId = get("invoice-id").value.trim();
  const matches = result.invoiceRows.filter(row => row[0] === invoiceId);
  const panel = get("explanation");
  const explanations = matches.slice(0, 10).map(row => {
    const paragraph = document.createElement("p");
    paragraph.textContent = explain(row);
    return paragraph;
  });
  panel.replaceChildren(...explanations);
  if (!matches.length) panel.textContent = "No invoice found with that exact ID.";
  if (matches.length > 10) panel.append("Showing the first 10 invoice rows. Download Excel for the full audit.");
  panel.hidden = false;
});
get("export").addEventListener("click", () => download(auditWorkbook(result), "ReconcileDesk_Commission_Audit.xlsx"));
