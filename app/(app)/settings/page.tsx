"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { pushQueuedChanges } from "@/lib/sync";
import { unitForCategory, unitLabel, defaultReorderThreshold } from "@/lib/categoryDefaults";
import { supabase, supabaseConfigured } from "@/lib/supabaseClient";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import { CsvImporter, type ImportField } from "@/components/CsvImporter";
import type { UserRole } from "@/lib/types";

const PRODUCT_FIELDS: ImportField[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Product name", required: true },
  { key: "category", label: "Category" },
  { key: "baseUnit", label: "Base unit (kg/litre/piece)" },
  { key: "costPrice", label: "Cost price (UGX)" },
  { key: "price", label: "Selling price (UGX)" },
  { key: "stockQty", label: "Stock on hand" },
];

const SUPPLIER_FIELDS: ImportField[] = [
  { key: "name", label: "Supplier name", required: true },
  { key: "category", label: "Category" },
  { key: "productsSupplied", label: "Products supplied" },
  { key: "contact", label: "Contact" },
  { key: "location", label: "Location" },
];

const CUSTOMER_FIELDS: ImportField[] = [
  { key: "name", label: "Customer name", required: true },
  { key: "type", label: "Type (Walk-in/Credit)" },
  { key: "contact", label: "Contact" },
  { key: "creditBalance", label: "Credit balance owed" },
];

export default function SettingsPage() {
  const users = useLiveQuery(() => db.users.toArray(), []);
  const [tab, setTab] = useState<"import" | "users">("import");
  const [modalOpen, setModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "Cashier" as UserRole });

  async function importProducts(rows: Record<string, string>[]) {
    const categoryNames = new Set((await db.categories.toArray()).map((c) => c.name));
    for (const row of rows) {
      if (!row.name) continue;
      if (row.category && !categoryNames.has(row.category)) {
        await db.categories.add({ uuid: uuid(), name: row.category });
        categoryNames.add(row.category);
      }
      const cost = Number(row.costPrice) || 0;
      const price = Number(row.price) || 0;
      const baseUnit = row.baseUnit || unitForCategory(row.category || "");
      const record = {
        uuid: uuid(),
        sku: row.sku || `SKU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: row.name,
        category: row.category || "Uncategorised",
        baseUnit,
        sellUnits: [{ id: "unit-1", label: `1 ${unitLabel(baseUnit)}`, factor: 1, price }],
        costPrice: cost,
        stockQty: Number(row.stockQty) || 0,
        reorderThreshold: defaultReorderThreshold(baseUnit),
        status: "Active" as const,
        imageColor: "#0f1b3d",
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      await db.products.add(record);
      await queueSyncEvent("product-upsert", record);
    }
    pushQueuedChanges();
  }

  async function importSuppliers(rows: Record<string, string>[]) {
    for (const row of rows) {
      if (!row.name) continue;
      const record = {
        uuid: uuid(),
        name: row.name,
        category: row.category || "",
        productsSupplied: row.productsSupplied || "",
        contact: row.contact || "",
        location: row.location || "",
        notes: "",
        createdAt: nowISO(),
      };
      await db.suppliers.add(record);
      await queueSyncEvent("supplier-upsert", record);
    }
    pushQueuedChanges();
  }

  async function importCustomers(rows: Record<string, string>[]) {
    for (const row of rows) {
      if (!row.name) continue;
      const record = {
        uuid: uuid(),
        name: row.name,
        type: (row.type?.toLowerCase().includes("credit") ? "Credit" : "Walk-in") as "Credit" | "Walk-in",
        contact: row.contact || "",
        creditBalance: Number(row.creditBalance) || 0,
        createdAt: nowISO(),
      };
      await db.customers.add(record);
      await queueSyncEvent("customer-upsert", record);
    }
    pushQueuedChanges();
  }

  async function addUser() {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    const passwordHash = await hashPassword(newUser.password);
    await db.users.add({
      uuid: uuid(),
      name: newUser.name,
      email: newUser.email.trim().toLowerCase(),
      passwordHash,
      role: newUser.role,
      createdAt: nowISO(),
    });
    setModalOpen(false);
    setNewUser({ name: "", email: "", password: "", role: "Cashier" });
  }

  async function removeUser(id?: number) {
    if (!id) return;
    if (!confirm("Remove this user?")) return;
    await db.users.delete(id);
  }

  async function changeRole(u: { uuid: string; role: UserRole }, role: UserRole) {
    if (!supabase) return;
    await supabase.from("profiles").update({ role }).eq("id", u.uuid);
    const existing = await db.users.where("uuid").equals(u.uuid).first();
    if (existing?.id) await db.users.update(existing.id, { role });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("import")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "import" ? "bg-navy-900 text-white" : "bg-surface-muted text-navy-900"
          }`}
        >
          Import Data
        </button>
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "users" ? "bg-navy-900 text-white" : "bg-surface-muted text-navy-900"
          }`}
        >
          Users
        </button>
      </div>

      {tab === "import" && (
        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <h3 className="font-semibold text-navy-900 mb-1">Import Products</h3>
            <p className="text-xs text-text-muted mb-4">
              From your existing Excel/QuickBooks product or stock-costing sheet, exported as CSV.
            </p>
            <CsvImporter fields={PRODUCT_FIELDS} entityLabel="Product" onCommit={importProducts} />
          </Card>
          <Card className="p-4 md:p-5">
            <h3 className="font-semibold text-navy-900 mb-1">Import Suppliers</h3>
            <p className="text-xs text-text-muted mb-4">From your supplier master list, exported as CSV.</p>
            <CsvImporter fields={SUPPLIER_FIELDS} entityLabel="Supplier" onCommit={importSuppliers} />
          </Card>
          <Card className="p-4 md:p-5">
            <h3 className="font-semibold text-navy-900 mb-1">Import Customers</h3>
            <p className="text-xs text-text-muted mb-4">From your customer master list, exported as CSV.</p>
            <CsvImporter fields={CUSTOMER_FIELDS} entityLabel="Customer" onCommit={importCustomers} />
          </Card>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          {supabaseConfigured ? (
            <Card className="p-4 md:p-5 text-sm text-text-muted">
              <p className="text-navy-900 font-semibold mb-1">Adding a new team member</p>
              <p>
                Go to your Supabase project → Authentication → Users → Add User to create their
                login (email + password) — this has to happen there, not in the app, since a
                browser app is never allowed to create logins directly for security reasons. They
                will appear below automatically once they&apos;ve logged in at least once.
              </p>
            </Card>
          ) : (
            <div className="flex justify-end">
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} /> Add User
              </Button>
            </div>
          )}
          <Card className="overflow-x-auto">
            {!users || users.length === 0 ? (
              <EmptyState title="No users yet" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy-900 text-white text-left">
                    <th className="px-4 py-3 font-medium">Name</th>
                    {!supabaseConfigured && <th className="px-4 py-3 font-medium">Email</th>}
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uuid} className="border-t border-border-subtle">
                      <td className="px-4 py-3 font-medium text-navy-900">{u.name}</td>
                      {!supabaseConfigured && (
                        <td className="px-4 py-3 text-text-muted">{u.email}</td>
                      )}
                      <td className="px-4 py-3">
                        {supabaseConfigured ? (
                          <select
                            className="border border-border-subtle rounded-lg px-2 py-1 text-xs"
                            value={u.role}
                            onChange={(e) => changeRole(u, e.target.value as UserRole)}
                          >
                            <option value="Owner">Owner</option>
                            <option value="Cashier">Cashier</option>
                          </select>
                        ) : (
                          <Badge tone={u.role === "Owner" ? "green" : "neutral"}>{u.role}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!supabaseConfigured && (
                          <button
                            onClick={() => removeUser(u.id)}
                            className="p-1.5 text-danger hover:bg-red-50 rounded"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User">
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className={inputClass}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
            >
              <option value="Owner">Owner</option>
              <option value="Cashier">Cashier</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addUser}>Add User</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
