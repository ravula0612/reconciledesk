import { money, parse } from "./logic.mjs";
import { workbook } from "./report.mjs";

export const invoiceFields = ["invoice_id", "sales_rep", "invoice_amount"];
export const costFields = ["cost_id", "invoice_id", "cost_amount"];
export const commissionFields = ["invoice_id", "recorded_commission"];
export const invoiceHeaders = [
  "Invoice ID", "Sales Rep", "Revenue", "Cost", "Gross Profit", "Calculated",
  "Recorded", "Difference", "Findings", "Invoice CSV line", "Cost CSV lines", "Commission CSV line",
];
export const inputHeaders = ["File type", "Record ID", "Invoice ID", "Amount", "Status", "CSV line"];

function group(rows, key = 0) {
  const grouped = new Map();
  for (const row of rows) {
    const matches = grouped.get(row[key]) ?? [];
    matches.push(row);
    grouped.set(row[key], matches);
  }
  return grouped;
}

export function audit(invoicesText, costsText, recordedText, rateText, names) {
  const rate = rateText.trim();
  if (!/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.test(rate))
    throw new Error("Enter a rate between 0 and 100 with up to two decimal places.");
  const [whole, fraction = ""] = rate.split(".");
  const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const invoices = parse(invoicesText, invoiceFields, names[0]);
  const costs = parse(costsText, costFields, names[1]);
  const recorded = recordedText === null ? [] : parse(recordedText, commissionFields, names[2]);
  if (!invoices.length) throw new Error("The invoices file needs at least one data row.");
  if ([invoices, costs, recorded].some(rows => rows.length > 100000))
    throw new Error("Use files with at most 100,000 data rows each.");
  const invoiceIds = group(invoices);
  const costIds = group(costs);
  const costsByInvoice = group(costs, 1);
  const recordedByInvoice = group(recorded);
  const inputRows = [];
  const duplicateCostInvoices = new Set();

  for (const [id, invoice, amount, line] of costs) {
    const issues = [];
    if (costIds.get(id).length > 1) {
      issues.push("Duplicate cost ID");
      duplicateCostInvoices.add(invoice);
    }
    if (!invoiceIds.has(invoice)) issues.push("Unknown invoice ID");
    if (invoiceIds.get(invoice)?.length > 1) issues.push("Duplicate invoice ID");
    inputRows.push(["Cost", id, invoice, amount, issues.join("; ") || "Linked", line]);
  }
  for (const [invoice, amount, line] of recorded) {
    const issues = [];
    if (recordedByInvoice.get(invoice).length > 1) issues.push("Duplicate recorded commission");
    if (!invoiceIds.has(invoice)) issues.push("Unknown invoice ID");
    if (invoiceIds.get(invoice)?.length > 1) issues.push("Duplicate invoice ID");
    inputRows.push(["Recorded commission", invoice, invoice, amount, issues.join("; ") || "Linked", line]);
  }

  let ready = 0, held = 0, compared = 0, differences = 0;
  let calculatedTotal = 0n, recordedCompared = 0n, differenceTotal = 0n;
  const invoiceRows = invoices.map(([id, rep, revenue, line]) => {
    const linkedCosts = costsByInvoice.get(id) ?? [];
    const linkedRecorded = recordedByInvoice.get(id) ?? [];
    const issues = [];
    if (invoiceIds.get(id).length > 1) issues.push("Duplicate invoice ID");
    if (!linkedCosts.length) issues.push("Missing cost");
    if (duplicateCostInvoices.has(id)) issues.push("Duplicate linked cost");
    let cost = null, profit = null, calculated = null, difference = null;
    if (issues.length) held++;
    else {
      ready++;
      cost = linkedCosts.reduce((sum, row) => sum + row[2], 0n);
      profit = revenue - cost;
      const eligibleProfit = profit > 0n ? profit : 0n;
      calculated = (eligibleProfit * basisPoints + 5000n) / 10000n;
      calculatedTotal += calculated;
    }
    const [,, recordedLine] = linkedRecorded[0] ?? [];
    const recordedAmount = linkedRecorded.length === 1 ? linkedRecorded[0][1] : null;
    if (linkedRecorded.length > 1) issues.push("Duplicate recorded commission");
    if (recordedText !== null && !linkedRecorded.length) issues.push("Missing recorded commission");
    if (calculated !== null && recordedAmount !== null) {
      compared++;
      difference = calculated - recordedAmount;
      recordedCompared += recordedAmount;
      differenceTotal += difference;
      if (difference !== 0n) {
        issues.push("Commission difference");
        differences++;
      }
    }
    const costLines = linkedCosts.map(row => row[3]).join(", ");
    const costEvidence = costLines.length <= 32767 ? costLines : "See Input Audit for all cost lines";
    return [id, rep, revenue, cost, profit, calculated, recordedAmount, difference,
      issues.join("; ") || (recordedText === null ? "Calculated" : "Agrees"),
      line, costEvidence, linkedRecorded.length === 1 ? recordedLine : null];
  });
  const inputIssues = inputRows.filter(row => row[4] !== "Linked").length;
  return {
    names, rate, invoiceRows, inputRows, ready, held, compared, differences,
    calculatedTotal, recordedCompared, differenceTotal, inputIssues,
  };
}

export function explain(row) {
  const [id, rep, revenue, cost, profit, calculated, recorded, difference, findings, line, costLines, recordedLine] = row;
  const amounts = calculated === null ? "Calculation is on hold." :
    "Revenue " + money(revenue) + " less costs " + money(cost) + " gives gross profit " +
    money(profit) + ". Calculated commission is " + money(calculated) + ".";
  const comparison = difference === null ? "" :
    " Recorded commission was " + money(recorded) + ", a calculated-minus-recorded difference of " + money(difference) + ".";
  return id + " (" + rep + ") � " + findings + ". " + amounts + comparison +
    " Invoice CSV line " + line + ". " +
    (costLines ? "Cost evidence: " + costLines + ". " : "") +
    (recordedLine ? "Commission CSV line " + recordedLine + "." : "");
}

export function auditWorkbook(result) {
  const summary = [
    ["Metric", "Value"],
    ["Invoices file", result.names[0]], ["Costs file", result.names[1]],
    ["Recorded commissions file", result.names[2] ?? "Omitted"],
    ["Commission rate", result.rate + "%"],
    ["Rule", "Positive gross profit x rate, rounded to cents per invoice"],
    ["Invoice rows", result.invoiceRows.length], ["Calculated rows", result.ready],
    ["Held rows", result.held], ["Compared rows", result.compared],
    ["Rows with a commission difference", result.differences], ["Input rows with issues", result.inputIssues],
    ["Calculated total (all calculated rows)", result.calculatedTotal],
    ["Recorded total (compared rows only)", result.recordedCompared],
    ["Calculated less recorded (compared rows only)", result.differenceTotal],
  ];
  return workbook({
    Summary: summary,
    "Invoice Review": [invoiceHeaders, ...result.invoiceRows],
    "Input Audit": [inputHeaders, ...result.inputRows],
  });
}
