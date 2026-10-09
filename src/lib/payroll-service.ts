/**
 * Sales team payroll rules (Pacific Trips policy):
 * - Each sales member: Basic 40,000 PKR + 2.5% commission on THEIR individual sales
 * - Team Lead "Amad Amjad": NO basic salary; 2.5% commission on ALL sales-team sales
 */

import { prisma } from "./prisma";
import { syncPayrollForEmployee } from "./links-service";

const COMMISSION_RATE = 0.025;

export async function computeSalesPayroll(periodId: string) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, role: "Sales" },
  });

  const trips = await prisma.trip.findMany({ where: { periodId } });
  const receivables = await prisma.receivable.findMany({ where: { periodId } });
  const salesEntries = await prisma.salesPerformance.findMany({ where: { periodId } });

  const salesByPerson: Record<string, number> = {};
  for (const t of trips) {
    const sp = t.salesperson || "Unassigned";
    salesByPerson[sp] = (salesByPerson[sp] || 0) + t.packageRevenue;
  }
  for (const r of receivables) {
    if (r.salesperson) {
      salesByPerson[r.salesperson] =
        (salesByPerson[r.salesperson] || 0) + r.totalPackage;
    }
  }
  for (const e of salesEntries) {
    salesByPerson[e.employeeName] =
      (salesByPerson[e.employeeName] || 0) + (e.debit || 0);
  }

  const results = [];

  for (const emp of employees) {
    const nameL = emp.name.toLowerCase();
    const isLead = nameL.includes("amad") || nameL.includes("ammar");
    const individualSales = salesByPerson[emp.name] || 0;

    const teamTotal = employees
      .filter((e) => {
        const n = e.name.toLowerCase();
        return !n.includes("amad") && !n.includes("ammar");
      })
      .reduce((s, e) => s + (salesByPerson[e.name] || 0), 0);

    const saleBase = isLead ? teamTotal : individualSales;
    const commission = saleBase * COMMISSION_RATE;

    // Upsert Commission
    const existingComm = await prisma.commission.findFirst({
      where: { periodId, employeeName: emp.name },
    });
    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          saleAmount: saleBase,
          commissionRate: COMMISSION_RATE * 100,
          commissionAmt: commission,
        },
      });
    } else if (commission > 0) {
      await prisma.commission.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          saleAmount: saleBase,
          commissionRate: COMMISSION_RATE * 100,
          commissionAmt: commission,
          status: "Accrued",
        },
      });
    }

    // Recompute the payroll row via the shared helper
    await syncPayrollForEmployee(periodId, emp.name);

    results.push({
      employee: emp.name,
      isLead,
      individualSales,
      totalTeamSales: isLead ? teamTotal : undefined,
      commission,
    });
  }

  return results;
}