import { db, uuid, queueSyncEvent } from "./db";
import { pushQueuedChanges } from "./sync";

// Returns the category name that ended up in the list — if one with the
// same name (case-insensitive) already exists, that existing one is reused
// instead of creating a duplicate.
export async function addCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const existing = await db.categories
    .filter((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    .first();
  if (existing) return existing.name;

  const record = { uuid: uuid(), name: trimmed };
  await db.categories.add(record);
  await queueSyncEvent("category-upsert", record);
  pushQueuedChanges();
  return trimmed;
}
