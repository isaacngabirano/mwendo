"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Papa from "papaparse";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { currentBalance } from "@/lib/ledger";
import { formatUGX, formatDate } from "@/lib/format";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import type { LedgerName } from "@/lib/types";

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function defaultFrom() {
  const d = new Date();
  d.setDate(1); // start of this month — a natural default for "month/year" reporting
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

const TABS = ["Sales", "Stock", "Money", "Balance Sheet"] as const;
type Tab = (typeof TABS)[number];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("Sales");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray(), []);

  const rangeStart = useMemo(() => new Date(from), [from]);
  const rangeEnd = useMemo(() => {
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [to]);

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s) => {
      const d = new Date(s.date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [sales, rangeStart, rangeEnd]);

  const totalRevenue = filteredSales.reduce((a, s) => a + s.totalAmount, 0);

  function exportSalesReport() {
    const rows = filteredSales.flatMap((s) =>
      s.items.map((item) => ({
        Date: formatDate(s.date),
        Customer: s.customerName,
        Product: item.productName,
        Unit: item.sellUnitLabel,
        Quantity: item.quantity,
        UnitPrice: item.unitPrice,
        LineTotal: item.lineTotal,
        Payment: s.paymentMethod,
      }))
    );
    downloadCSV(rows, `sales-report-${from}-to-${to}.csv`);
  }

  function exportStockReport() {
    if (!products) return;
    const rows = products.map((p) => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category,
      BaseUnit: p.baseUnit,
      StockOnHand: p.stockQty,
      CostPrice: p.costPrice,
      StockValue: p.stockQty * p.costPrice,
      Status: p.status,
    }));
    downloadCSV(rows, "stock-on-hand-report.csv");
  }

  // ---------------- MONEY ----------------
  const LEDGERS: LedgerName[] = ["Cash", "Mobile Money", "Bank"];
  const moneyInRange = useMemo(() => {
    if (!ledgerEntries) return [];
    return ledgerEntries.filter((e) => {
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [ledgerEntries, rangeStart, rangeEnd]);

  const moneySummary = useMemo(() => {
    return LEDGERS.map((l) => {
      const inRange = moneyInRange.filter((e) => e.ledger === l);
      const totalIn = inRange.reduce((a, e) => a + e.amountIn, 0);
      const totalOut = inRange.reduce((a, e) => a + e.amountOut, 0);
      const allTimeBalance = currentBalance((ledgerEntries ?? []).filter((e) => e.ledger === l));
      return { ledger: l, totalIn, totalOut, net: totalIn - totalOut, allTimeBalance };
    });
  }, [moneyInRange, ledgerEntries]);

  function exportMoneyReport() {
    const rows = moneyInRange
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e) => ({
        Date: formatDate(e.date),
        Ledger: e.ledger,
        Description: e.description,
        Type: e.type,
        In: e.amountIn,
        Out: e.amountOut,
      }));
    downloadCSV(rows, `money-report-${from}-to-${to}.csv`);
  }

  // ---------------- BALANCE SHEET / INCOME STATEMENT ----------------
  const inventoryValue = useMemo(
    () => (products ?? []).reduce((a, p) => a + p.stockQty * p.costPrice, 0),
    [products]
  );
  const receivables = useMemo(
    () => (customers ?? []).filter((c) => c.type === "Credit").reduce((a, c) => a + c.creditBalance, 0),
    [customers]
  );
  const cashPosition = LEDGERS.reduce(
    (a, l) => a + currentBalance((ledgerEntries ?? []).filter((e) => e.ledger === l)),
    0
  );
  const totalAssets = cashPosition + inventoryValue + receivables;

  const expensesInRange = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [expenses, rangeStart, rangeEnd]);
  const totalExpensesInRange = expensesInRange.reduce((a, e) => a + e.amount, 0);

  const estimatedCOGS = useMemo(() => {
    if (!products) return 0;
    const costByProduct = new Map(products.map((p) => [p.uuid, p.costPrice]));
    let cogs = 0;
    for (const s of filteredSales) {
      for (const item of s.items) {
        const cost = costByProduct.get(item.productId) ?? 0;
        cogs += cost * item.factor * item.quantity;
      }
    }
    return cogs;
  }, [filteredSales, products]);

  const grossProfit = totalRevenue - estimatedCOGS;
  const netProfit = grossProfit - totalExpensesInRange;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                tab === t ? "bg-navy-900 text-white" : "bg-surface-muted text-navy-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab !== "Stock" && (
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-border-subtle rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-border-subtle rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {tab === "Sales" && (
        <Card className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Button variant="secondary" onClick={exportSalesReport}>
              <Download size={16} /> Export CSV
            </Button>
            <div className="text-sm">
              <span className="text-text-muted">Total revenue in range: </span>
              <span className="font-bold text-navy-900">{formatUGX(totalRevenue)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {filteredSales.length === 0 ? (
              <EmptyState title="No sales in this date range" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left text-navy-900">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Items</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((s) => (
                    <tr key={s.uuid} className="border-t border-border-subtle">
                      <td className="px-3 py-2 text-text-muted">{formatDate(s.date)}</td>
                      <td className="px-3 py-2">{s.customerName}</td>
                      <td className="px-3 py-2 text-text-muted">{s.items.length} line(s)</td>
                      <td className="px-3 py-2 text-text-muted">{s.paymentMethod}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatUGX(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {tab === "Stock" && (
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm">
              <span className="text-text-muted">Total stock value: </span>
              <span className="font-bold text-navy-900">{formatUGX(inventoryValue)}</span>
            </p>
            <Button variant="secondary" onClick={exportStockReport}>
              <Download size={16} /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            {!products || products.length === 0 ? (
              <EmptyState title="No products yet" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left text-navy-900">
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.uuid} className="border-t border-border-subtle">
                      <td className="px-3 py-2 font-medium text-navy-900">{p.name}</td>
                      <td className="px-3 py-2 text-text-muted">{p.category}</td>
                      <td className="px-3 py-2">
                        <Badge tone={p.stockQty <= p.reorderThreshold ? "red" : "green"}>
                          {p.stockQty} {p.baseUnit}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{formatUGX(p.stockQty * p.costPrice)}</td>
                      <td className="px-3 py-2 text-text-muted">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {tab === "Money" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            {moneySummary.map((m) => (
              <Card key={m.ledger} className="p-4">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{m.ledger}</p>
                <p className="text-lg font-bold text-navy-900 mt-1">{formatUGX(m.allTimeBalance)}</p>
                <p className="text-xs text-text-muted mt-1">current balance</p>
                <div className="flex justify-between text-xs mt-2 pt-2 border-t border-border-subtle">
                  <span className="text-emerald-700">+{formatUGX(m.totalIn)}</span>
                  <span className="text-danger">−{formatUGX(m.totalOut)}</span>
                </div>
              </Card>
            ))}
          </div>
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-navy-900">Cash &amp; Bank Activity in Range</h3>
              <Button variant="secondary" onClick={exportMoneyReport}>
                <Download size={16} /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              {moneyInRange.length === 0 ? (
                <EmptyState title="No cash/bank activity in this date range" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-muted text-left text-navy-900">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Ledger</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium text-right">In</th>
                      <th className="px-3 py-2 font-medium text-right">Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moneyInRange
                      .slice()
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((e) => (
                        <tr key={e.uuid} className="border-t border-border-subtle">
                          <td className="px-3 py-2 text-text-muted whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-3 py-2">
                            <Badge>{e.ledger}</Badge>
                          </td>
                          <td className="px-3 py-2 text-navy-900">{e.description}</td>
                          <td className="px-3 py-2 text-text-muted">{e.type}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">
                            {e.amountIn > 0 ? formatUGX(e.amountIn) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-danger">
                            {e.amountOut > 0 ? formatUGX(e.amountOut) : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "Balance Sheet" && (
        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <h3 className="font-semibold text-navy-900 mb-1">Balance Sheet — as of today</h3>
            <p className="text-xs text-text-muted mb-4">
              A snapshot of what the shop owns and is owed right now. Stock is valued at cost
              price, and this reflects current stock levels rather than a historical point in
              time.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-navy-900 mb-2">Assets</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Cash on hand</span>
                    <span>{formatUGX(currentBalance((ledgerEntries ?? []).filter((e) => e.ledger === "Cash")))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Mobile Money</span>
                    <span>
                      {formatUGX(currentBalance((ledgerEntries ?? []).filter((e) => e.ledger === "Mobile Money")))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Bank</span>
                    <span>{formatUGX(currentBalance((ledgerEntries ?? []).filter((e) => e.ledger === "Bank")))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Inventory (at cost)</span>
                    <span>{formatUGX(inventoryValue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Owed by credit customers</span>
                    <span>{formatUGX(receivables)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-navy-900 pt-1.5 border-t border-border-subtle">
                    <span>Total Assets</span>
                    <span>{formatUGX(totalAssets)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-navy-900 mb-2">Liabilities &amp; Equity</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Owed to suppliers</span>
                    <span className="text-text-muted">not tracked yet</span>
                  </div>
                  <div className="flex justify-between font-semibold text-navy-900 pt-1.5 border-t border-border-subtle">
                    <span>Owner&apos;s Equity (Assets − Liabilities)</span>
                    <span>{formatUGX(totalAssets)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-5">
            <h3 className="font-semibold text-navy-900 mb-1">Income Statement — selected range</h3>
            <p className="text-xs text-text-muted mb-4">
              Use the From/To dates above to check a month or a full year. Cost of goods sold is
              estimated using each product&apos;s current cost price, since cost isn&apos;t tracked
              historically per sale.
            </p>
            <div className="space-y-1.5 text-sm max-w-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Revenue</span>
                <span>{formatUGX(totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Cost of Goods Sold (estimated)</span>
                <span>−{formatUGX(estimatedCOGS)}</span>
              </div>
              <div className="flex justify-between font-medium text-navy-900 pt-1.5 border-t border-border-subtle">
                <span>Gross Profit</span>
                <span>{formatUGX(grossProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Operating Expenses</span>
                <span>−{formatUGX(totalExpensesInRange)}</span>
              </div>
              <div className="flex justify-between font-bold text-navy-900 pt-1.5 border-t border-border-subtle text-base">
                <span>Net Profit</span>
                <span>{formatUGX(netProfit)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
