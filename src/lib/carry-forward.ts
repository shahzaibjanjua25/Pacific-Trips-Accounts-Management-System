import { prisma } from "./prisma";
import { monthLabel } from "./utils";

/**
 * Fixed monthly loan installments (PKR) by employee name match.
 * Used when EmployeeLoan.monthlyInstallment is 0 or missing.
 */
const LOAN_INSTALLMENTS: Record<string, number> = {
  ahsaan: 30000,
  amjad: 20000,
  ammar: 20000,
  awais: 20000,
};

function installmentFor(name: string, fallback: number): number {
  const key = name.toLowerCase().trim();
  for (const [k, v] of Object.entries(LOAN_INSTALLMENTS)) {
    if (key.includes(k)) return v;
  }
  return fallback > 0 ? fallback : 0;
}

function prevYearMonth(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

export async function getOrCreatePeriodWithCarryForward(
  year: number,
  month: number
) {
  const label = monthLabel(year, month);

  const existing = await prisma.period.findUnique({
    where: { year_month: { year, month } },
  });
  if (existing) return { period: existing, carried: false };

  const result = await prisma.$transaction(
    async (tx) => {
      const recheck = await tx.period.findUnique({
        where: { year_month: { year, month } },
      });
      if (recheck) return { period: recheck, carried: false };

      const period = await tx.period.create({ data: { year, month, label } });

      const prev = prevYearMonth(year, month);
      const prevPeriod = await tx.period.findUnique({
        where: { year_month: { year: prev.year, month: prev.month } },
      });
      if (!prevPeriod) return { period, carried: false };

      await carryForwardTx(tx, prevPeriod.id, period.id);
      return { period, carried: true };
    },
    { timeout: 60000 }
  );

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carryForwardTx(
  tx: any,
  fromPeriodId: string,
  toPeriodId: string
) {
  // --- Receivables (open balances only) ---
  try {
    const openRecv = await tx.receivable.findMany({
      where: { periodId: fromPeriodId, remainingAmount: { gt: 0 } },
    });
    for (const r of openRecv) {
      await tx.receivable.create({
        data: {
          periodId: toPeriodId,
          clientId: r.clientId,
          clientName: r.clientName,
          contact: r.contact,
          bookingDate: r.bookingDate,
          tripDates: r.tripDates,
          destination: r.destination,
          totalPackage: r.remainingAmount,
          amountToReceive: r.remainingAmount,
          amountReceived: 0,
          remainingAmount: r.remainingAmount,
          dueDate: r.dueDate,
          daysOverdue: r.daysOverdue,
          tripStart: r.tripStart,
          salesperson: r.salesperson,
          discounts: r.discounts,
          additionalCharges: r.additionalCharges,
          status: r.daysOverdue > 0 ? "Overdue" : "Open",
          notes: r.notes
            ? `${r.notes} | CF from prior month`
            : "Carried forward open balance",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] receivables failed:", e);
  }

  // --- Payables (open balances only) ---
  try {
    const openPay = await tx.payable.findMany({
      where: { periodId: fromPeriodId, remaining: { gt: 0 } },
    });
    for (const p of openPay) {
      await tx.payable.create({
        data: {
          periodId: toPeriodId,
          supplierName: p.supplierName,
          category: p.category,
          description: p.description,
          invoiceRef: p.invoiceRef,
          originalAmount: p.remaining,
          amountPaid: 0,
          remaining: p.remaining,
          dueDate: p.dueDate,
          daysOverdue: p.daysOverdue,
          status: p.daysOverdue > 0 ? "Overdue" : "Open",
          relatedTrip: p.relatedTrip,
          notes: p.notes
            ? `${p.notes} | CF from prior month`
            : "Carried forward open balance",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] payables failed:", e);
  }

  // --- Supplier advances (remaining) ---
  try {
    const advs = await tx.supplierAdvance.findMany({
      where: { periodId: fromPeriodId, remaining: { gt: 0 } },
    });
    for (const a of advs) {
      await tx.supplierAdvance.create({
        data: {
          periodId: toPeriodId,
          supplierName: a.supplierName,
          amount: a.remaining,
          adjustedAmount: 0,
          remaining: a.remaining,
          dateGiven: a.dateGiven,
          notes: a.notes
            ? `${a.notes} | CF`
            : "Carried forward advance remaining",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] advances failed:", e);
  }

  // --- Pending refunds ---
  try {
    const refunds = await tx.refund.findMany({
      where: { periodId: fromPeriodId, status: "Pending" },
    });
    for (const r of refunds) {
      await tx.refund.create({
        data: {
          periodId: toPeriodId,
          clientId: r.clientId,
          clientName: r.clientName,
          amount: r.amount,
          reason: r.reason,
          status: "Pending",
          notes: r.notes
            ? `${r.notes} | CF`
            : "Carried forward pending refund",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] refunds failed:", e);
  }

  // --- Employee loans (month boundary) ---
  // Schedule the user expects:
  //   Oct start: remaining 100,000, installment 20,000 (taken from Oct salary)
  //   After Oct installment: remaining 80,000
  //   Nov start: remaining 80,000, installment 20,000
  //   After Nov installment: remaining 60,000
  //   Dec start: remaining 60,000, ... until 0
  //
  // Installment is applied ONCE per month:
  //   - Prefer: already applied when that month's payroll was marked Paid
  //   - Otherwise: apply it here when rolling into the next month
  // Never double-deduct.
  try {
    const loans = await tx.employeeLoan.findMany({
      where: { remainingAmount: { gt: 0 } },
      include: { employee: true },
    });
    for (const loan of loans) {
      const empName = loan.employee?.name || "";
      let installment = installmentFor(
        empName,
        loan.monthlyInstallment || 0
      );
      if (installment <= 0) {
        const fixed = installmentFor(empName, 0);
        if (fixed > 0 && (loan.monthlyInstallment || 0) === 0) {
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: { monthlyInstallment: fixed },
          });
        }
        continue;
      }

      // Did previous month's payroll already recover this installment?
      let alreadyApplied = false;
      if (loan.employeeId) {
        const prevPay = await tx.payrollEntry.findFirst({
          where: {
            periodId: fromPeriodId,
            employeeId: loan.employeeId,
            status: "Paid",
            loanInstallment: { gt: 0 },
          },
        });
        if (prevPay) alreadyApplied = true;
        if (!prevPay) {
          const byName = await tx.payrollEntry.findFirst({
            where: {
              periodId: fromPeriodId,
              employeeName: empName,
              status: "Paid",
              loanInstallment: { gt: 0 },
            },
          });
          if (byName) alreadyApplied = true;
        }
      }

      let remaining = loan.remainingAmount;
      if (!alreadyApplied) {
        const take = Math.min(installment, remaining);
        remaining = Math.max(0, remaining - take);
      }

      // Installment for the NEW month = scheduled amount, capped at what is still owed
      const nextInstallment =
        remaining <= 0 ? 0 : Math.min(installment, remaining);

      await tx.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remainingAmount: remaining,
          monthlyInstallment: nextInstallment,
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] employee loans failed:", e);
  }

  // --- Payroll rows for new month (from previous month staff + open loans) ---
  try {
    const prevPayroll = await tx.payrollEntry.findMany({
      where: { periodId: fromPeriodId },
    });
    const seen = new Set<string>();

    for (const p of prevPayroll) {
      seen.add(p.employeeName);
      const emp = p.employeeId
        ? await tx.employee.findUnique({ where: { id: p.employeeId } })
        : await tx.employee.findFirst({ where: { name: p.employeeName } });

      const nameL = (p.employeeName || "").toLowerCase();
      const isLead =
        nameL.includes("ahmad") ||
        nameL.includes("amad") ||
        nameL.includes("ammar");
      const isSales = emp?.role === "Sales";
      const basic = isLead
        ? 0
        : p.basicSalary || emp?.basicSalary || (isSales ? 40000 : 0);
      const tax = p.taxDeducted || 0;
      const other = p.otherDeductions || 0;

      // Loan remaining was already reduced above; read current balance
      let nextInstallment = 0;
      if (emp) {
        const currentLoan = await tx.employeeLoan.findFirst({
          where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
        });
        if (currentLoan) {
          nextInstallment = installmentFor(
            p.employeeName,
            currentLoan.monthlyInstallment || 0
          );
          // Never schedule more than remaining
          if (nextInstallment > currentLoan.remainingAmount) {
            nextInstallment = currentLoan.remainingAmount;
          }
        }
      }

      // Commission starts at 0 for new month (recompute later)
      const net = Math.max(0, basic - tax - nextInstallment - other);

      await tx.payrollEntry.create({
        data: {
          periodId: toPeriodId,
          employeeId: emp?.id || p.employeeId,
          employeeName: p.employeeName,
          basicSalary: basic,
          taxDeducted: tax,
          loanInstallment: nextInstallment,
          otherDeductions: other,
          netPayable: net,
          amountPaid: 0,
          remaining: net,
          status: "Pending",
          notes: "Carried forward - edit / compute as needed",
        },
      });
    }

    // Employees with open loans but no prior payroll row
    const activeEmps = await tx.employee.findMany({ where: { isActive: true } });
    for (const emp of activeEmps) {
      if (seen.has(emp.name)) continue;
      const loan = await tx.employeeLoan.findFirst({
        where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
      });
      if (!loan) continue;
      let nextInstallment = installmentFor(
        emp.name,
        loan.monthlyInstallment || 0
      );
      if (nextInstallment > loan.remainingAmount) {
        nextInstallment = loan.remainingAmount;
      }
      const nameL = emp.name.toLowerCase();
      const isLead =
        nameL.includes("ahmad") ||
        nameL.includes("amad") ||
        nameL.includes("ammar");
      const basic = isLead
        ? 0
        : emp.basicSalary || (emp.role === "Sales" ? 40000 : 0);
      const net = Math.max(0, basic - nextInstallment);
      await tx.payrollEntry.create({
        data: {
          periodId: toPeriodId,
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          loanInstallment: nextInstallment,
          netPayable: net,
          amountPaid: 0,
          remaining: net,
          status: "Pending",
          notes: "Opened from carry-forward (loan still open)",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] payroll failed:", e);
  }

  // --- Recurring office expenses ---
  try {
    const prevOffice = await tx.officeExpense.findMany({
      where: { periodId: fromPeriodId, recurring: true },
    });
    const seenCat = new Set<string>();
    for (const o of prevOffice) {
      if (seenCat.has(o.category)) continue;
      seenCat.add(o.category);
      await tx.officeExpense.create({
        data: {
          periodId: toPeriodId,
          category: o.category,
          description: o.description,
          amount: o.amount,
          vendor: o.vendor,
          paymentMethod: o.paymentMethod,
          recurring: true,
          notes: "Carried template - edit if needed",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] office expenses failed:", e);
  }

  // --- Marketing template (sum of prior month as starting point) ---
  try {
    const prevMkt = await tx.marketingExpense.findMany({
      where: { periodId: fromPeriodId },
    });
    if (prevMkt.length > 0) {
      const total = prevMkt.reduce(
        (s: number, m: { amount: number }) => s + m.amount,
        0
      );
      await tx.marketingExpense.create({
        data: {
          periodId: toPeriodId,
          channel: "Monthly Ads",
          description: "Carried from previous month - edit if needed",
          amount: total,
          notes: "Carried template",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] marketing failed:", e);
  }

  // --- Vadets (once only - no duplicate block) ---
  try {
    const prevVadets = await tx.vadet.findMany({
      where: { periodId: fromPeriodId },
    });
    for (const v of prevVadets) {
      await tx.vadet.create({
        data: {
          periodId: toPeriodId,
          name: v.name,
          amount: v.amount,
          notes: "Carried forward",
        },
      });
    }
  } catch (e) {
    console.error("[carry-forward] vadets failed:", e);
  }
}
