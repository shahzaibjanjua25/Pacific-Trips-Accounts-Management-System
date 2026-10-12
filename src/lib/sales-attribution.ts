// src/lib/sales-attribution.ts
import { prisma } from "./prisma";
import { syncPayrollForEmployee } from "./links-service";
import { computeSalesPayroll } from "./payroll-service";

/**
 * Record a sale attributed to a salesperson.
 * Creates a SalesPerformance row + recomputes commission + syncs payroll.
 *
 * Called whenever a client is created with (salesperson, totalPackage).
 *
 * Team Lead rules are handled inside computeSalesPayroll():
 *   - Team total < 70 lacs              -> flat 55,000
 *   - 70 lacs <= team total < target     -> 1.5% of team total
 *   - team total >= target               -> 2.5% of team total
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
  const { periodId, salesperson, clientName, amount } = opts;
  if (!salesperson || !clientName || amount <= 0) return null;

  // Only Sales-role employees get commission
  const emp = await prisma.employee.findFirst({
    where: { name: salesperson, isActive: true },
  });
  if (!emp || emp.role !== "Sales") return null;

  const row = await prisma.salesPerformance.create({
    data: {
      periodId,
      employeeId: emp.id,
      employeeName: emp.name,
      tourDate: opts.tourDate ? new Date(opts.tourDate) : new Date(),
      description: opts.description || `Sale to ${clientName}`,
      category: "Sale",
      subCategory: null,
      clientName,
      debit: amount,
      credit: 0,
      status: "Completed",
      notes: opts.notes || null,
    },
  });

  // Recompute the whole sales team payroll so Team Lead tiered rules
  // and the 2.5% for the individual both apply correctly.
  await computeSalesPayroll(periodId);
  await syncPayrollForEmployee(periodId, emp.name);

  return row;
}