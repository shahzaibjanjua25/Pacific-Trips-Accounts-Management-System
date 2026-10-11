/**
 * Sales team payroll rules (Pacific Trips policy):
 * - Each sales member: Basic 40,000 PKR + 2.5% commission on THEIR individual sales
 * - Team Lead "Ahmad Amjad" (also matched as Amad/Ammar):
 *     team sales < 700,000        → fixed salary 55,000
 *     700,000 ≤ sales < 12,000,000 → 1% of team sales
 *     sales ≥ 12,000,000 (target)  → 2.5% of team sales
 *   Target this month: 1 crore 20 lacs (12,000,000 PKR)
 */

import { prisma } from "./prisma";
import { syncPayrollForEmployee } from "./links-service";

const COMMISSION_RATE = 0.025;
const LEAD_TARGET = 12_000_000; // 1 crore 20 lacs
const LEAD_FLOOR = 700_000;
const LEAD_MIN_SALARY = 55_000;

export function isTeamLeadName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("ahmad") ||
    n.includes("amad") ||
    n.includes("ammar")
  );
}

/** Team-lead pay from total non-lead sales team revenue */
export function computeLeadPay(teamTotal: number): {
  amount: number;
  ratePct: number;
  note: string;
} {
  if (teamTotal < LEAD_FLOOR) {
    return {
      amount: LEAD_MIN_SALARY,
      ratePct: 0,
      note: `Team Lead — fixed ${LEAD_MIN_SALARY.toLocaleString()} (team sales < 700k)`,
    };
  }
  if (teamTotal < LEAD_TARGET) {
    const amount = teamTotal * 0.01;
    return {
      amount,
      ratePct: 1,
      note: `Team Lead — 1% of team sales (700k–1.2cr)`,
    };
  }
  const amount = teamTotal * COMMISSION_RATE;
  return {
    amount,
    ratePct: 2.5,
    note: `Team Lead — 2.5% of team sales (target ${LEAD_TARGET.toLocaleString()}+ achieved)`,
  };
}

export async function computeSalesPayroll(periodId: string) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, role: "Sales" },
  });

  const trips = await prisma.trip.findMany({ where: { periodId } });
  const receivables = await prisma.receivable.findMany({ where: { periodId } });
  const salesEntries = await prisma.salesPerformance.findMany({
    where: { periodId },
  });

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

  const teamTotal = employees
    .filter((e) => !isTeamLeadName(e.name))
    .reduce((s, e) => s + (salesByPerson[e.name] || 0), 0);

  const results = [];

  for (const emp of employees) {
    const isLead = isTeamLeadName(emp.name);
    const individualSales = salesByPerson[emp.name] || 0;

    let saleBase: number;
    let commission: number;
    let ratePct: number;
    let leadNote: string | undefined;

    if (isLead) {
      saleBase = teamTotal;
      const lead = computeLeadPay(teamTotal);
      commission = lead.amount;
      ratePct = lead.ratePct;
      leadNote = lead.note;
    } else {
      saleBase = individualSales;
      commission = saleBase * COMMISSION_RATE;
      ratePct = COMMISSION_RATE * 100;
    }

    const existingComm = await prisma.commission.findFirst({
      where: { periodId, employeeName: emp.name },
    });
    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          saleAmount: saleBase,
          commissionRate: ratePct,
          commissionAmt: commission,
          notes: leadNote ?? existingComm.notes,
        },
      });
    } else if (commission > 0) {
      await prisma.commission.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          saleAmount: saleBase,
          commissionRate: ratePct,
          commissionAmt: commission,
          status: "Accrued",
          notes: leadNote,
        },
      });
    }

    await syncPayrollForEmployee(periodId, emp.name);

    results.push({
      employee: emp.name,
      isLead,
      individualSales,
      totalTeamSales: isLead ? teamTotal : undefined,
      commission,
      ratePct,
    });
  }

  return results;
}
