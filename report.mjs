import template from "./template.mjs";
import { money } from "./logic.mjs";

export const orderHeaders = ["Order ID", "Order amount", "Applied payments", "Balance", "Status", "CSV line"];
export const paymentHeaders = ["Payment ID", "Order ID", "Payment amount", "Status", "CSV line"];

function worksheet(rows) {
  const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const columns = rows[0].map((_, i) => {
    const width = Math.min(55, rows.reduce((max, row) => Math.max(max, String(row[i] ?? "").length + 3), 13));
    return '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + width + '" customWidth="1"/>';
  }).join("");
  const body = rows.map((row, i) => '<row r="' + (i+1) + '">' + row.map((value, j) => {
    if (value === null) return "";
    const cell = '<c r="' + String.fromCharCode(65+j) + (i+1) + '"';
    if (typeof value === "number") return cell + '><v>' + value + '</v></c>';
    if (typeof value === "bigint" && value > -1000000000000000n && value < 1000000000000000n)
      return cell + ' s="2"><v>' + money(value) + '</v></c>';
    return cell + ' s="' + (i === 0 ? 1 : 0) + '" t="inlineStr"><is><t xml:space="preserve">' + xml(typeof value === "bigint" ? money(value) : value) + '</t></is></c>';
  }).join("") + '</row>').join("");
  return '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + columns + '</cols><sheetData>' + body + '</sheetData><autoFilter ref="A1:' + String.fromCharCode(64+rows[0].length) + rows.length + '"/></worksheet>';
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n;
});

function zip(entries) {
  const encode = new TextEncoder();
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [name, content] of Object.entries(entries)) {
    const path = encode.encode(name), data = encode.encode(content);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    const local = new DataView(new ArrayBuffer(30));
    const central = new DataView(new ArrayBuffer(46));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, 33, true);
    local.setUint32(14, crc ^ 0xffffffff, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, path.length, true);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer).set(new Uint8Array(local.buffer, 4, 26), 6);
    central.setUint32(42, offset, true);
    parts.push(local.buffer, path, data);
    directory.push(central.buffer, path);
    offset += 30 + path.length + data.length;
    directorySize += 46 + path.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, directory.length / 2, true);
  end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function report(result) {
  const summary = [
    ["Metric", "Value"], ["Orders file", result.names[0]], ["Payments file", result.names[1]],
    ["Order rows", result.orderRows.length], ["Payment rows", result.paymentRows.length],
    ["Order rows to review", result.flagged], ["Unique order amount", result.uniqueTotal],
    ["Raw payment amount", result.raw], ["Applied payment amount", result.appliedTotal],
    ["Excluded payment amount", result.excluded], ["Payment control difference", result.raw - result.appliedTotal - result.excluded],
  ];
  return zip({ ...template,
    "xl/worksheets/sheet1.xml": worksheet(summary),
    "xl/worksheets/sheet2.xml": worksheet([orderHeaders, ...result.orderRows]),
    "xl/worksheets/sheet3.xml": worksheet([paymentHeaders, ...result.paymentRows]),
  });
}
