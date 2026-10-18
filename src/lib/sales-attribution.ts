// src/lib/sales-attribution.ts
import { setSaleForClient } from "./sales-sync";

/**
 * Record a sale attributed to a salesperson.
 * Delegates to setSaleForClient which UPSERTS — one row per
 * (period, salesperson, client). Safe to call repeatedly.
 */
export async function attributeSaleToSalesperson(opts: {
  periodId: string;
  salesperson: string;
  clientName: string;
  amount: number;
  tourDate?: string | Date | null;
  description?: string | null;
  tripRef?: string | null;
  notes?: string | null;
}) {
  if (!opts.salesperson || !opts.clientName || opts.amount <= 0) return null;
  await setSaleForClient({
    periodId: opts.periodId,
    salesperson: opts.salesperson,
    clientName: opts.clientName,
    amount: opts.amount,
    tourDate: opts.tourDate,
    description: opts.description,
    notes: opts.notes,
  });
  return { ok: true };
}