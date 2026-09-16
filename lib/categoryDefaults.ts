// Small shops sell things the way they're naturally measured — nobody
// weighs cooking oil in kg or sells rice by the litre. Rather than making
// the cashier or owner pick a unit every time, we infer it from the
// category. "Other"/unrecognised categories fall back to "piece", which is
// the safest default for countable items (snacks, soap bars, etc).
const CATEGORY_UNIT_MAP: Record<string, "kg" | "litre" | "piece"> = {
  Rice: "kg",
  Beans: "kg",
  Flour: "kg",
  Grains: "kg",
  Sugar: "kg",
  "Cooking Oil": "litre",
  Milk: "litre",
  Salt: "piece",
  Soap: "piece",
  Snacks: "piece",
};

export function unitForCategory(category: string): "kg" | "litre" | "piece" {
  return CATEGORY_UNIT_MAP[category] ?? "piece";
}

export function unitLabel(unit: string): string {
  if (unit === "kg") return "Kg";
  if (unit === "litre") return "Litre";
  return "Piece";
}

// A sensible "warn me before I run out" default — nobody wants to think
// about this number, so we pick something proportionate to how the item is
// usually bought and forget about it. It can still matter a lot (it drives
// the Low Stock dashboard alert) so it isn't removed, just hidden from the
// data-entry form.
export function defaultReorderThreshold(baseUnit: string): number {
  if (baseUnit === "kg") return 10;
  if (baseUnit === "litre") return 5;
  return 20; // piece
}

// SKU format: first 3 letters of the category + a running number within
// that category, e.g. "RIC-004". Falls back to a short random code if no
// category is chosen yet.
export function generateSKU(category: string, existingSkusInCategory: number): string {
  const prefix = (category || "GEN").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  const num = String(existingSkusInCategory + 1).padStart(3, "0");
  return `${prefix}-${num}`;
}
