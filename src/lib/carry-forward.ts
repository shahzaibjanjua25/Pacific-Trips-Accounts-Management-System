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

function prevYearMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export async function getOrCreatePeriodWithCarryForward(year: number, month: number) {
  const label = monthLabel(year, month);

  const existing = await prisma.period.findUnique({
    where: { year_month: { year, month } },
  });
  if (existing) return { period: existing, carried: false };

  const result = await prisma.$transaction(async (tx) => {
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
  });

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carryForwardTx(tx: any, fromPeriodId: string, toPeriodId: string) {
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
        discounts: 0,
        additionalCharges: 0,
        status: "Open",
        notes: `Carried forward. Prior received: ${r.amountReceived}`,
      },
    });
  }

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
        relatedTrip: p.relatedTrip,
        status: "Open",
        notes: "Carried forward",
      },
    });
  }

  const openHotels = await tx.hotelBooking.findMany({
    where: { periodId: fromPeriodId, payable: { remaining: { gt: 0 } } },
    include: { payable: true },
  });
  for (const h of openHotels) {
    const payable = await tx.payable.create({
      data: {
        periodId: toPeriodId,
        supplierName: h.hotelName,
        category: "Hotel",
        description: h.clientName ? `Hotel for ${h.clientName}` : "Hotel booking",
        originalAmount: h.payable?.remaining ?? 0,
        amountPaid: 0,
        remaining: h.payable?.remaining ?? 0,
        relatedTrip: h.tripRef,
        status: "Open",
        notes: "Carried forward",
      },
    });
    await tx.hotelBooking.create({
      data: {
        periodId: toPeriodId,
        hotelName: h.hotelName,
        clientName: h.clientName,
        tripRef: h.tripRef,
        checkIn: h.checkIn,
        checkOut: h.checkOut,
        nights: h.nights,
        rooms: h.rooms,
        status: "Booked",
        notes: "Carried remaining",
        payableId: payable.id,
      },
    });
  }

  const openTransport = await tx.transportJob.findMany({
    where: { periodId: fromPeriodId, payable: { remaining: { gt: 0 } } },
    include: { payable: true },
  });
  for (const t of openTransport) {
    const payable = await tx.payable.create({
      data: {
        periodId: toPeriodId,
        supplierName: t.driverName || "Driver",
        category: "Transport",
        description: t.vehicle || "Transport job",
        originalAmount: t.payable?.remaining ?? 0,
        amountPaid: 0,
        remaining: t.payable?.remaining ?? 0,
        relatedTrip: t.tripRef,
        status: "Open",
        notes: "Carried forward",
      },
    });
    await tx.transportJob.create({
      data: {
        periodId: toPeriodId,
        driverName: t.driverName,
        vehicle: t.vehicle,
        clientName: t.clientName,
        tripRef: t.tripRef,
        fuelCost: 0,
        status: "Pending",
        notes: "Carried remaining",
        payableId: payable.id,
      },
    });
  }

  const openAdv = await tx.supplierAdvance.findMany({
    where: { periodId: fromPeriodId, remaining: { gt: 0 } },
  });
  for (const a of openAdv) {
    await tx.supplierAdvance.create({
      data: {
        periodId: toPeriodId,
        supplierName: a.supplierName,
        amount: a.remaining,
        adjustedAmount: 0,
        remaining: a.remaining,
        relatedTrip: a.relatedTrip,
        notes: "Carried forward",
      },
    });
  }

  const pendingRefunds = await tx.refund.findMany({
    where: { periodId: fromPeriodId, status: "Pending" },
  });
  for (const r of pendingRefunds) {
    await tx.refund.create({
      data: {
        periodId: toPeriodId,
        clientId: r.clientId,
        clientName: r.clientName,
        amount: r.amount,
        reason: r.reason,
        status: "Pending",
        tripRef: r.tripRef,
        notes: "Carried forward",
      },
    });
  }

  const prevPayroll = await tx.payrollEntry.findMany({
    where: { periodId: fromPeriodId },
  });
  for (const p of prevPayroll) {
    const installment = installmentFor(p.employeeName, p.loanInstallment);
    const basic = p.basicSalary;
    const tax = p.taxDeducted;
    const other = p.otherDeductions;
    const net = Math.max(0, basic - tax - installment - other);

    await tx.payrollEntry.create({
      data: {
        periodId: toPeriodId,
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        basicSalary: basic,
        taxDeducted: tax,
        loanInstallment: installment,
        otherDeductions: other,
        netPayable: net,
        amountPaid: 0,
        status: "Pending",
        notes: p.notes ? `${p.notes} | Carried forward` : "Carried forward",
      },
    });
  }

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
        notes: "Carried template — edit if needed",
      },
    });
  }

  const prevMkt = await tx.marketingExpense.findMany({
    where: { periodId: fromPeriodId },
  });
  if (prevMkt.length > 0) {
    const total = prevMkt.reduce((s: number, m: { amount: number }) => s + m.amount, 0);
    await tx.marketingExpense.create({
      data: {
        periodId: toPeriodId,
        channel: "Monthly Ads",
        description: "Carried from previous month — edit if needed",
        amount: total,
        notes: "Carried template",
      },
    });
  }

  const prevVadets = await tx.vadet.findMany({ where: { periodId: fromPeriodId } });
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
}