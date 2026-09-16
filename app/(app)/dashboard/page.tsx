"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, Wallet, Package2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatUGX, daysAgo, isSameDay } from "@/lib/format";
import { Card, StatCard, Badge, EmptyState } from "@/components/ui";
import type { Sale, Product, Expense } from "@/lib/types";

const CATEGORY_COLORS = ["#16a34a", "#0f1b3d", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899"];

function within(sales: Sale[], from: Date) {
  return sales.filter((s) => new Date(s.date) >= from);
}

export default function DashboardPage() {
  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);

  const loading = !sales || !products || !expenses;

  const todaySales = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s) => isSameDay(s.date, new Date()));
  }, [sales]);

  const last7 = useMemo(() => (sales ? within(sales, daysAgo(7)) : []), [sales]);
  const prev7 = useMemo(() => {
    if (!sales) return [];
    const from = daysAgo(14);
    const to = daysAgo(7);
    return sales.filter((s) => new Date(s.date) >= from && new Date(s.date) < to);
  }, [sales]);

  const todayTotal = todaySales.reduce((a, s) => a + s.totalAmount, 0);
  const last7Total = last7.reduce((a, s) => a + s.totalAmount, 0);
  const prev7Total = prev7.reduce((a, s) => a + s.totalAmount, 0);
  const weekChange = prev7Total > 0 ? ((last7Total - prev7Total) / prev7Total) * 100 : 0;

  const paymentSplit = useMemo(() => {
    const split: Record<string, number> = { Cash: 0, "Mobile Money": 0, Bank: 0, Credit: 0 };
    for (const s of last7) split[s.paymentMethod] = (split[s.paymentMethod] ?? 0) + s.totalAmount;
    return Object.entries(split)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [last7]);

  const lowStock = useMemo(
    () => (products ?? []).filter((p) => p.stockQty <= p.reorderThreshold && p.status === "Active"),
    [products]
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; qty: number }>();
    for (const s of last7) {
      for (const item of s.items) {
        const existing = map.get(item.productId) ?? { name: item.productName, revenue: 0, qty: 0 };
        existing.revenue += item.lineTotal;
        existing.qty += item.quantity;
        map.set(item.productId, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [last7]);

  const profitTrend = useMemo(() => {
    if (!sales || !products) return [];
    const costByProduct = new Map(products.map((p) => [p.uuid, p]));
    const days: { day: string; revenue: number; cost: number; profit: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = daysAgo(i);
      const daySales = sales.filter((s) => isSameDay(s.date, date));
      let revenue = 0;
      let cost = 0;
      for (const s of daySales) {
        revenue += s.totalAmount;
        for (const item of s.items) {
          const product = costByProduct.get(item.productId);
          if (product) {
            const unit = product.sellUnits.find((u) => u.label === item.sellUnitLabel);
            const factor = unit?.factor ?? 1;
            cost += product.costPrice * factor * item.quantity;
          }
        }
      }
      days.push({
        day: date.toLocaleDateString("en-UG", { day: "2-digit", month: "short" }),
        revenue,
        cost,
        profit: revenue - cost,
      });
    }
    return days;
  }, [sales, products]);

  const categoryBreakdown = useMemo(() => {
    if (!sales || !products) return [];
    const catByProduct = new Map(products.map((p) => [p.uuid, p.category]));
    const map = new Map<string, number>();
    for (const s of last7) {
      for (const item of s.items) {
        const cat = catByProduct.get(item.productId) ?? "Other";
        map.set(cat, (map.get(cat) ?? 0) + item.lineTotal);
      }
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [last7, products]);

  const expensesTotal7 = useMemo(() => {
    if (!expenses) return 0;
    return expenses
      .filter((e: Expense) => new Date(e.date) >= daysAgo(7))
      .reduce((a, e) => a + e.amount, 0);
  }, [expenses]);

  if (loading) {
    return <div className="text-text-muted text-sm">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's Sales"
          value={formatUGX(todayTotal)}
          sub={`${todaySales.length} sale${todaySales.length === 1 ? "" : "s"} today`}
          accent="green"
          icon={<Wallet size={18} />}
        />
        <StatCard
          label="Last 7 Days"
          value={formatUGX(last7Total)}
          sub={`${weekChange >= 0 ? "+" : ""}${weekChange.toFixed(1)}% vs prior week`}
          accent="navy"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="Low Stock Items"
          value={String(lowStock.length)}
          sub="At or below reorder level"
          accent={lowStock.length > 0 ? "red" : "green"}
          icon={<AlertTriangle size={18} />}
        />
        <StatCard
          label="Expenses (7 days)"
          value={formatUGX(expensesTotal7)}
          sub="Operating costs"
          accent="amber"
          icon={<Package2 size={18} />}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Profit trend */}
        <Card className="p-4 md:p-5 lg:col-span-2">
          <h3 className="font-semibold text-navy-900 mb-1">Revenue &amp; Gross Profit — Last 14 Days</h3>
          <p className="text-xs text-text-muted mb-4">Daily revenue vs. estimated cost of goods sold</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profitTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={45}
                />
                <Tooltip formatter={(v) => formatUGX(Number(v))} />
                <Line type="monotone" dataKey="revenue" stroke="#0f1b3d" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} dot={false} name="Gross profit" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment split */}
        <Card className="p-4 md:p-5">
          <h3 className="font-semibold text-navy-900 mb-1">Payment Mix — Last 7 Days</h3>
          <p className="text-xs text-text-muted mb-4">Cash, Mobile Money &amp; Bank</p>
          {paymentSplit.length === 0 ? (
            <EmptyState title="No sales recorded yet" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {paymentSplit.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatUGX(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Top products */}
        <Card className="p-4 md:p-5 lg:col-span-2">
          <h3 className="font-semibold text-navy-900 mb-1">Top Selling Products — Last 7 Days</h3>
          <p className="text-xs text-text-muted mb-4">By revenue</p>
          {topProducts.length === 0 ? (
            <EmptyState title="No sales recorded yet" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(v) => formatUGX(Number(v))} />
                  <Bar dataKey="revenue" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Low stock */}
        <Card className="p-4 md:p-5">
          <h3 className="font-semibold text-navy-900 mb-1">Low Stock Alerts</h3>
          <p className="text-xs text-text-muted mb-4">At or below reorder threshold</p>
          {lowStock.length === 0 ? (
            <EmptyState title="All stock levels look healthy" />
          ) : (
            <ul className="space-y-2.5 max-h-56 overflow-y-auto">
              {lowStock.map((p: Product) => (
                <li key={p.uuid} className="flex items-center justify-between text-sm">
                  <span className="text-navy-900 font-medium truncate pr-2">{p.name}</span>
                  <Badge tone="red">
                    {p.stockQty} {p.baseUnit} left
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Category breakdown */}
      <Card className="p-4 md:p-5">
        <h3 className="font-semibold text-navy-900 mb-1">Sales by Category — Last 7 Days</h3>
        <p className="text-xs text-text-muted mb-4">Which product lines are driving revenue</p>
        {categoryBreakdown.length === 0 ? (
          <EmptyState title="No sales recorded yet" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={45} />
                <Tooltip formatter={(v) => formatUGX(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {categoryBreakdown.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
