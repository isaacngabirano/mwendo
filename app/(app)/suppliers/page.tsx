"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { Card, Button, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import { CategorySelect } from "@/components/CategorySelect";
import type { Supplier } from "@/lib/types";

function empty(): Omit<Supplier, "id"> {
  return {
    uuid: uuid(),
    name: "",
    category: "",
    productsSupplied: "",
    contact: "",
    location: "",
    notes: "",
    createdAt: nowISO(),
  };
}

export default function SuppliersPage() {
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Omit<Supplier, "id"> | null>(null);

  async function save() {
    if (!editing || !editing.name) return;
    const existing = await db.suppliers.where("uuid").equals(editing.uuid).first();
    if (existing?.id) {
      await db.suppliers.update(existing.id, editing);
    } else {
      await db.suppliers.add(editing);
    }
    await queueSyncEvent("supplier-upsert", editing);
    pushQueuedChanges();
    setModalOpen(false);
  }

  async function remove(s: Supplier) {
    if (!s.id) return;
    if (!confirm(`Remove "${s.name}"?`)) return;
    await db.suppliers.delete(s.id);
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
          <Plus size={16} /> Add Supplier
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {!suppliers || suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Products Supplied</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 font-medium text-navy-900">{s.name}</td>
                  <td className="px-4 py-3 text-text-muted">{s.category}</td>
                  <td className="px-4 py-3 text-text-muted max-w-xs truncate">{s.productsSupplied}</td>
                  <td className="px-4 py-3 text-text-muted">{s.location}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditing({ ...s });
                          setModalOpen(true);
                        }}
                        className="p-1.5 text-navy-900 hover:bg-surface-muted rounded"
                      >
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(s)} className="p-1.5 text-danger hover:bg-red-50 rounded">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing?.name ? "Edit Supplier" : "Add Supplier"}>
        {editing && (
          <div className="space-y-3">
            <Field label="Name">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <CategorySelect
                value={editing.category}
                onChange={(name) => setEditing({ ...editing, category: name })}
                includeOther
              />
            </Field>
            <Field label="Products supplied">
              <input
                className={inputClass}
                value={editing.productsSupplied}
                onChange={(e) => setEditing({ ...editing, productsSupplied: e.target.value })}
              />
            </Field>
            <Field label="Contact (phone)">
              <input className={inputClass} value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} />
            </Field>
            <Field label="Location">
              <input className={inputClass} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
            </Field>
            <Field label="Notes">
              <input className={inputClass} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
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
