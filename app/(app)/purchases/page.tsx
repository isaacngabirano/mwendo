"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { ledgerForPaymentMethod, postLedgerEntry } from "@/lib/ledger";
import { formatUGX, formatDateTime } from "@/lib/format";
import { Card, Button, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import type { PurchaseLineItem, PaymentMethod } from "@/lib/types";

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Mobile Money", "Bank"];

export default function PurchasesPage() {
  const purchases = useLiveQuery(() => db.purchases.orderBy("date").reverse().toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [lines, setLines] = useState<PurchaseLineItem[]>([]);

  function addLine() {
    if (!products || products.length === 0) return;
    const p = products[0];
    setLines((prev) => [
      ...prev,
      { productId: p.uuid, productName: p.name, quantity: 1, unitCost: p.costPrice, lineTotal: p.costPrice },
    ]);
  }

  function updateLine(index: number, patch: Partial<PurchaseLineItem>) {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      copy[index].lineTotal = copy[index].quantity * copy[index].unitCost;
      return copy;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function selectProduct(index: number, productId: string) {
    const p = products?.find((pr) => pr.uuid === productId);
    if (!p) return;
    updateLine(index, { productId: p.uuid, productName: p.name, unitCost: p.costPrice });
  }

  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);

  async function save() {
    const supplier = suppliers?.find((s) => s.uuid === supplierId);
    if (!supplier || lines.length === 0) return;

    const purchase = {
      uuid: uuid(),
      date: nowISO(),
      supplierId: supplier.uuid,
      supplierName: supplier.name,
      items: lines,
      paymentMethod,
      totalAmount: total,
      synced: false,
    };

    await db.transaction("rw", db.purchases, db.products, async () => {
      await db.purchases.add(purchase);
      for (const line of lines) {
        const product = await db.products.where("uuid").equals(line.productId).first();
        if (product?.id) {
          await db.products.update(product.id, {
            stockQty: product.stockQty + line.quantity,
            updatedAt: nowISO(),
          });
        }
      }
    });
    await queueSyncEvent("purchase", purchase);
    pushQueuedChanges();

    const ledger = ledgerForPaymentMethod(paymentMethod);
    if (ledger) {
      await postLedgerEntry({
        ledger,
        date: purchase.date,
        description: `Purchase from ${supplier.name}`,
        type: "Purchase",
        amountOut: total,
      });
      pushQueuedChanges();
    }

    setModalOpen(false);
    setLines([]);
    setSupplierId("");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Record Purchase
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {!purchases || purchases.length === 0 ? (
          <EmptyState title="No purchases recorded yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 text-text-muted">{formatDateTime(p.date)}</td>
                  <td className="px-4 py-3 font-medium text-navy-900">{p.supplierName}</td>
                  <td className="px-4 py-3 text-text-muted">{p.items.length} line(s)</td>
                  <td className="px-4 py-3 text-text-muted">{p.paymentMethod}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatUGX(p.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Purchase" wide>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Supplier">
              <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {suppliers?.map((s) => (
                  <option key={s.uuid} value={s.uuid}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                className={inputClass}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-navy-900">Items purchased</label>
              <button onClick={addLine} className="text-xs text-accent-green-dark font-semibold">
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_28px] gap-2 items-center">
                  <select
                    className={inputClass}
                    value={line.productId}
                    onChange={(e) => selectProduct(i, e.target.value)}
                  >
                    {products?.map((p) => (
                      <option key={p.uuid} value={p.uuid}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className={inputClass}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className={inputClass}
                    value={line.unitCost}
                    onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })}
                  />
                  <button onClick={() => removeLine(i)} className="text-danger">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {lines.length === 0 && <p className="text-xs text-text-muted">No lines added yet.</p>}
            </div>
          </div>

          <div className="flex items-center justify-between font-bold text-navy-900 border-t border-border-subtle pt-3">
            <span>Total</span>
            <span>{formatUGX(total)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!supplierId || lines.length === 0}>
              Save Purchase
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
