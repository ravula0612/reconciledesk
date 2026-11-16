import { reconcile, money } from "./logic.mjs";
import { report, orderHeaders, paymentHeaders } from "./report.mjs";
const get = id => document.getElementById(id);
let result;

function table(target, headers, rows) {
  const head = document.createElement("thead");
  const heading = head.insertRow();
  for (const name of headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    heading.append(cell);
  }
  const body = document.createElement("tbody");
  for (const values of rows.slice(0, 100)) {
    const row = body.insertRow();
    for (const value of values) row.insertCell().textContent = typeof value === "bigint" ? money(value) : value ?? "—";
  }
  target.replaceChildren(head, body);
}

async function run(load) {
  get("run").disabled = get("demo").disabled = true;
  get("error").hidden = get("results").hidden = true;
  result = undefined;
  try {
    const [orders, payments, names] = await load();
    result = reconcile(orders, payments, names);
    const cards = [
      ["Orders to review", result.flagged], ["Applied payments", money(result.appliedTotal)],
      ["Excluded payments", money(result.excluded)], ["Payment control difference", money(result.raw - result.appliedTotal - result.excluded)],
    ].map(([label, value]) => {
      const card = document.createElement("div");
      card.className = "metric";
      const title = document.createElement("small"), amount = document.createElement("strong");
      title.textContent = label;
      amount.textContent = value;
      card.append(title, amount);
      return card;
    });
    get("metrics").replaceChildren(...cards);
    get("source").textContent = names.join(" · ");
    table(get("order-table"), orderHeaders, result.orderRows);
    table(get("payment-table"), paymentHeaders, result.paymentRows);
    get("limit").textContent = Math.max(result.orderRows.length, result.paymentRows.length) > 100 ? "Each preview shows up to 100 rows. Download Excel for the full report." : "";
    get("results").hidden = false;
    get("result-title").focus();
  } catch (error) {
    get("error").textContent = error.message;
    get("error").hidden = false;
  } finally {
    get("run").disabled = get("demo").disabled = false;
  }
}

get("run").onclick = () => run(async () => {
  const files = [get("orders").files[0], get("payments").files[0]];
  if (files.some(file => !file)) throw new Error("Select both CSV files.");
  if (files.some(file => file.size > 10_000_000)) throw new Error("Each CSV must be 10 MB or smaller.");
  const decoder = new TextDecoder("utf-8", {fatal: true});
  const texts = await Promise.all(files.map(async file => {
    let bytes;
    try { bytes = await file.arrayBuffer(); }
    catch { throw new Error(file.name + ": the browser could not read this file. Download it again and reselect it."); }
    try { return decoder.decode(bytes); }
    catch { throw new Error(file.name + ": save this file as UTF-8 CSV and try again."); }
  }));
  return [...texts, files.map(file => file.name)];
});
get("demo").onclick = () => run(async () => {
  const names = ["sample-orders.csv", "sample-payments.csv"];
  const texts = await Promise.all(names.map(async name => {
    const response = await fetch("./" + name);
    if (!response.ok) throw new Error("The sample could not load. Try again.");
    return response.text();
  }));
  return [...texts, names];
});
get("export").onclick = () => {
  if (!result) return;
  const url = URL.createObjectURL(report(result));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ReconcileDesk_Report.xlsx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

