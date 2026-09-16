import { supabase, supabaseConfigured } from "./supabaseClient";
import { db } from "./db";
import type {
  Product,
  Supplier,
  Customer,
  Sale,
  Purchase,
  Expense,
  Category,
  SyncEvent,
  LedgerEntry,
} from "./types";

// ---------------------------------------------------------------
// PUSH: send queued local writes up to Supabase.
//
// Sales/purchases go through Postgres RPC functions (record_sale /
// record_purchase) so stock deductions happen atomically on the server —
// see supabase/schema.sql for why this matters. Everything else (product
// edits, new suppliers, etc.) is a plain upsert.
// ---------------------------------------------------------------

async function pushOne(event: SyncEvent): Promise<boolean> {
  if (!supabase) return false;
  try {
    switch (event.type) {
      case "sale": {
        const s = event.payload as Sale;
        const { error } = await supabase.rpc("record_sale", {
          p_id: s.uuid,
          p_date: s.date,
          p_items: s.items,
          p_payment_method: s.paymentMethod,
          p_customer_id: s.customerId || null,
          p_customer_name: s.customerName,
          p_cashier_id: s.cashierId || null,
          p_cashier_name: s.cashierName,
          p_total: s.totalAmount,
        });
        if (error) throw error;
        return true;
      }
      case "purchase": {
        const p = event.payload as Purchase;
        const { error } = await supabase.rpc("record_purchase", {
          p_id: p.uuid,
          p_date: p.date,
          p_supplier_id: p.supplierId || null,
          p_supplier_name: p.supplierName,
          p_items: p.items,
          p_payment_method: p.paymentMethod,
          p_total: p.totalAmount,
        });
        if (error) throw error;
        return true;
      }
      case "expense": {
        const e = event.payload as Expense;
        const { error } = await supabase.from("expenses").upsert({
          id: e.uuid,
          date: e.date,
          description: e.description,
          category: e.category,
          amount: e.amount,
          paid_from: e.paidFrom,
        });
        if (error) throw error;
        return true;
      }
      case "ledger-entry": {
        const l = event.payload as LedgerEntry;
        const { error } = await supabase.from("ledger_entries").upsert({
          id: l.uuid,
          ledger: l.ledger,
          date: l.date,
          description: l.description,
          type: l.type,
          amount_in: l.amountIn,
          amount_out: l.amountOut,
          related_transfer_id: l.relatedTransferId || null,
        });
        if (error) throw error;
        return true;
      }
      case "product-upsert": {
        const p = event.payload as Product;
        const { error } = await supabase.from("products").upsert({
          id: p.uuid,
          sku: p.sku,
          name: p.name,
          category: p.category,
          supplier_id: p.supplierId || null,
          base_unit: p.baseUnit,
          sell_units: p.sellUnits,
          cost_price: p.costPrice,
          stock_qty: p.stockQty,
          reorder_threshold: p.reorderThreshold,
          status: p.status,
          image_color: p.imageColor,
          updated_at: p.updatedAt,
        });
        if (error) throw error;
        return true;
      }
      case "customer-upsert": {
        const c = event.payload as Customer;
        const { error } = await supabase.from("customers").upsert({
          id: c.uuid,
          name: c.name,
          type: c.type,
          contact: c.contact,
          credit_balance: c.creditBalance,
        });
        if (error) throw error;
        return true;
      }
      case "supplier-upsert": {
        const s = event.payload as Supplier;
        const { error } = await supabase.from("suppliers").upsert({
          id: s.uuid,
          name: s.name,
          category: s.category,
          products_supplied: s.productsSupplied,
          contact: s.contact,
          location: s.location,
          notes: s.notes,
        });
        if (error) throw error;
        return true;
      }
      default:
        return true; // unknown event types are dropped rather than retried forever
    }
  } catch {
    return false; // network error or offline — leave it queued, retry later
  }
}

let pushing = false;

export async function pushQueuedChanges() {
  if (!supabaseConfigured || pushing) return;
  pushing = true;
  try {
    const all = await db.syncQueue.toArray();
    const pending = all.filter((e) => !e.synced);
    for (const event of pending) {
      const ok = await pushOne(event);
      if (ok && event.id) {
        await db.syncQueue.update(event.id, { synced: true });
      } else {
        break; // stop on first failure (likely offline) — retry later as a batch
      }
    }
  } finally {
    pushing = false;
  }
}

// ---------------------------------------------------------------
// PULL: fetch everything from Supabase into Dexie. Used once on
// login/app-start so a fresh device catches up on data created elsewhere.
// ---------------------------------------------------------------
export async function pullAll() {
  if (!supabase) return;

  const [categories, suppliers, customers, products, sales, purchases, expenses, profiles, ledgerEntries] =
    await Promise.all([
      supabase.from("categories").select("*"),
      supabase.from("suppliers").select("*"),
      supabase.from("customers").select("*"),
      supabase.from("products").select("*"),
      supabase.from("sales").select("*"),
      supabase.from("purchases").select("*"),
      supabase.from("expenses").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("ledger_entries").select("*"),
    ]);

  if (categories.data) {
    for (const row of categories.data) {
      await upsertLocalCategory(row);
    }
  }
  if (suppliers.data) for (const row of suppliers.data) await upsertLocalSupplier(row);
  if (customers.data) for (const row of customers.data) await upsertLocalCustomer(row);
  if (products.data) for (const row of products.data) await upsertLocalProduct(row);
  if (sales.data) for (const row of sales.data) await upsertLocalSale(row);
  if (purchases.data) for (const row of purchases.data) await upsertLocalPurchase(row);
  if (expenses.data) for (const row of expenses.data) await upsertLocalExpense(row);
  if (profiles.data) for (const row of profiles.data) await upsertLocalProfile(row);
  if (ledgerEntries.data) for (const row of ledgerEntries.data) await upsertLocalLedgerEntry(row);
}

async function upsertLocalProfile(row: Record<string, unknown>) {
  const existing = await db.users.where("uuid").equals(row.id as string).first();
  const patch = {
    uuid: row.id as string,
    name: (row.name as string) ?? "User",
    role: (row.role as "Owner" | "Cashier") ?? "Cashier",
  };
  if (existing?.id) {
    await db.users.update(existing.id, patch);
  } else {
    await db.users.add({
      ...patch,
      email: "", // not exposed to other users via the anon key — only self-visible via auth session
      passwordHash: "",
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------
// Row shape converters: Supabase (snake_case, `id`) -> Dexie (camelCase,
// `uuid` as the stable key, plus a local auto-increment `id`).
// ---------------------------------------------------------------

async function upsertLocalCategory(row: Record<string, unknown>) {
  const existing = await db.categories.where("uuid").equals(row.id as string).first();
  const record: Category = { uuid: row.id as string, name: row.name as string };
  if (existing?.id) await db.categories.update(existing.id, record);
  else await db.categories.add(record);
}

async function upsertLocalSupplier(row: Record<string, unknown>) {
  const existing = await db.suppliers.where("uuid").equals(row.id as string).first();
  const record: Supplier = {
    uuid: row.id as string,
    name: row.name as string,
    category: (row.category as string) ?? "",
    productsSupplied: (row.products_supplied as string) ?? "",
    contact: (row.contact as string) ?? "",
    location: (row.location as string) ?? "",
    notes: (row.notes as string) ?? "",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
  if (existing?.id) await db.suppliers.update(existing.id, record);
  else await db.suppliers.add(record);
}

async function upsertLocalCustomer(row: Record<string, unknown>) {
  const existing = await db.customers.where("uuid").equals(row.id as string).first();
  const record: Customer = {
    uuid: row.id as string,
    name: row.name as string,
    type: row.type as "Walk-in" | "Credit",
    contact: (row.contact as string) ?? "",
    creditBalance: Number(row.credit_balance) || 0,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
  if (existing?.id) await db.customers.update(existing.id, record);
  else await db.customers.add(record);
}

async function upsertLocalProduct(row: Record<string, unknown>) {
  const existing = await db.products.where("uuid").equals(row.id as string).first();
  const record: Omit<Product, "id"> = {
    uuid: row.id as string,
    sku: row.sku as string,
    name: row.name as string,
    category: (row.category as string) ?? "",
    supplierId: (row.supplier_id as string) ?? undefined,
    baseUnit: row.base_unit as string,
    sellUnits: (row.sell_units as Product["sellUnits"]) ?? [],
    costPrice: Number(row.cost_price) || 0,
    stockQty: Number(row.stock_qty) || 0,
    reorderThreshold: Number(row.reorder_threshold) || 0,
    status: row.status as "Active" | "Inactive",
    imageColor: (row.image_color as string) ?? "#0f1b3d",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
  if (existing?.id) await db.products.update(existing.id, record);
  else await db.products.add(record);
}

async function upsertLocalSale(row: Record<string, unknown>) {
  const existing = await db.sales.where("uuid").equals(row.id as string).first();
  const record: Omit<Sale, "id"> = {
    uuid: row.id as string,
    date: row.date as string,
    items: row.items as Sale["items"],
    paymentMethod: row.payment_method as Sale["paymentMethod"],
    customerId: (row.customer_id as string) ?? "",
    customerName: (row.customer_name as string) ?? "",
    cashierId: (row.cashier_id as string) ?? "",
    cashierName: (row.cashier_name as string) ?? "",
    totalAmount: Number(row.total_amount) || 0,
    synced: true,
  };
  if (existing?.id) await db.sales.update(existing.id, record);
  else await db.sales.add(record);
}

async function upsertLocalPurchase(row: Record<string, unknown>) {
  const existing = await db.purchases.where("uuid").equals(row.id as string).first();
  const record: Omit<Purchase, "id"> = {
    uuid: row.id as string,
    date: row.date as string,
    supplierId: (row.supplier_id as string) ?? "",
    supplierName: (row.supplier_name as string) ?? "",
    items: row.items as Purchase["items"],
    paymentMethod: row.payment_method as Purchase["paymentMethod"],
    totalAmount: Number(row.total_amount) || 0,
    synced: true,
  };
  if (existing?.id) await db.purchases.update(existing.id, record);
  else await db.purchases.add(record);
}

async function upsertLocalExpense(row: Record<string, unknown>) {
  const existing = await db.expenses.where("uuid").equals(row.id as string).first();
  const record: Omit<Expense, "id"> = {
    uuid: row.id as string,
    date: row.date as string,
    description: row.description as string,
    category: (row.category as string) ?? "",
    amount: Number(row.amount) || 0,
    paidFrom: (row.paid_from as Expense["paidFrom"]) ?? "Cash",
    synced: true,
  };
  if (existing?.id) await db.expenses.update(existing.id, record);
  else await db.expenses.add(record);
}

async function upsertLocalLedgerEntry(row: Record<string, unknown>) {
  const existing = await db.ledgerEntries.where("uuid").equals(row.id as string).first();
  const record: Omit<LedgerEntry, "id"> = {
    uuid: row.id as string,
    ledger: row.ledger as LedgerEntry["ledger"],
    date: row.date as string,
    description: (row.description as string) ?? "",
    type: row.type as LedgerEntry["type"],
    amountIn: Number(row.amount_in) || 0,
    amountOut: Number(row.amount_out) || 0,
    relatedTransferId: (row.related_transfer_id as string) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    synced: true,
  };
  if (existing?.id) await db.ledgerEntries.update(existing.id, record);
  else await db.ledgerEntries.add(record);
}

// ---------------------------------------------------------------
// REALTIME: keep every open device in sync within a second or two of a
// change happening anywhere else, without needing to poll.
// ---------------------------------------------------------------
export function subscribeRealtime() {
  if (!supabase) return () => {};
  const client = supabase;

  const channel = client
    .channel("mwendo-pos-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalProduct(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalCategory(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalSupplier(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalCustomer(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalSale(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalPurchase(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalExpense(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalProfile(payload.new as Record<string, unknown>);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, (payload) => {
      if (payload.new && Object.keys(payload.new).length) upsertLocalLedgerEntry(payload.new as Record<string, unknown>);
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------
// Bootstrapping: call this once when the authenticated app shell mounts.
// ---------------------------------------------------------------
export function startSyncEngine(): () => void {
  if (!supabaseConfigured) return () => {};

  pullAll().then(() => pushQueuedChanges());
  const unsubscribeRealtime = subscribeRealtime();

  const onOnline = () => pushQueuedChanges();
  window.addEventListener("online", onOnline);
  const interval = setInterval(() => {
    if (navigator.onLine) pushQueuedChanges();
  }, 20000);

  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
    unsubscribeRealtime();
  };
}
