export function parse(text, fields, name) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let row = [], field = "", quoted = false, closed = false, line = 1;
  for (let i = 0; i <= text.length; i++) {
    let ch = text[i];
    if (ch === "\r" && text[i + 1] === "\n") { i++; ch = "\n"; }
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else if (ch === undefined) throw new Error(name + ": unclosed quoted field.");
      else { field += ch; if (ch === "\n" || ch === "\r") line++; }
      continue;
    }
    if (ch === "," || ch === "\n" || ch === "\r" || ch === undefined) {
      if (ch === ",") row.push(field);
      else {
        if (row.length || field || closed) records.push({ values: [...row, field], line });
        row = [];
        line++;
      }
      field = ""; closed = false;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (closed || ch === '"') throw new Error(name + ": invalid quoting on line " + line);
    else field += ch;
  }
  const header = records.shift()?.values.map(value => value.trim()) ?? [];
  const positions = fields.map(field => header.indexOf(field));
  if (positions.includes(-1) || new Set(header).size !== header.length)
    throw new Error(name + ": expected " + fields.join(", ") + ".");
  if (records.length > 1048575) throw new Error(name + ": too many rows for Excel.");
  return records.map(({ values, line }) => {
    const selected = positions.map(index => values[index]?.trim());
    const amount = selected.pop();
    if (values.length !== header.length || selected.some(value => !value || value.length > 32767 || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) || !/^\d{1,12}(\.\d{1,2})?$/.test(amount ?? ""))
      throw new Error(name + ": check IDs, columns and amount on line " + line + ".");
    const [whole, fraction = ""] = amount.split(".");
    return [...selected, BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")), line];
  });
}

export function reconcile(ordersText, paymentsText, names) {
  const orders = parse(ordersText, ["order_id", "order_amount"], names[0]);
  const payments = parse(paymentsText, ["payment_id", "order_id", "payment_amount"], names[1]);
  const countIds = rows => {
    const counts = new Map();
    for (const [id] of rows) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  };
  const orderIds = countIds(orders), paymentIds = countIds(payments);
  const applied = new Map(), review = new Set();
  let raw = 0n, appliedTotal = 0n, excluded = 0n, uniqueTotal = 0n;
  const paymentRows = payments.map(([id, order, amount, line]) => {
    let status = "Applied";
    raw += amount;
    if (paymentIds.get(id) > 1) { status = "Duplicate payment ID"; review.add(order); }
    else if (orderIds.get(order) > 1) status = "Ambiguous order ID";
    else if (!orderIds.has(order)) status = "Unknown order ID";
    if (status === "Applied") {
      applied.set(order, (applied.get(order) ?? 0n) + amount);
      appliedTotal += amount;
    } else excluded += amount;
    return [id, order, amount, status, line];
  });
  let flagged = 0;
  const orderRows = orders.map(([id, amount, line]) => {
    const paid = applied.get(id) ?? 0n;
    const balance = orderIds.get(id) > 1 ? null : amount - paid;
    if (balance !== null) uniqueTotal += amount;
    let status = "Matched";
    if (balance === null) status = "Duplicate order ID";
    else if (review.has(id)) status = "Review duplicate payment";
    else if (balance < 0n) status = "Overpaid";
    else if (balance > 0n) status = paid === 0n ? "Unpaid" : "Partial payment";
    if (status !== "Matched") flagged++;
    return [id, amount, paid, balance, status, line];
  });
  return { names, orderRows, paymentRows, flagged, raw, appliedTotal, excluded, uniqueTotal };
}

export function money(value) {
  const magnitude = value < 0n ? -value : value;
  return (value < 0n ? "-" : "") + String(magnitude / 100n) + "." + String(magnitude % 100n).padStart(2,"0");
}

