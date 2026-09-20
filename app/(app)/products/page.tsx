"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Papa from "papaparse";
import { Plus, Pencil, Trash2, Download, PenLine } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { formatUGX } from "@/lib/format";
import { unitForCategory, unitLabel, defaultReorderThreshold, generateSKU } from "@/lib/categoryDefaults";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "@/components/ui";
import { CategorySelect } from "@/components/CategorySelect";
import type { Product, SellUnit } from "@/lib/types";

function blankSellUnit(baseUnit: string): SellUnit {
  return { id: "unit-1", label: `1 ${unitLabel(baseUnit)}`, factor: 1, price: 0 };
}

function emptyProduct(): Omit<Product, "id"> {
  const baseUnit = "kg";
  return {
    uuid: uuid(),
    sku: "",
    name: "",
    category: "",
    supplierId: undefined,
    baseUnit,
    sellUnits: [blankSellUnit(baseUnit)],
    costPrice: 0,
    stockQty: 0,
    reorderThreshold: defaultReorderThreshold(baseUnit),
    status: "Active",
    imageColor: "#0f1b3d",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export default function ProductsPage() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [editing, setEditing] = useState<Omit<Product, "id"> | null>(null);
  const [stockAdjustOpen, setStockAdjustOpen] = useState(false);
  const [stockDelta, setStockDelta] = useState(0);

  const filtered = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  function openNew() {
    setIsNew(true);
    setEditing(emptyProduct());
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setIsNew(false);
    setEditing({ ...product });
    setModalOpen(true);
  }

  function onCategoryChange(category: string) {
    if (!editing) return;
    const baseUnit = unitForCategory(category);
    // Re-label the default first sell-unit to match the new unit, but leave
    // any custom units (like a "25Kg Sack") alone.
    const sellUnits = editing.sellUnits.map((u, i) =>
      i === 0 && (u.label === `1 ${unitLabel(editing.baseUnit)}` || u.label === "")
        ? { ...u, label: `1 ${unitLabel(baseUnit)}` }
        : u
    );
    setEditing({
      ...editing,
      category,
      baseUnit,
      sellUnits,
      reorderThreshold: defaultReorderThreshold(baseUnit),
    });
  }

  async function save() {
    if (!editing || !editing.name || !editing.category) return;

    let sku = editing.sku;
    if (!sku) {
      const inSameCategory = (products ?? []).filter((p) => p.category === editing.category).length;
      sku = generateSKU(editing.category, inSameCategory);
    }

    const existing = await db.products.where("uuid").equals(editing.uuid).first();
    const record = { ...editing, sku, updatedAt: nowISO() };
    if (existing?.id) {
      await db.products.update(existing.id, record);
    } else {
      await db.products.add(record);
    }
    await queueSyncEvent("product-upsert", record);
    pushQueuedChanges();
    setModalOpen(false);
    setEditing(null);
  }

  async function remove(product: Product) {
    if (!product.id) return;
    if (!confirm(`Remove "${product.name}"?`)) return;
    await db.products.delete(product.id);
  }

  function addSellUnit() {
    if (!editing) return;
    setEditing({
      ...editing,
      sellUnits: [
        ...editing.sellUnits,
        { id: `unit-${editing.sellUnits.length + 1}`, label: "", factor: 1, price: 0 },
      ],
    });
  }

  function updateSellUnit(index: number, patch: Partial<SellUnit>) {
    if (!editing) return;
    const units = [...editing.sellUnits];
    units[index] = { ...units[index], ...patch };
    setEditing({ ...editing, sellUnits: units });
  }

  function removeSellUnit(index: number) {
    if (!editing || editing.sellUnits.length <= 1) return;
    setEditing({ ...editing, sellUnits: editing.sellUnits.filter((_, i) => i !== index) });
  }

  function openStockAdjust() {
    setStockDelta(0);
    setStockAdjustOpen(true);
  }

  async function saveStockAdjust() {
    if (!editing || stockDelta === 0) return;
    const newQty = Math.max(0, editing.stockQty + stockDelta);
    setEditing({ ...editing, stockQty: newQty });
    setStockAdjustOpen(false);
  }

  function exportCSV() {
    if (!products) return;
    const rows = products.map((p) => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category,
      BaseUnit: p.baseUnit,
      Cost: p.costPrice,
      Price: p.sellUnits[0]?.price ?? 0,
      Stock: p.stockQty,
      Status: p.status,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mwendo-products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className={`${inputClass} max-w-xs`}
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={16} /> CSV
          </Button>
          <Button onClick={openNew}>
            <Plus size={16} /> Add Product
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <EmptyState title="No products yet" sub="Add your first product to get started." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-900 text-white text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Margin</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const price = product.sellUnits[0]?.price ?? 0;
                const margin =
                  price > 0 ? (((price - product.costPrice) / price) * 100).toFixed(0) : "0";
                const low = product.stockQty <= product.reorderThreshold;
                return (
                  <tr key={product.uuid} className="border-t border-border-subtle hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: product.imageColor ?? "#0f1b3d" }}
                        >
                          {product.name.charAt(0)}
                        </div>
                        <span className="font-medium text-navy-900">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{product.sku}</td>
                    <td className="px-4 py-3 text-text-muted">{product.category}</td>
                    <td className="px-4 py-3">{formatUGX(product.costPrice)}</td>
                    <td className="px-4 py-3">{formatUGX(price)}</td>
                    <td className="px-4 py-3">{margin}%</td>
                    <td className="px-4 py-3">
                      <Badge tone={low ? "red" : "green"}>
                        {product.stockQty} {product.baseUnit}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={product.status === "Active" ? "green" : "neutral"}>
                        {product.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 text-navy-900 hover:bg-surface-muted rounded"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => remove(product)}
                          className="p-1.5 text-danger hover:bg-red-50 rounded"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isNew ? "Add Product" : "Edit Product"}
        wide
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Product name">
                <input
                  className={inputClass}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <CategorySelect value={editing.category} onChange={onCategoryChange} />
              </Field>
              <Field label="Supplier">
                <select
                  className={inputClass}
                  value={editing.supplierId ?? ""}
                  onChange={(e) => setEditing({ ...editing, supplierId: e.target.value || undefined })}
                >
                  <option value="">None</option>
                  {suppliers?.map((s) => (
                    <option key={s.uuid} value={s.uuid}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unit">
                <div className={`${inputClass} bg-surface-muted text-text-muted flex items-center`}>
                  {editing.category
                    ? `${unitLabel(editing.baseUnit)} (set automatically from category)`
                    : "Choose a category first"}
                </div>
              </Field>
              <Field label="Cost price per base unit (UGX)">
                <input
                  type="number"
                  className={inputClass}
                  value={editing.costPrice}
                  onChange={(e) => setEditing({ ...editing, costPrice: Number(e.target.value) })}
                />
              </Field>
              <Field label="Stock on hand">
                {isNew ? (
                  <input
                    type="number"
                    className={inputClass}
                    value={editing.stockQty}
                    onChange={(e) => setEditing({ ...editing, stockQty: Number(e.target.value) })}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`${inputClass} bg-surface-muted text-navy-900 font-medium flex-1`}>
                      {editing.stockQty} {editing.baseUnit}
                    </div>
                    <button
                      type="button"
                      onClick={openStockAdjust}
                      className="p-2.5 rounded-lg border border-border-subtle text-navy-900 hover:bg-surface-muted shrink-0"
                      title="Correct stock (e.g. after a stock count or spoilage)"
                    >
                      <PenLine size={15} />
                    </button>
                  </div>
                )}
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as "Active" | "Inactive" })
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </Field>
            </div>
            {!isNew && (
              <p className="text-[11px] text-text-muted -mt-2">
                Stock updates on its own from Sales and Purchases — use the pencil icon only to
                correct it (e.g. after a physical stock count, spoilage, or theft).
              </p>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-navy-900">
                  Selling units (e.g. loose {unitLabel(editing.baseUnit)} and a bulk pack, each with
                  its own price)
                </label>
                <button onClick={addSellUnit} className="text-xs text-accent-green-dark font-semibold">
                  + Add unit
                </button>
              </div>
              <div className="space-y-2">
                {editing.sellUnits.map((unit, i) => (
                  <div key={unit.id} className="grid grid-cols-[1fr_80px_100px_28px] gap-2 items-center">
                    <input
                      className={inputClass}
                      placeholder={`Label e.g. 1 ${unitLabel(editing.baseUnit)}`}
                      value={unit.label}
                      onChange={(e) => updateSellUnit(i, { label: e.target.value })}
                    />
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="Factor"
                      value={unit.factor}
                      onChange={(e) => updateSellUnit(i, { factor: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className={inputClass}
                      placeholder="Price"
                      value={unit.price}
                      onChange={(e) => updateSellUnit(i, { price: Number(e.target.value) })}
                    />
                    <button
                      onClick={() => removeSellUnit(i)}
                      disabled={editing.sellUnits.length <= 1}
                      className="text-danger disabled:opacity-30"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-muted mt-1.5">
                Factor = how many base units this sell-unit represents. A &quot;25Kg Sack&quot; has factor 25
                when the base unit is kg.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!editing.category}>
                Save Product
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={stockAdjustOpen} onClose={() => setStockAdjustOpen(false)} title="Correct Stock">
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Enter a positive number to add stock, or a negative number to remove it (e.g. -2 for
            spoilage or a stock-count correction). This does not create a purchase record.
          </p>
          <Field label={`Adjustment (${editing?.baseUnit ?? ""})`}>
            <input
              type="number"
              className={inputClass}
              value={stockDelta}
              onChange={(e) => setStockDelta(Number(e.target.value))}
            />
          </Field>
          {editing && (
            <p className="text-sm text-navy-900">
              New stock: <span className="font-semibold">{Math.max(0, editing.stockQty + stockDelta)} {editing.baseUnit}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStockAdjustOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveStockAdjust}>Apply</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
