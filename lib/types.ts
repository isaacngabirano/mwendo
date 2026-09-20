// Core data model for Mwendo Foods POS
// Everything is keyed by an auto-increment local `id`, plus a `uuid` that is
// stable across devices — the uuid is what a future sync server would use.

export type PaymentMethod = "Cash" | "Mobile Money" | "Bank" | "Credit";

export type UserRole = "Owner" | "Cashier";

export interface AppUser {
  id?: number;
  uuid: string;
  name: string;
  email: string;
  passwordHash: string; // simple hash, see lib/auth.ts — not for real production security
  role: UserRole;
  createdAt: string;
}

export interface Category {
  id?: number;
  uuid: string;
  name: string;
}

export interface Supplier {
  id?: number;
  uuid: string;
  name: string;
  category: string;
  productsSupplied: string;
  contact: string;
  location: string;
  notes: string;
  createdAt: string;
}

// A product can be sold in more than one unit — e.g. Rice Super I is sold
// loose "per Kg" AND as a "25kg sack", each at its own price. `factor` is how
// many base units one of these sell-units represents (a "25kg sack" has
// factor 25 when the base unit is "kg").
export interface SellUnit {
  id: string; // local id within the product, e.g. "unit-1"
  label: string; // "1 Kg", "25Kg Sack", "1 Litre", "Piece"
  factor: number; // multiplier against baseUnit
  price: number; // selling price for this unit, in UGX
}

export interface Product {
  id?: number;
  uuid: string;
  sku: string;
  name: string;
  category: string;
  supplierId?: string; // Supplier.uuid
  baseUnit: string; // "kg", "litre", "piece"
  sellUnits: SellUnit[];
  costPrice: number; // cost per baseUnit, UGX
  stockQty: number; // current stock, expressed in baseUnit
  reorderThreshold: number; // in baseUnit
  status: "Active" | "Inactive";
  imageColor?: string; // fallback color swatch since we have no product photos
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id?: number;
  uuid: string;
  name: string;
  type: "Walk-in" | "Credit";
  contact: string;
  creditBalance: number; // amount they currently owe, UGX
  createdAt: string;
}

export interface SaleLineItem {
  productId: string; // Product.uuid
  productName: string;
  sellUnitLabel: string;
  factor: number; // how many base units this sell-unit represents — needed by the server to deduct stock correctly
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id?: number;
  uuid: string;
  date: string; // ISO timestamp
  items: SaleLineItem[];
  paymentMethod: PaymentMethod;
  customerId: string; // Customer.uuid
  customerName: string;
  cashierId: string; // AppUser.uuid
  cashierName: string;
  totalAmount: number;
  synced: boolean;
}

export interface PurchaseLineItem {
  productId: string;
  productName: string;
  quantity: number; // in baseUnit
  unitCost: number;
  lineTotal: number;
}

export interface Purchase {
  id?: number;
  uuid: string;
  date: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseLineItem[];
  paymentMethod: PaymentMethod;
  totalAmount: number;
  synced: boolean;
}

export interface Expense {
  id?: number;
  uuid: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paidFrom: "Cash" | "Mobile Money" | "Bank";
  synced: boolean;
}

// ---------------------------------------------------------------
// Cash & Bank ledger — mirrors the client's real Cashbook/Bankbook sheets.
// Every sale, purchase, and expense automatically posts an entry here so
// the running cash/mobile-money/bank position is always visible without
// anyone having to keep a separate book by hand. Manual entries (deposits,
// withdrawals, transfers between ledgers, opening balances) can also be
// added directly.
// ---------------------------------------------------------------
export type LedgerName = "Cash" | "Mobile Money" | "Bank";

export type LedgerEntryType =
  | "Sale"
  | "Purchase"
  | "Expense"
  | "Deposit" // moving money INTO this ledger from another (e.g. cash banked)
  | "Withdrawal" // moving money OUT of this ledger into another
  | "Opening Balance"
  | "Adjustment";

export interface LedgerEntry {
  id?: number;
  uuid: string;
  ledger: LedgerName;
  date: string;
  description: string;
  type: LedgerEntryType;
  amountIn: number;
  amountOut: number;
  relatedTransferId?: string; // links a Deposit/Withdrawal pair created by one transfer action
  createdAt: string;
  synced: boolean;
}

// A generic offline "event" queue — every write funnels through here so a
// future sync engine has one place to read from. Stock changes are recorded
// as deltas ("-2 kg") rather than absolute numbers so two offline devices
// selling the same product don't clobber each other when they reconnect.
export type SyncEventType =
  | "sale"
  | "purchase"
  | "expense"
  | "stock-adjustment"
  | "product-upsert"
  | "customer-upsert"
  | "supplier-upsert"
  | "category-upsert"
  | "ledger-entry";

export interface SyncEvent {
  id?: number;
  uuid: string;
  type: SyncEventType;
  payload: unknown;
  createdAt: string;
  synced: boolean;
}
