/**
 * Sales team payroll rules (Pacific Trips policy):
 * - Each sales member: Basic 40,000 PKR + 2.5% commission on THEIR individual sales
 * - Team Lead "Amad Amjad": NO basic salary; 2.5% commission on ALL sales-team sales
 */

import { prisma } from "./prisma";

const BASIC_SALARY = 40000;
const COMMISSION_RATE = 0.025; // 2.5%
const TEAM_LEAD_NAME = "Amad Amjad";

export async function computeSalesPayroll(periodId: string) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, role: "Sales" },
  });

  // Total sales in period from trips / receivables attributed to salesperson
  const trips = await prisma.trip.findMany({ where: { periodId } });
  const receivables = await prisma.receivable.findMany({ where: { periodId } });

  // Individual sales by salesperson name
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

  const totalTeamSales = Object.values(salesByPerson).reduce((a, b) => a + b, 0);

  const results = [];

  for (const emp of employees) {
    const isLead = emp.name.toLowerCase().includes("amad") || emp.name === TEAM_LEAD_NAME;
    const individualSales = salesByPerson[emp.name] || 0;

    let basic = 0;
    let commission = 0;
    let saleBase = 0;

    if (isLead) {
      // Team lead: 2.5% of ALL team sales, no basic
      basic = 0;
      saleBase = totalTeamSales;
      commission = totalTeamSales * COMMISSION_RATE;
    } else {
      // Member: 40k basic + 2.5% of their own sales
      basic = BASIC_SALARY;
      saleBase = individualSales;
      commission = individualSales * COMMISSION_RATE;
    }

    // Loan installment if any
    const loan = await prisma.employeeLoan.findFirst({
      where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    const installment = loan?.monthlyInstallment || 0;
    const netPayable = Math.max(0, basic + commission - installment);

    // Upsert payroll entry
    const existing = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName: emp.name },
    });

    let entry;
    if (existing) {
      entry = await prisma.payrollEntry.update({
        where: { id: existing.id },
        data: {
          basicSalary: basic,
          loanInstallment: installment,
          netPayable,
          notes: isLead
            ? `Team Lead: 2.5% of total team sales (${saleBase.toFixed(0)})`
            : `Basic 40k + 2.5% of own sales (${saleBase.toFixed(0)})`,
        },
      });
    } else {
      entry = await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          loanInstallment: installment,
          netPayable,
          status: "Pending",
          notes: isLead
            ? `Team Lead: 2.5% of total team sales (${saleBase.toFixed(0)})`
            : `Basic 40k + 2.5% of own sales (${saleBase.toFixed(0)})`,
        },
      });
    }

    // Upsert commission record
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

    results.push({
      employee: emp.name,
      isLead,
      basic,
      individualSales,
      totalTeamSales: isLead ? totalTeamSales : undefined,
      commission,
      installment,
      netPayable,
    });
  }

  return results;
}
