"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { postLedgerEntry } from "@/lib/ledger";
import { formatUGX, formatDate, daysAgo } from "@/lib/format";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import type { LedgerName } from "@/lib/types";

const EXPENSE_CATEGORIES = [
  "Rent",
  "Transport",
  "Utilities (UMEME/Water)",
  "Wages",
  "Airtime/MoMo fees",
  "Repairs",
  "Licences/Permits",
  "Other",
];

const PAID_FROM_OPTIONS: LedgerName[] = ["Cash", "Mobile Money", "Bank"];

export default function ExpensesPage() {
  const expenses = useLiveQuery(() => db.expenses.orderBy("date").reverse().toArray(), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paidFrom, setPaidFrom] = useState<LedgerName>("Cash");
  const [amount, setAmount] = useState(0);

  const last30 = useMemo(
    () => (expenses ?? []).filter((e) => new Date(e.date) >= daysAgo(30)),
    [expenses]
  );
  const total30 = last30.reduce((a, e) => a + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of last30) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [last30]);

  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of last30) map.set(e.paidFrom, (map.get(e.paidFrom) ?? 0) + e.amount);
    return map;
  }, [last30]);

  async function save() {
    if (!description || amount <= 0) return;
    const expense = {
      uuid: uuid(),
      date: nowISO(),
      description,
      category,
      amount,
      paidFrom,
      synced: false,
    };
    await db.expenses.add(expense);
    await queueSyncEvent("expense", expense);
    pushQueuedChanges();

    await postLedgerEntry({
      ledger: paidFrom,
      date: expense.date,
      description: `Expense: ${description}`,
      type: "Expense",
      amountOut: amount,
    });
    pushQueuedChanges();

    setModalOpen(false);
    setDescription("");
    setAmount(0);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm("Delete this expense?")) return;
    await db.expenses.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Last 30 days
          </p>
          <p className="text-xl font-bold text-navy-900 mt-1">{formatUGX(total30)}</p>
          <p className="text-xs text-text-muted mt-1">{last30.length} expense(s)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            By payment source
          </p>
          <div className="space-y-1 text-sm">
            {PAID_FROM_OPTIONS.map((src) => (
              <div key={src} className="flex justify-between">
                <span className="text-text-muted">{src}</span>
                <span className="font-medium text-navy-900">{formatUGX(bySource.get(src) ?? 0)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Top category
          </p>
          {byCategory[0] ? (
            <>
              <p className="font-semibold text-navy-900">{byCategory[0][0]}</p>
              <p className="text-sm text-text-muted">{formatUGX(byCategory[0][1])}</p>
            </>
          ) : (
            <p className="text-sm text-text-muted">No expenses yet</p>
          )}
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Add Expense
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {!expenses || expenses.length === 0 ? (
          <EmptyState title="No expenses recorded yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Paid From</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 text-text-muted">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 font-medium text-navy-900">{e.description}</td>
                  <td className="px-4 py-3 text-text-muted">{e.category}</td>
                  <td className="px-4 py-3">
                    <Badge>{e.paidFrom}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{formatUGX(e.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)} className="p-1.5 text-danger hover:bg-red-50 rounded">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Expense">
        <div className="space-y-3">
          <Field label="Description">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid from">
            <select
              className={inputClass}
              value={paidFrom}
              onChange={(e) => setPaidFrom(e.target.value as LedgerName)}
            >
              {PAID_FROM_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (UGX)">
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save Expense</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
