"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeftRight, PlusCircle, Wallet, Landmark, Smartphone } from "lucide-react";
import { db, nowISO } from "@/lib/db";
import { postTransfer, postLedgerEntry, runningBalance, currentBalance } from "@/lib/ledger";
import { formatUGX, formatDateTime } from "@/lib/format";
import { Card, Button, Modal, Field, inputClass, EmptyState, StatCard } from "@/components/ui";
import type { LedgerName } from "@/lib/types";

const LEDGERS: LedgerName[] = ["Cash", "Mobile Money", "Bank"];
const LEDGER_ICONS = { Cash: Wallet, "Mobile Money": Smartphone, Bank: Landmark };

export default function CashBankPage() {
  const entries = useLiveQuery(() => db.ledgerEntries.toArray(), []);
  const [activeLedger, setActiveLedger] = useState<LedgerName>("Cash");
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [transferFrom, setTransferFrom] = useState<LedgerName>("Cash");
  const [transferTo, setTransferTo] = useState<LedgerName>("Bank");
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferDesc, setTransferDesc] = useState("");

  const [adjustLedger, setAdjustLedger] = useState<LedgerName>("Cash");
  const [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in");
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustDesc, setAdjustDesc] = useState("Opening balance");

  const balances = useMemo(() => {
    const map = new Map<LedgerName, number>();
    for (const l of LEDGERS) {
      map.set(l, currentBalance((entries ?? []).filter((e) => e.ledger === l)));
    }
    return map;
  }, [entries]);

  const activeEntries = useMemo(() => {
    const filtered = (entries ?? []).filter((e) => e.ledger === activeLedger);
    return runningBalance(filtered).reverse();
  }, [entries, activeLedger]);

  async function submitTransfer() {
    if (transferFrom === transferTo || transferAmount <= 0) return;
    await postTransfer({
      from: transferFrom,
      to: transferTo,
      amount: transferAmount,
      date: nowISO(),
      description: transferDesc || `Transfer ${transferFrom} → ${transferTo}`,
    });
    setTransferOpen(false);
    setTransferAmount(0);
    setTransferDesc("");
  }

  async function submitAdjustment() {
    if (adjustAmount <= 0) return;
    await postLedgerEntry({
      ledger: adjustLedger,
      date: nowISO(),
      description: adjustDesc || "Manual adjustment",
      type: adjustDesc.toLowerCase().includes("opening") ? "Opening Balance" : "Adjustment",
      amountIn: adjustDirection === "in" ? adjustAmount : 0,
      amountOut: adjustDirection === "out" ? adjustAmount : 0,
    });
    setAdjustOpen(false);
    setAdjustAmount(0);
    setAdjustDesc("Opening balance");
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        {LEDGERS.map((l) => {
          const Icon = LEDGER_ICONS[l];
          return (
            <StatCard
              key={l}
              label={l}
              value={formatUGX(balances.get(l) ?? 0)}
              sub="Current balance"
              accent={l === "Cash" ? "green" : l === "Bank" ? "navy" : "amber"}
              icon={<Icon size={18} />}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {LEDGERS.map((l) => (
            <button
              key={l}
              onClick={() => setActiveLedger(l)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                activeLedger === l ? "bg-navy-900 text-white" : "bg-surface-muted text-navy-900"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={16} /> Transfer
          </Button>
          <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
            <PlusCircle size={16} /> Add / Adjust
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        {activeEntries.length === 0 ? (
          <EmptyState
            title={`No ${activeLedger} activity yet`}
            sub="Sales, purchases, and expenses using this payment method will appear here automatically."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">In</th>
                <th className="px-4 py-3 font-medium text-right">Out</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map((e) => (
                <tr key={e.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">{formatDateTime(e.date)}</td>
                  <td className="px-4 py-3 text-navy-900">{e.description}</td>
                  <td className="px-4 py-3 text-text-muted">{e.type}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {e.amountIn > 0 ? formatUGX(e.amountIn) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-danger">
                    {e.amountOut > 0 ? formatUGX(e.amountOut) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-900">
                    {formatUGX(e.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Between Accounts">
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            E.g. banking today&apos;s cash, or withdrawing from the bank to top up the till.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <select
                className={inputClass}
                value={transferFrom}
                onChange={(e) => setTransferFrom(e.target.value as LedgerName)}
              >
                {LEDGERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <select
                className={inputClass}
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value as LedgerName)}
              >
                {LEDGERS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {transferFrom === transferTo && (
            <p className="text-xs text-danger">Pick two different accounts.</p>
          )}
          <Field label="Amount (UGX)">
            <input
              type="number"
              className={inputClass}
              value={transferAmount}
              onChange={(e) => setTransferAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="Description (optional)">
            <input
              className={inputClass}
              value={transferDesc}
              onChange={(e) => setTransferDesc(e.target.value)}
              placeholder="e.g. Banked today's cash"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={transferFrom === transferTo || transferAmount <= 0}>
              Record Transfer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Add or Adjust Balance">
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Use this for a starting/opening balance, or to correct a mistake — not for normal
            sales, purchases, or expenses, which post here automatically.
          </p>
          <Field label="Account">
            <select
              className={inputClass}
              value={adjustLedger}
              onChange={(e) => setAdjustLedger(e.target.value as LedgerName)}
            >
              {LEDGERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAdjustDirection("in")}
                className={`py-2 rounded-lg text-sm font-medium border ${
                  adjustDirection === "in"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                    : "border-border-subtle text-navy-900"
                }`}
              >
                Add money in
              </button>
              <button
                onClick={() => setAdjustDirection("out")}
                className={`py-2 rounded-lg text-sm font-medium border ${
                  adjustDirection === "out"
                    ? "bg-red-50 border-danger text-danger"
                    : "border-border-subtle text-navy-900"
                }`}
              >
                Take money out
              </button>
            </div>
          </Field>
          <Field label="Amount (UGX)">
            <input
              type="number"
              className={inputClass}
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="Description">
            <input className={inputClass} value={adjustDesc} onChange={(e) => setAdjustDesc(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdjustment} disabled={adjustAmount <= 0}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
