import { db, uuid, nowISO, queueSyncEvent } from "./db";
import { pushQueuedChanges } from "./sync";
import type { LedgerEntry, LedgerName, LedgerEntryType, PaymentMethod } from "./types";

// "Credit" sales don't move any cash/bank/momo — the money hasn't actually
// come in yet, it's just owed. Everything else maps 1:1 onto a ledger.
export function ledgerForPaymentMethod(method: PaymentMethod): LedgerName | null {
  if (method === "Cash") return "Cash";
  if (method === "Mobile Money") return "Mobile Money";
  if (method === "Bank") return "Bank";
  return null; // Credit
}

export async function postLedgerEntry(entry: {
  ledger: LedgerName;
  date: string;
  description: string;
  type: LedgerEntryType;
  amountIn?: number;
  amountOut?: number;
  relatedTransferId?: string;
}) {
  const record: Omit<LedgerEntry, "id"> = {
    uuid: uuid(),
    ledger: entry.ledger,
    date: entry.date,
    description: entry.description,
    type: entry.type,
    amountIn: entry.amountIn ?? 0,
    amountOut: entry.amountOut ?? 0,
    relatedTransferId: entry.relatedTransferId,
    createdAt: nowISO(),
    synced: false,
  };
  await db.ledgerEntries.add(record);
  await queueSyncEvent("ledger-entry", record);
  pushQueuedChanges();
  return record;
}

// A transfer moves money between two ledgers in one user action (e.g.
// "banked today's cash") — it is recorded as a matching Withdrawal on one
// ledger and a Deposit on the other, linked by relatedTransferId so the
// pair always shows together in reports.
export async function postTransfer(params: {
  from: LedgerName;
  to: LedgerName;
  amount: number;
  date: string;
  description: string;
}) {
  const linkId = uuid();
  await postLedgerEntry({
    ledger: params.from,
    date: params.date,
    description: params.description,
    type: "Withdrawal",
    amountOut: params.amount,
    relatedTransferId: linkId,
  });
  await postLedgerEntry({
    ledger: params.to,
    date: params.date,
    description: params.description,
    type: "Deposit",
    amountIn: params.amount,
    relatedTransferId: linkId,
  });
}

export function runningBalance(entries: LedgerEntry[]): (LedgerEntry & { balance: number })[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.createdAt > b.createdAt ? 1 : -1)
  );
  let balance = 0;
  return sorted.map((e) => {
    balance += e.amountIn - e.amountOut;
    return { ...e, balance };
  });
}

export function currentBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountIn - e.amountOut, 0);
}
