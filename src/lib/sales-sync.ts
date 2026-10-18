// src/lib/sales-sync.ts
// Single source of truth for keeping SalesPerformance in sync with
// Receivable / client edits.
//
// RULES:
//   - ONE SalesPerformance row per (periodId, employeeName, clientName).
//   - All edits must UPSERT that row (never blindly INSERT).
//   - Reduce/delete must remove or shrink that row, never leave orphans.
//   - After any change, recompute commission + payroll for the affected
//     salesperson so the Sales Team page reflects it instantly.

import { prisma } from "./prisma";
import { computeSalesPayroll } from "./payroll-service";
import { syncPayrollForEmployee } from "./links-service";

/** Normalize client name so "Mr Haris" and "mr haris" land on the same row. */
function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Set this salesperson's sale for `clientName` in `periodId` to exactly
 * `amount`. Creates the row if missing, updates it if present, deletes it
 * if `amount <= 0`. Then recomputes commission + payroll.
 */
export async function setSaleForClient(opts: {
  periodId: string;
  salesperson: string;
  clientName: string;
  amount: number;
  tourDate?: string | Date | null;
  description?: string | null;
  notes?: string | null;
}): Promise<{ salespersonChanged: boolean }> {
  const { periodId, salesperson, clientName } = opts;
  const amount = Math.max(0, Number(opts.amount) || 0);

  if (!salesperson || !clientName) {
    return { salespersonChanged: false };
  }

  // Only Sales-role employees get commission rows
  const emp = await prisma.employee.findFirst({
    where: { name: salesperson, isActive: true },
  });
  if (!emp || emp.role !== "Sales") {
    return { salespersonChanged: false };
  }

  // Find every sales row this employee has for this client (defensive —
  // older data may have duplicates from previous bugs). Keep ONE, delete
  // the rest so we converge on a single truth.
  const rows = await prisma.salesPerformance.findMany({
    where: { periodId, clientName },
    orderBy: { createdAt: "asc" },
  });

  // Rows that belong to this salesperson for this client (name match)
  const mine = rows.filter(
    (r) => normName(r.employeeName) === normName(emp.name)
  );
  const others = rows.filter(
    (r) => normName(r.employeeName) !== normName(emp.name)
  );

  // If some OTHER salesperson already owns this client for this period,
  // we still allow adding this one, but we'll warn via return flag.
  const salespersonChanged = others.length > 0;

  if (amount <= 0) {
    // Remove all rows for this salesperson + client
    for (const r of mine) {
      await prisma.salesPerformance.delete({ where: { id: r.id } });
    }
    await computeSalesPayroll(periodId);
    await syncPayrollForEmployee(periodId, emp.name);
    return { salespersonChanged };
  }

  const tourDate = opts.tourDate ? new Date(opts.tourDate) : null;

  if (mine.length === 0) {
    // Create exactly ONE row
    await prisma.salesPerformance.create({
      data: {
        periodId,
        employeeId: emp.id,
        employeeName: emp.name,
        tourDate: tourDate ?? new Date(),
        description: opts.description || `Sale to ${clientName}`,
        category: "Sale",
        clientName,
        debit: amount,
        credit: 0,
        status: "Completed",
        notes: opts.notes || null,
      },
    });
  } else {
    // Update the first, delete the rest
    const keep = mine[0];
    await prisma.salesPerformance.update({
      where: { id: keep.id },
      data: {
        debit: amount,
        tourDate: tourDate ?? keep.tourDate,
        description: opts.description ?? keep.description,
        notes: opts.notes ?? keep.notes,
      },
    });
    for (const extra of mine.slice(1)) {
      await prisma.salesPerformance.delete({ where: { id: extra.id } });
    }
  }

  await computeSalesPayroll(periodId);
  await syncPayrollForEmployee(periodId, emp.name);
  return { salespersonChanged };
}

/**
 * Delete all sales rows for a given client + salesperson in a period.
 * Used when a client is deleted, or the salesperson is cleared.
 */
export async function clearSaleForClient(opts: {
  periodId: string;
  salesperson?: string | null;
  clientName: string;
}) {
  const { periodId, salesperson, clientName } = opts;
  const where: Record<string, unknown> = { periodId, clientName };
  if (salesperson) where.employeeName = salesperson;

  const rows = await prisma.salesPerformance.findMany({ where });
  if (rows.length === 0) return;

  const affected = new Set<string>();
  for (const r of rows) {
    affected.add(r.employeeName);
    await prisma.salesPerformance.delete({ where: { id: r.id } });
  }

  await computeSalesPayroll(periodId);
  for (const name of affected) {
    await syncPayrollForEmployee(periodId, name);
  }
}