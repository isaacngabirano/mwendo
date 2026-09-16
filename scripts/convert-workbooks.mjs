// One-time data migration script.
//
// Reads the two real Mwendo Foods Excel workbooks and produces clean CSVs
// that match the column names the app's Settings > Import Data screen
// expects. Run this once with the actual files, then upload the resulting
// CSVs through the app UI.
//
// Usage:
//   node scripts/convert-workbooks.mjs \
//     "/path/to/FULL_REPORT....xlsx" \
//     "/path/to/MWENDO_FOODS_DISTRIBUTERS....xlsx" \
//     ./converted
//
import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const [, , fullReportPath, phase1Path, outDir = "./converted"] = process.argv;

if (!fullReportPath || !phase1Path) {
  console.error(
    "Usage: node scripts/convert-workbooks.mjs <FULL_REPORT.xlsx> <PHASE1.xlsx> [outDir]"
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

function toCSV(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

function sheetToRows(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
}

function toTitleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toISODate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    // Excel serial date -> JS date (Excel's epoch quirk included).
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(value ?? "");
}

// ---------- 1. PRODUCTS ----------
// Source: "1.1)Stock costing & pricing" in the FULL_REPORT workbook.
// Category is derived from the "CATEGORY:Item Name" prefix in the
// Product/Service column itself, NOT from the sparse "Categorries" column —
// that column only labels the first row of some groups and is missing or
// misleading for others (e.g. it would mislabel Rice/Salt/Peas as
// "SERVICES" because of a stray "Hours" service row in between).
function extractProducts() {
  const wb = XLSX.readFile(fullReportPath, { cellDates: true });
  const rows = sheetToRows(wb, "1.1)Stock costing & pricing");
  const products = [];

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const [, , productService, type, , , , , , cost, price, stockQty] = row;
    if (!productService || !String(productService).trim()) continue;
    if (String(type).trim() !== "Inventory") continue; // skip "Service" rows like "Hours"

    const raw = String(productService).trim();
    const colonIndex = raw.indexOf(":");
    const category = colonIndex >= 0 ? raw.slice(0, colonIndex).trim() : "Uncategorised";
    let name = colonIndex >= 0 ? raw.slice(colonIndex + 1).trim() : raw;
    name = name.replace(/\s+/g, " ").trim();

    const costNum = Number(cost) || 0;
    const priceNum = Number(price) || 0;
    const stockNum = Number(stockQty) || 0;
    // Skip fully-empty duplicate/placeholder rows (a known artefact in this
    // sheet, e.g. a stray "BEANS YELLOW" row with no unit and all zeros,
    // duplicating the real "BEANS YELLOW (KGS)" row below it).
    if (costNum === 0 && priceNum === 0 && stockNum === 0) continue;

    let baseUnit = "piece";
    if (/\bKG/i.test(name)) baseUnit = "kg";
    else if (/LTR/i.test(name) || /\dL\b/i.test(name)) baseUnit = "litre";

    products.push({
      sku: `SKU-${String(products.length + 1).padStart(3, "0")}`,
      name: toTitleCase(name),
      category: toTitleCase(category),
      baseUnit,
      costPrice: costNum,
      price: priceNum,
      stockQty: stockNum,
    });
  }
  return products;
}

// ---------- 2. SUPPLIERS ----------
// Source: "4_Suppliers" in the Phase 1 workbook. Real rows have a Supplier
// ID like "S001" in column A — a trailing notes/commentary row without a
// valid ID is skipped rather than imported as a fake supplier.
function extractSuppliers() {
  const wb = XLSX.readFile(phase1Path, { cellDates: true });
  const rows = sheetToRows(wb, "4_Suppliers");
  const suppliers = [];
  for (let i = 4; i < rows.length; i++) {
    const [id, category, productsSupplied, , location] = rows[i];
    if (!id || !/^S\d+$/i.test(String(id).trim())) continue;
    suppliers.push({
      name: category || String(id).trim(),
      category: category || "",
      productsSupplied: productsSupplied || "",
      contact: "",
      location: location || "",
    });
  }
  return suppliers;
}

// ---------- 3. CUSTOMERS ----------
// Source: "3_Customers" in the Phase 1 workbook. Same guard against a
// trailing notes row as above — valid rows have a Customer ID like "C001".
function extractCustomers() {
  const wb = XLSX.readFile(phase1Path, { cellDates: true });
  const rows = sheetToRows(wb, "3_Customers");
  const customers = [];
  for (let i = 4; i < rows.length; i++) {
    const [id, name, type] = rows[i];
    if (!id || !/^C\d+$/i.test(String(id).trim())) continue;
    if (!name || !String(name).trim()) continue;
    customers.push({
      name: String(name).trim(),
      type: String(type).toLowerCase().includes("credit") ? "Credit" : "Walk-in",
      contact: "",
      creditBalance: 0,
    });
  }
  return customers;
}

// ---------- 4. HISTORICAL SALES (for reference / reports) ----------
// Source: "5) Cash sales" in the FULL_REPORT workbook. Header row index 1.
function extractHistoricalSales() {
  const wb = XLSX.readFile(fullReportPath, { cellDates: true });
  const rows = sheetToRows(wb, "5) Cash sales");
  const sales = [];
  for (let i = 2; i < rows.length; i++) {
    const [date, item, , , qty, unitPrice, total] = rows[i];
    if (!date || !item) continue;
    sales.push({
      date: toISODate(date),
      product: String(item).trim(),
      quantity: Number(qty) || 0,
      unitPrice: Number(unitPrice) || 0,
      total: Number(total) || 0,
    });
  }
  return sales;
}

// ---------- 5. HISTORICAL PURCHASES ----------
// Source: "4) Cash purchases" in the FULL_REPORT workbook. Header row index 0.
function extractHistoricalPurchases() {
  const wb = XLSX.readFile(fullReportPath, { cellDates: true });
  const rows = sheetToRows(wb, "4) Cash purchases");
  const purchases = [];
  for (let i = 1; i < rows.length; i++) {
    const [date, item, , , , qty, unitCost, total] = rows[i];
    if (!date || !item) continue;
    purchases.push({
      date: toISODate(date),
      product: String(item).trim(),
      quantity: Number(qty) || 0,
      unitCost: Number(unitCost) || 0,
      total: Number(total) || 0,
    });
  }
  return purchases;
}

const products = extractProducts();
const suppliers = extractSuppliers();
const customers = extractCustomers();
const historicalSales = extractHistoricalSales();
const historicalPurchases = extractHistoricalPurchases();

fs.writeFileSync(path.join(outDir, "products.csv"), toCSV(products));
fs.writeFileSync(path.join(outDir, "suppliers.csv"), toCSV(suppliers));
fs.writeFileSync(path.join(outDir, "customers.csv"), toCSV(customers));
fs.writeFileSync(path.join(outDir, "historical-sales.csv"), toCSV(historicalSales));
fs.writeFileSync(path.join(outDir, "historical-purchases.csv"), toCSV(historicalPurchases));

console.log(`Products:              ${products.length} rows`);
console.log(`Suppliers:             ${suppliers.length} rows`);
console.log(`Customers:             ${customers.length} rows`);
console.log(`Historical sales:      ${historicalSales.length} rows`);
console.log(`Historical purchases:  ${historicalPurchases.length} rows`);
console.log(`\nWritten to ${outDir}/`);
