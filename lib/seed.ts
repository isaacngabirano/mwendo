import { db, uuid, nowISO } from "./db";
import { hashPassword } from "./auth";
import { supabaseConfigured } from "./supabaseClient";
import type { Product, Supplier, Customer, Category, Sale, AppUser } from "./types";

const SWATCHES = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];
function swatchFor(i: number) {
  return SWATCHES[i % SWATCHES.length];
}

// This mirrors the categories and real products found in the client's
// existing spreadsheets, so the app isn't empty/fake on first run.
const CATEGORY_NAMES = [
  "Rice",
  "Beans",
  "Flour",
  "Grains",
  "Cooking Oil",
  "Salt",
  "Sugar",
  "Snacks",
];

const SUPPLIER_SEED: Omit<Supplier, "id" | "uuid" | "createdAt">[] = [
  { name: "Rice Wholesalers", category: "Rice", productsSupplied: "Rice Super I/II/III, Beyenge", contact: "", location: "Kampala wholesale markets", notes: "Various cash vendors" },
  { name: "Sugar Wholesalers", category: "Sugar", productsSupplied: "Kakira, Kyenjojo, Lugazi, Kaliro sugar", contact: "", location: "Kampala", notes: "Various cash vendors" },
  { name: "Edible Oil Vendors", category: "Cooking Oil", productsSupplied: "Fortune, Stargoldy, Roki, Nile, Sunday cooking oils", contact: "", location: "Kampala", notes: "Various cash vendors" },
  { name: "Wheat Flour Vendors", category: "Flour", productsSupplied: "Azam, Pembe, Kaswa, Supreme, Bella, Ntake", contact: "", location: "Kampala", notes: "Various cash vendors" },
];

// [name, category, baseUnit, costPrice, kgOrPieceSellPrice, stockQty, reorderThreshold, sackFactor?, sackPrice?]
const PRODUCT_SEED: Array<{
  name: string;
  category: string;
  baseUnit: string;
  cost: number;
  price: number;
  stock: number;
  reorder: number;
  sack?: { factor: number; price: number };
}> = [
  { name: "Rice Super I (Kgs)", category: "Rice", baseUnit: "kg", cost: 3200, price: 4000, stock: 180, reorder: 40, sack: { factor: 25, price: 95000 } },
  { name: "Rice Super II (Kgs)", category: "Rice", baseUnit: "kg", cost: 2900, price: 3800, stock: 140, reorder: 40, sack: { factor: 25, price: 88000 } },
  { name: "Rice Super III (Kgs)", category: "Rice", baseUnit: "kg", cost: 2700, price: 3500, stock: 90, reorder: 40, sack: { factor: 25, price: 82000 } },
  { name: "Rice Beyenge (Kgs)", category: "Rice", baseUnit: "kg", cost: 4800, price: 5500, stock: 60, reorder: 30, sack: { factor: 25, price: 130000 } },
  { name: "Beans Karara (Kgs)", category: "Beans", baseUnit: "kg", cost: 3200, price: 3700, stock: 100, reorder: 25, sack: { factor: 50, price: 175000 } },
  { name: "Beans Masavu (Kgs)", category: "Beans", baseUnit: "kg", cost: 4100, price: 4700, stock: 60, reorder: 20 },
  { name: "Beans Mixed (Kgs)", category: "Beans", baseUnit: "kg", cost: 3200, price: 3700, stock: 45, reorder: 20 },
  { name: "Beans Nambaale (Kgs)", category: "Beans", baseUnit: "kg", cost: 3900, price: 4500, stock: 70, reorder: 20 },
  { name: "Beans Yellow (Kgs)", category: "Beans", baseUnit: "kg", cost: 4400, price: 5000, stock: 30, reorder: 15 },
  { name: "Cassava Flour (Kgs)", category: "Flour", baseUnit: "kg", cost: 2200, price: 2800, stock: 50, reorder: 15 },
  { name: "Millet Flour (Kgs)", category: "Flour", baseUnit: "kg", cost: 3500, price: 4200, stock: 35, reorder: 15 },
  { name: "Maize Flour - Wabuyinza (Kgs)", category: "Flour", baseUnit: "kg", cost: 2000, price: 2600, stock: 120, reorder: 30, sack: { factor: 25, price: 62000 } },
  { name: "Soya Flour (Kgs)", category: "Flour", baseUnit: "kg", cost: 3800, price: 4500, stock: 20, reorder: 10 },
  { name: "G Nuts - Pounded (Kgs)", category: "Grains", baseUnit: "kg", cost: 8500, price: 10000, stock: 25, reorder: 10 },
  { name: "Pop Corns (Kgs)", category: "Grains", baseUnit: "kg", cost: 2500, price: 3200, stock: 40, reorder: 15 },
  { name: "Peas (Kgs)", category: "Grains", baseUnit: "kg", cost: 3600, price: 4200, stock: 30, reorder: 15 },
  { name: "Cooking Oil - Fortune 1 Ltr", category: "Cooking Oil", baseUnit: "litre", cost: 6800, price: 8000, stock: 55, reorder: 20 },
  { name: "Cooking Oil - Roki 1 Ltr", category: "Cooking Oil", baseUnit: "litre", cost: 7000, price: 8300, stock: 40, reorder: 20 },
  { name: "Cooking Oil - Stargoldy 10 Ltr Jerrycan", category: "Cooking Oil", baseUnit: "litre", cost: 6500, price: 7600, stock: 90, reorder: 30 },
  { name: "Salt - Bahari (Packet)", category: "Salt", baseUnit: "piece", cost: 1200, price: 1800, stock: 200, reorder: 50 },
  { name: "Sugar - Kyenjojo (Kgs)", category: "Sugar", baseUnit: "kg", cost: 3600, price: 4000, stock: 150, reorder: 40, sack: { factor: 50, price: 195000 } },
  { name: "Sugar - Kakira (Kgs)", category: "Sugar", baseUnit: "kg", cost: 3700, price: 4100, stock: 130, reorder: 40, sack: { factor: 50, price: 200000 } },
  { name: "Milk - Fresh (Litres)", category: "Snacks", baseUnit: "litre", cost: 2600, price: 3200, stock: 30, reorder: 10 },
  { name: "Biscuits - Assorted (Piece)", category: "Snacks", baseUnit: "piece", cost: 800, price: 1200, stock: 300, reorder: 60 },
];

export async function seedIfEmpty() {
  // Once Supabase is wired up, it is the source of truth — the app fills
  // local data via pullAll() on startup instead of this fake demo seed.
  if (supabaseConfigured) return;

  const existing = await db.products.count();
  if (existing > 0) return;

  const categories: Category[] = CATEGORY_NAMES.map((name) => ({
    uuid: uuid(),
    name,
  }));
  await db.categories.bulkAdd(categories);

  const suppliers: Supplier[] = SUPPLIER_SEED.map((s) => ({
    ...s,
    uuid: uuid(),
    createdAt: nowISO(),
  }));
  await db.suppliers.bulkAdd(suppliers);
  const supplierByCategory = new Map(suppliers.map((s) => [s.category, s.uuid]));

  const products: Product[] = PRODUCT_SEED.map((p, i) => {
    const sellUnits = [
      {
        id: "unit-1",
        label: `1 ${p.baseUnit === "piece" ? "Piece" : p.baseUnit === "litre" ? "Litre" : "Kg"}`,
        factor: 1,
        price: p.price,
      },
    ];
    if (p.sack) {
      sellUnits.push({
        id: "unit-2",
        label: `${p.sack.factor}${p.baseUnit === "kg" ? "Kg" : ""} Sack`,
        factor: p.sack.factor,
        price: p.sack.price,
      });
    }
    return {
      uuid: uuid(),
      sku: `SKU-${String(i + 1).padStart(3, "0")}`,
      name: p.name,
      category: p.category,
      supplierId: supplierByCategory.get(p.category),
      baseUnit: p.baseUnit,
      sellUnits,
      costPrice: p.cost,
      stockQty: p.stock,
      reorderThreshold: p.reorder,
      status: "Active" as const,
      imageColor: swatchFor(i),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  });
  await db.products.bulkAdd(products);

  const walkIn: Customer = {
    uuid: uuid(),
    name: "Walk-in Cash Customer",
    type: "Walk-in",
    contact: "",
    creditBalance: 0,
    createdAt: nowISO(),
  };
  const creditSample: Customer = {
    uuid: uuid(),
    name: "Nankoko (Credit)",
    type: "Credit",
    contact: "",
    creditBalance: 24000,
    createdAt: nowISO(),
  };
  await db.customers.bulkAdd([walkIn, creditSample]);

  const ownerHash = await hashPassword("owner123");
  const cashierHash = await hashPassword("cashier123");
  const users: AppUser[] = [
    {
      uuid: uuid(),
      name: "Admin User",
      email: "owner@mwendofoods.ug",
      passwordHash: ownerHash,
      role: "Owner",
      createdAt: nowISO(),
    },
    {
      uuid: uuid(),
      name: "Cashier",
      email: "cashier@mwendofoods.ug",
      passwordHash: cashierHash,
      role: "Cashier",
      createdAt: nowISO(),
    },
  ];
  await db.users.bulkAdd(users);

  // A couple of weeks of sample sales so the dashboard has something to show.
  const paymentMethods = ["Cash", "Mobile Money", "Bank"] as const;
  const sales: Sale[] = [];
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const saleCount = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < saleCount; s++) {
      const lineCount = 1 + Math.floor(Math.random() * 3);
      const items = [];
      let total = 0;
      for (let l = 0; l < lineCount; l++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const unit = product.sellUnits[Math.floor(Math.random() * product.sellUnits.length)];
        const qty = 1 + Math.floor(Math.random() * 3);
        const lineTotal = unit.price * qty;
        total += lineTotal;
        items.push({
          productId: product.uuid,
          productName: product.name,
          sellUnitLabel: unit.label,
          factor: unit.factor,
          quantity: qty,
          unitPrice: unit.price,
          lineTotal,
        });
      }
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      date.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
      sales.push({
        uuid: uuid(),
        date: date.toISOString(),
        items,
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        customerId: walkIn.uuid,
        customerName: walkIn.name,
        cashierId: users[1].uuid,
        cashierName: users[1].name,
        totalAmount: total,
        synced: false,
      });
    }
  }
  await db.sales.bulkAdd(sales);
}
