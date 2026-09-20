"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { addCategory } from "@/lib/categories";
import { Modal, Field, inputClass, Button } from "@/components/ui";

export function CategorySelect({
  value,
  onChange,
  includeOther = false,
}: {
  value: string;
  onChange: (name: string) => void;
  includeOther?: boolean;
}) {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  async function submitNew() {
    if (!newName.trim()) return;
    const finalName = await addCategory(newName);
    onChange(finalName);
    setNewName("");
    setAddOpen(false);
  }

  return (
    <>
      <div className="flex gap-1.5">
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {categories?.map((c) => (
            <option key={c.uuid} value={c.name}>
              {c.name}
            </option>
          ))}
          {includeOther && <option value="Other">Other</option>}
        </select>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="shrink-0 px-3 rounded-lg border border-border-subtle text-navy-900 hover:bg-surface-muted"
          title="Add a new category"
        >
          <Plus size={16} />
        </button>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Category">
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Rice, Cooking Oil, Snacks"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNew} disabled={!newName.trim()}>
              Add &amp; Select
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
