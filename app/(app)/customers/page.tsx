"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { formatUGX } from "@/lib/format";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import type { Customer } from "@/lib/types";

function empty(): Omit<Customer, "id"> {
  return { uuid: uuid(), name: "", type: "Walk-in", contact: "", creditBalance: 0, createdAt: nowISO() };
}

export default function CustomersPage() {
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Omit<Customer, "id"> | null>(null);

  async function save() {
    if (!editing || !editing.name) return;
    const existing = await db.customers.where("uuid").equals(editing.uuid).first();
    if (existing?.id) {
      await db.customers.update(existing.id, editing);
    } else {
      await db.customers.add(editing);
    }
    await queueSyncEvent("customer-upsert", editing);
    pushQueuedChanges();
    setModalOpen(false);
  }

  async function remove(c: Customer) {
    if (!c.id) return;
    if (!confirm(`Remove "${c.name}"?`)) return;
    await db.customers.delete(c.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(empty());
            setModalOpen(true);
          }}
        >
          <Plus size={16} /> Add Customer
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {!customers || customers.length === 0 ? (
          <EmptyState title="No customers yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Credit Balance</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 font-medium text-navy-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.type === "Credit" ? "amber" : "neutral"}>{c.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{c.contact || "—"}</td>
                  <td className="px-4 py-3">
                    {c.creditBalance > 0 ? (
                      <span className="text-danger font-medium">{formatUGX(c.creditBalance)}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing({ ...c });
                          setModalOpen(true);
                        }}
                        className="p-1.5 text-navy-900 hover:bg-surface-muted rounded"
                      >
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(c)} className="p-1.5 text-danger hover:bg-red-50 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing?.name ? "Edit Customer" : "Add Customer"}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as "Walk-in" | "Credit" })}
              >
                <option value="Walk-in">Walk-in</option>
                <option value="Credit">Credit</option>
              </select>
            </Field>
            <Field label="Contact (phone)">
              <input className={inputClass} value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} />
            </Field>
            <Field label="Credit balance owed (UGX)">
              <input
                type="number"
                className={inputClass}
                value={editing.creditBalance}
                onChange={(e) => setEditing({ ...editing, creditBalance: Number(e.target.value) })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
