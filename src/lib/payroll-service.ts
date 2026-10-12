/**
 * Sales team payroll rules (Pacific Trips policy):
 * - Each sales member: Basic 40,000 PKR + 2.5% commission on THEIR individual sales
 * - Team Lead "Ahmad/Amad/Ammar Amjad":
 *     team sales < 70 lacs              → fixed salary 55,000
 *     70 lacs ≤ sales < monthly target  → 1% of team sales
 *     sales ≥ monthly target            → 2.5% of team sales
 *   Target is stored per period in the SalesTarget table.
 *
 * Individual / team sales are taken only from SalesPerformance (single source of
 * truth) so deleting a sale removes the full amount, not a partial double-count.
 */

import { prisma } from "./prisma";
import { syncPayrollForEmployee } from "./links-service";

const COMMISSION_RATE = 0.025;
const LEAD_FLOOR = 7_000_000; // 70 lacs
const LEAD_MIN_SALARY = 55_000;
const DEFAULT_LEAD_TARGET = 12_000_000; // 1.2 crore fallback

export function isTeamLeadName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ahmad") || n.includes("amad") || n.includes("ammar");
}

/** Team-lead pay from total non-lead sales team revenue */
export function computeLeadPay(
  teamTotal: number,
  target: number = DEFAULT_LEAD_TARGET
): {
  amount: number;
  ratePct: number;
  note: string;
} {
  if (teamTotal < LEAD_FLOOR) {
    return {
      amount: LEAD_MIN_SALARY,
      ratePct: 0,
      note: `Team Lead — fixed ${LEAD_MIN_SALARY.toLocaleString()} (team sales < 70 lacs)`,
    };
  }
  if (teamTotal < target) {
    const amount = teamTotal * 0.01;
    return {
      amount,
      ratePct: 1,
      note: `Team Lead — 1% of team sales (70 lacs – ${(target / 1e7).toFixed(2)} cr)`,
    };
  }
  const amount = teamTotal * COMMISSION_RATE;
  return {
    amount,
    ratePct: 2.5,
    note: `Team Lead — 2.5% of team sales (target ${target.toLocaleString()}+ achieved)`,
  };
}

export async function computeSalesPayroll(periodId: string) {
  const targetRow = await prisma.salesTarget.findUnique({ where: { periodId } });
  const leadTarget = targetRow?.targetAmount ?? DEFAULT_LEAD_TARGET;

  const employees = await prisma.employee.findMany({
    where: { isActive: true, role: "Sales" },
  });

  const salesEntries = await prisma.salesPerformance.findMany({
    where: { periodId },
  });

  // Single source of truth: SalesPerformance only (avoids double-count with
  // Receivables / Trips created from the same sale entry).
  const salesByPerson: Record<string, number> = {};
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
      const lead = computeLeadPay(teamTotal, leadTarget);
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
    } else if (commission > 0 || isLead) {
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
