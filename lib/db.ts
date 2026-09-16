import Dexie, { type Table } from "dexie";
import type {
  AppUser,
  Category,
  Supplier,
  Product,
  Customer,
  Sale,
  Purchase,
  Expense,
  SyncEvent,
  LedgerEntry,
} from "./types";

// Dexie wraps the browser's IndexedDB. Every table lives entirely on the
// device — the app never needs a network request to read or write data,
// which is what makes it work with no internet connection.
export class MwendoDB extends Dexie {
  users!: Table<AppUser, number>;
  categories!: Table<Category, number>;
  suppliers!: Table<Supplier, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  sales!: Table<Sale, number>;
  purchases!: Table<Purchase, number>;
  expenses!: Table<Expense, number>;
  ledgerEntries!: Table<LedgerEntry, number>;
  syncQueue!: Table<SyncEvent, number>;

  constructor() {
    super("mwendo-pos-db");
    this.version(1).stores({
      users: "++id, uuid, email",
      categories: "++id, uuid, name",
      suppliers: "++id, uuid, name, category",
      products: "++id, uuid, sku, name, category, status",
      customers: "++id, uuid, name, type",
      sales: "++id, uuid, date, customerId, cashierId, synced",
      purchases: "++id, uuid, date, supplierId, synced",
      expenses: "++id, uuid, date, category, synced",
      syncQueue: "++id, uuid, type, synced, createdAt",
    });
    this.version(2).stores({
      ledgerEntries: "++id, uuid, ledger, date, type, synced",
    });
  }
}

export const db = new MwendoDB();

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

// Queue a sync event alongside the "real" write. A future backend can read
// this table and replay events in order; nothing here depends on a server
// existing yet.
export async function queueSyncEvent(
  type: SyncEvent["type"],
  payload: unknown
) {
  await db.syncQueue.add({
    uuid: uuid(),
    type,
    payload,
    createdAt: nowISO(),
    synced: false,
  });
}
