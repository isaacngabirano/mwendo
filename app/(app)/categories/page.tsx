"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, queueSyncEvent, nowISO } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { addCategory } from "@/lib/categories";
import { Card, Button, Modal, Field, inputClass, EmptyState, Badge } from "@/components/ui";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");

  function usageCount(categoryName: string) {
    const productCount = (products ?? []).filter((p) => p.category === categoryName).length;
    const supplierCount = (suppliers ?? []).filter((s) => s.category === categoryName).length;
    return productCount + supplierCount;
  }

  function openNew() {
    setEditing(null);
    setName("");
    setModalOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setModalOpen(true);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing?.id) {
      const oldName = editing.name;
      const record = { ...editing, name: trimmed };
      await db.categories.update(editing.id, record);
      await queueSyncEvent("category-upsert", record);

      if (oldName !== trimmed) {
        const affectedProducts = (products ?? []).filter((p) => p.category === oldName);
        for (const p of affectedProducts) {
          if (!p.id) continue;
          const updated = { ...p, category: trimmed, updatedAt: nowISO() };
          await db.products.update(p.id, updated);
          await queueSyncEvent("product-upsert", updated);
        }
        const affectedSuppliers = (suppliers ?? []).filter((s) => s.category === oldName);
        for (const s of affectedSuppliers) {
          if (!s.id) continue;
          const updated = { ...s, category: trimmed };
          await db.suppliers.update(s.id, updated);
          await queueSyncEvent("supplier-upsert", updated);
        }
      }
      pushQueuedChanges();
    } else {
      await addCategory(trimmed);
    }
    setModalOpen(false);
  }

  async function remove(c: Category) {
    if (!c.id) return;
    const inUse = usageCount(c.name);
    const message =
      inUse > 0
        ? `"${c.name}" is used by ${inUse} product/supplier record(s). Deleting it won't change those records, but it will disappear from the dropdown. Continue?`
        : `Remove "${c.name}"?`;
    if (!confirm(message)) return;
    await db.categories.delete(c.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus size={16} /> Add Category
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {!categories || categories.length === 0 ? (
          <EmptyState
            title="No categories yet"
            sub="Add one here, or use the + next to the Category field on a product or supplier form."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">In use</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.uuid} className="border-t border-border-subtle">
                  <td className="px-4 py-3 font-medium text-navy-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <Badge>{usageCount(c.name)} record(s)</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Rename Category" : "Add Category"}>
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rice, Cooking Oil, Snacks"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
