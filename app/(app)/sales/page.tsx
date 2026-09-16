"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Plus, Minus, Trash2, ShoppingCart, Check } from "lucide-react";
import { db, uuid, nowISO, queueSyncEvent } from "@/lib/db";
import { pushQueuedChanges } from "@/lib/sync";
import { ledgerForPaymentMethod, postLedgerEntry } from "@/lib/ledger";
import { formatUGX } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { Card, Button, Badge } from "@/components/ui";
import type { Product, SellUnit, SaleLineItem, PaymentMethod } from "@/lib/types";

interface CartLine {
  product: Product;
  unit: SellUnit;
  quantity: number;
}

const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Mobile Money", "Bank", "Credit"];

export default function SalesPage() {
  const products = useLiveQuery(() => db.products.where("status").equals("Active").toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const walkIn = customers?.find((c) => c.type === "Walk-in");
  const effectiveCustomerId = customerId || walkIn?.uuid || "";

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === "All" || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  function addToCart(product: Product, unit: SellUnit) {
    setJustCompleted(false);
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (l) => l.product.uuid === product.uuid && l.unit.id === unit.id
      );
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = { ...copy[existingIndex], quantity: copy[existingIndex].quantity + 1 };
        return copy;
      }
      return [...prev, { product, unit, quantity: 1 }];
    });
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) => {
      const copy = [...prev];
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        copy.splice(index, 1);
      } else {
        copy[index] = { ...copy[index], quantity: newQty };
      }
      return copy;
    });
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const total = cart.reduce((sum, line) => sum + line.unit.price * line.quantity, 0);

  async function completeSale() {
    if (cart.length === 0) return;
    setCompleting(true);
    const user = await getCurrentUser();
    const customer = customers?.find((c) => c.uuid === effectiveCustomerId);

    const items: SaleLineItem[] = cart.map((line) => ({
      productId: line.product.uuid,
      productName: line.product.name,
      sellUnitLabel: line.unit.label,
      factor: line.unit.factor,
      quantity: line.quantity,
      unitPrice: line.unit.price,
      lineTotal: line.unit.price * line.quantity,
    }));

    const sale = {
      uuid: uuid(),
      date: nowISO(),
      items,
      paymentMethod,
      customerId: effectiveCustomerId,
      customerName: customer?.name ?? "Walk-in Cash Customer",
      cashierId: user?.uuid ?? "",
      cashierName: user?.name ?? "Unknown",
      totalAmount: total,
      synced: false,
    };

    await db.transaction("rw", db.sales, db.products, db.customers, async () => {
      await db.sales.add(sale);
      for (const line of cart) {
        const deduction = line.unit.factor * line.quantity;
        const current = await db.products.where("uuid").equals(line.product.uuid).first();
        if (current) {
          await db.products.update(current.id!, {
            stockQty: Math.max(0, current.stockQty - deduction),
            updatedAt: nowISO(),
          });
        }
      }
      if (paymentMethod === "Credit" && customer) {
        const currentCustomer = await db.customers.where("uuid").equals(customer.uuid).first();
        if (currentCustomer) {
          await db.customers.update(currentCustomer.id!, {
            creditBalance: currentCustomer.creditBalance + total,
          });
        }
      }
    });

    await queueSyncEvent("sale", sale);
    pushQueuedChanges();

    const ledger = ledgerForPaymentMethod(paymentMethod);
    if (ledger) {
      await postLedgerEntry({
        ledger,
        date: sale.date,
        description: `Sale to ${sale.customerName}`,
        type: "Sale",
        amountIn: total,
      });
      pushQueuedChanges();
    }

    setCart([]);
    setCompleting(false);
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 3000);
  }

  const categoryNames = ["All", ...(categories?.map((c) => c.name) ?? [])];

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 h-full">
      {/* Product picker */}
      <div className="space-y-4 min-w-0">
        <Card className="p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border-subtle text-sm focus:outline-none focus:ring-2 focus:ring-accent-green"
            />
          </div>
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
            {categoryNames.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  activeCategory === cat
                    ? "bg-navy-900 text-white"
                    : "bg-surface-muted text-navy-900 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map((product) => (
            <Card key={product.uuid} className="p-3 flex flex-col gap-2">
              <div
                className="w-full h-16 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: product.imageColor ?? "#0f1b3d" }}
              >
                {product.name.charAt(0)}
              </div>
              <p className="text-sm font-semibold text-navy-900 leading-tight line-clamp-2">
                {product.name}
              </p>
              <p className="text-xs text-text-muted">
                {product.stockQty} {product.baseUnit} in stock
              </p>
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {product.sellUnits.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => addToCart(product, unit)}
                    disabled={product.stockQty <= 0}
                    className="flex-1 min-w-[80px] bg-accent-green hover:bg-accent-green-dark disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg py-2 px-2 flex flex-col items-center leading-tight"
                  >
                    <span>{unit.label}</span>
                    <span className="font-normal opacity-90">{formatUGX(unit.price)}</span>
                  </button>
                ))}
              </div>
            </Card>
          ))}
          {filteredProducts.length === 0 && (
            <p className="col-span-full text-center text-text-muted text-sm py-10">
              No products match your search.
            </p>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="p-4 flex flex-col h-fit lg:sticky lg:top-20">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart size={18} className="text-navy-900" />
          <h3 className="font-semibold text-navy-900">Current Sale</h3>
          <Badge>{cart.length} item{cart.length === 1 ? "" : "s"}</Badge>
        </div>

        <div className="flex-1 space-y-3 max-h-[40vh] overflow-y-auto mb-4">
          {cart.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Cart is empty — tap a product to add it.</p>
          ) : (
            cart.map((line, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-900 truncate">{line.product.name}</p>
                  <p className="text-xs text-text-muted">
                    {line.unit.label} &middot; {formatUGX(line.unit.price)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => updateQty(i, -1)}
                    className="w-6 h-6 rounded-full bg-surface-muted flex items-center justify-center"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center font-medium">{line.quantity}</span>
                  <button
                    onClick={() => updateQty(i, 1)}
                    className="w-6 h-6 rounded-full bg-surface-muted flex items-center justify-center"
                  >
                    <Plus size={12} />
                  </button>
                  <button onClick={() => removeLine(i)} className="text-danger ml-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t border-border-subtle pt-3">
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">Customer</label>
            <select
              value={effectiveCustomerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full border border-border-subtle rounded-lg px-3 py-2 text-sm"
            >
              {customers?.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">Payment method</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`text-xs font-medium py-2 rounded-lg border ${
                    paymentMethod === m
                      ? "bg-navy-900 text-white border-navy-900"
                      : "border-border-subtle text-navy-900"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-base font-bold text-navy-900 pt-2">
            <span>Total</span>
            <span>{formatUGX(total)}</span>
          </div>

          <Button
            onClick={completeSale}
            disabled={cart.length === 0 || completing}
            className="w-full py-3 text-base"
          >
            {justCompleted ? (
              <>
                <Check size={18} /> Sale Recorded
              </>
            ) : completing ? (
              "Recording…"
            ) : (
              `Complete Sale — ${formatUGX(total)}`
            )}
          </Button>
          <p className="text-[11px] text-text-muted text-center">
            Sales are saved on this device instantly, even with no internet.
          </p>
        </div>
      </Card>
    </div>
  );
}
