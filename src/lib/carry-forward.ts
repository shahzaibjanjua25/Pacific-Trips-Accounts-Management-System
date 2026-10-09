/**
 * When a new month is created, carry forward from the previous month:
 * - Open receivables (remaining > 0)
 * - Open payables / hotels / transport remaining
 * - Payroll base rows (salaries) — same structure, editable
 * - Employee loans with installment applied
 * - Office recurring expenses template
 * - Supplier advances remaining
 * - Pending refunds
 *
 * Loan installment rules (applied each new month):
 * - Ahsaan: 30,000 / month
 * - Amjad (Amad Amjad): 20,000 / month
 * - Awais: 20,000 / month
 * - Others: use their monthlyInstallment field
 */

import { prisma } from "./prisma";
import { monthLabel } from "./utils";

const LOAN_INSTALLMENTS: Record<string, number> = {
  ahsaan: 30000,
  "mr ahsaan": 30000,
  amjad: 20000,
  "amad amjad": 20000,
  "ammar amjad": 20000,
  awais: 20000,
};

function installmentFor(name: string, fallback: number): number {
  const key = name.toLowerCase().trim();
  for (const [k, v] of Object.entries(LOAN_INSTALLMENTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return fallback || 0;
}

function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export async function getOrCreatePeriodWithCarryForward(year: number, month: number) {
  const label = monthLabel(year, month);
  let period = await prisma.period.findUnique({
    where: { year_month: { year, month } },
  });

  if (period) return { period, carried: false };

  // Create new period
  period = await prisma.period.create({
    data: { year, month, label },
  });

  // Find previous period
  const prev = prevYearMonth(year, month);
  const prevPeriod = await prisma.period.findUnique({
    where: { year_month: { year: prev.year, month: prev.month } },
  });

  if (!prevPeriod) {
    return { period, carried: false };
  }

  await carryForward(prevPeriod.id, period.id);
  return { period, carried: true };
}

async function carryForward(fromPeriodId: string, toPeriodId: string) {
  // ── 1. Receivables with remaining balance ──
  const openRecv = await prisma.receivable.findMany({
    where: { periodId: fromPeriodId, remainingAmount: { gt: 0 } },
  });
  for (const r of openRecv) {
    await prisma.receivable.create({
      data: {
        periodId: toPeriodId,
        clientId: r.clientId,
        clientName: r.clientName,
        contact: r.contact,
        bookingDate: r.bookingDate,
        tripDates: r.tripDates,
        destination: r.destination,
        totalPackage: r.totalPackage,
        amountToReceive: r.remainingAmount,
        amountReceived: 0,
        remainingAmount: r.remainingAmount,
        dueDate: r.dueDate,
        daysOverdue: r.daysOverdue,
        tripStart: r.tripStart,
        salesperson: r.salesperson,
        discounts: r.discounts,
        additionalCharges: r.additionalCharges,
        status: r.remainingAmount > 0 ? "Open" : "Settled",
        notes: `Carried from previous month. Prior received: ${r.amountReceived}`,
      },
    });
  }

  // ── 2. Payables with remaining ──
  const openPay = await prisma.payable.findMany({
    where: { periodId: fromPeriodId, remaining: { gt: 0 } },
  });
  for (const p of openPay) {
    await prisma.payable.create({
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
        relatedTrip: p.relatedTrip,
        status: "Open",
        notes: `Carried from previous month`,
      },
    });
  }

  // ── 3. Hotels remaining ──
  const openHotels = await prisma.hotelBooking.findMany({
    where: { periodId: fromPeriodId, remaining: { gt: 0 } },
  });
  for (const h of openHotels) {
    await prisma.hotelBooking.create({
      data: {
        periodId: toPeriodId,
        hotelName: h.hotelName,
        clientName: h.clientName,
        tripRef: h.tripRef,
        checkIn: h.checkIn,
        checkOut: h.checkOut,
        nights: h.nights,
        rooms: h.rooms,
        agreedCost: h.remaining,
        amountPaid: 0,
        remaining: h.remaining,
        status: "Booked",
        notes: `Carried remaining from previous month`,
      },
    });
  }

  // ── 4. Transport remaining ──
  const openTransport = await prisma.transportJob.findMany({
    where: { periodId: fromPeriodId, remaining: { gt: 0 } },
  });
  for (const t of openTransport) {
    await prisma.transportJob.create({
      data: {
        periodId: toPeriodId,
        driverName: t.driverName,
        vehicle: t.vehicle,
        clientName: t.clientName,
        tripRef: t.tripRef,
        agreedCost: t.remaining,
        fuelCost: 0,
        finalSettlement: 0,
        remaining: t.remaining,
        status: "Pending",
        notes: `Carried remaining from previous month`,
      },
    });
  }

  // ── 5. Supplier advances remaining ──
  const openAdv = await prisma.supplierAdvance.findMany({
    where: { periodId: fromPeriodId, remaining: { gt: 0 } },
  });
  for (const a of openAdv) {
    await prisma.supplierAdvance.create({
      data: {
        periodId: toPeriodId,
        supplierName: a.supplierName,
        amount: a.remaining,
        adjustedAmount: 0,
        remaining: a.remaining,
        relatedTrip: a.relatedTrip,
        notes: `Carried from previous month`,
      },
    });
  }

  // ── 6. Pending refunds ──
  const pendingRefunds = await prisma.refund.findMany({
    where: { periodId: fromPeriodId, status: "Pending" },
  });
  for (const r of pendingRefunds) {
    await prisma.refund.create({
      data: {
        periodId: toPeriodId,
        clientId: r.clientId,
        clientName: r.clientName,
        amount: r.amount,
        reason: r.reason,
        status: "Pending",
        tripRef: r.tripRef,
        notes: `Carried from previous month`,
      },
    });
  }

  // ── 7. Payroll — copy structure (salaries same, user can edit) ──
  const prevPayroll = await prisma.payrollEntry.findMany({
    where: { periodId: fromPeriodId },
  });
  for (const p of prevPayroll) {
    // Apply loan installment deduction for known names
    const installment = installmentFor(p.employeeName, p.loanInstallment);
    const basic = p.basicSalary;
    const tax = p.taxDeducted;
    const other = p.otherDeductions;
    const net = Math.max(0, basic - tax - installment - other);

    await prisma.payrollEntry.create({
      data: {
        periodId: toPeriodId,
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        basicSalary: basic,
        taxDeducted: tax,
        loanInstallment: installment,
        otherDeductions: other,
        netPayable: net,
        status: "Pending",
        notes: p.notes
          ? `${p.notes} | Carried from previous month`
          : `Carried from previous month`,
      },
    });
  }

  // ── 8. Employee loans — reduce remaining by installment, carry leftover ──
  // Loans are not period-scoped in schema; update remaining globally
  const loans = await prisma.employeeLoan.findMany({
    where: { remainingAmount: { gt: 0 } },
  });
  for (const loan of loans) {
    const emp = await prisma.employee.findUnique({ where: { id: loan.employeeId } });
    const name = emp?.name || "";
    const installment = installmentFor(name, loan.monthlyInstallment);
    const newRemaining = Math.max(0, loan.remainingAmount - installment);
    await prisma.employeeLoan.update({
      where: { id: loan.id },
      data: {
        remainingAmount: newRemaining,
        monthlyInstallment: installment,
      },
    });
  }

  // ── 9. Recurring office expenses (as templates for new month) ──
  const prevOffice = await prisma.officeExpense.findMany({
    where: { periodId: fromPeriodId, recurring: true },
  });
  // If none marked recurring, copy all office expense categories from prev as template
  const officeToCopy =
    prevOffice.length > 0
      ? prevOffice
      : await prisma.officeExpense.findMany({ where: { periodId: fromPeriodId } });

  // Dedupe by category — one row per category
  const seenCat = new Set<string>();
  for (const o of officeToCopy) {
    if (seenCat.has(o.category)) continue;
    seenCat.add(o.category);
    await prisma.officeExpense.create({
      data: {
        periodId: toPeriodId,
        category: o.category,
        description: o.description,
        amount: o.amount,
        vendor: o.vendor,
        paymentMethod: o.paymentMethod,
        recurring: true,
        notes: `Carried template from previous month — edit if needed`,
      },
    });
  }

  // ── 10. Marketing recurring ──
  const prevMkt = await prisma.marketingExpense.findMany({
    where: { periodId: fromPeriodId },
  });
  if (prevMkt.length > 0) {
    // Sum or copy first as template
    const total = prevMkt.reduce((s, m) => s + m.amount, 0);
    await prisma.marketingExpense.create({
      data: {
        periodId: toPeriodId,
        channel: "Monthly Ads",
        description: "Carried from previous month — edit if needed",
        amount: total,
        notes: `Carried template from previous month`,
      },
    });
  }

  // ── 11. Vadets (staff advances tracker) — carry remaining amounts ──
  const prevVadets = await prisma.vadet.findMany({ where: { periodId: fromPeriodId } });
  for (const v of prevVadets) {
    if (v.amount <= 0) continue;
    const installment = installmentFor(v.name, 0);
    const newAmt = Math.max(0, v.amount - installment);
    await prisma.vadet.create({
      data: {
        periodId: toPeriodId,
        name: v.name,
        amount: newAmt,
        notes:
          installment > 0
            ? `Carried from prev month; deducted installment ${installment}`
            : `Carried from previous month`,
      },
    });
  }
}
