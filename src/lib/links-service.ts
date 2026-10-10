/**
 * Links operational modules (HotelBooking, TransportJob) to the financial
 * master (Payable). Payable is the single source of truth for money owed.
 */
import { prisma } from "./prisma";

/* ─────────────────────────────────────────────
 * PAYABLE ← OPERATIONAL SYNC
 * ───────────────────────────────────────────── */
/**
 * Recompute a payroll entry from scratch based on:
 *   basic + commission − tax − loan installment − other deductions
 * Then set netPayable / remaining / status correctly.
 *
 * If `amountPaid` > 0 and status becomes fully Paid, decrement the linked
 * EmployeeLoan by the current month's installment.
 */
export async function syncPayrollForEmployee(
    periodId: string,
    employeeName: string
): Promise<void> {
    const emp = await prisma.employee.findFirst({ where: { name: employeeName } });
    if (!emp) return;

    const isLead =
        employeeName.toLowerCase().includes("amad") ||
        employeeName.toLowerCase().includes("ammar");

    // Get or create the payroll row for this period
    let pay = await prisma.payrollEntry.findFirst({
        where: { periodId, employeeName },
    });

    // Pull the current commission (if any)
    const commission = await prisma.commission.findFirst({
        where: { periodId, employeeName },
    });
    const commissionAmt = commission?.commissionAmt ?? 0;

    // Determine basic
    const basic = isLead ? 0 : emp.basicSalary || (emp.role === "Sales" ? 40000 : 0);

    // Tax / other deductions — preserve whatever the user set
    const tax = pay?.taxDeducted ?? 0;
    const other = pay?.otherDeductions ?? 0;

    // Loan installment: use the employee loan's monthly installment if present
    const loan = await prisma.employeeLoan.findFirst({
        where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    const installment = loan?.monthlyInstallment ?? 0;

    const netPayable = Math.max(0, basic + commissionAmt - tax - installment - other);
    const amountPaid = pay?.amountPaid ?? 0;
    const remaining = Math.max(0, netPayable - amountPaid);
    const status = remaining <= 0 && amountPaid > 0 ? "Paid" : amountPaid > 0 ? "Partial" : "Pending";

    if (pay) {
        await prisma.payrollEntry.update({
            where: { id: pay.id },
            data: {
                basicSalary: basic,
                loanInstallment: installment,
                netPayable,
                remaining,
                status,
            },
        });
    } else {
        await prisma.payrollEntry.create({
            data: {
                periodId,
                employeeId: emp.id,
                employeeName,
                basicSalary: basic,
                loanInstallment: installment,
                netPayable,
                amountPaid: 0,
                remaining: netPayable,
                status: "Pending",
                notes: isLead
                    ? "Team Lead — 2.5% of team sales"
                    : "Sales — 40k + 2.5% of own sales",
            },
        });
    }
}
/** Ensure a Payable exists for a HotelBooking. Returns payable id. */
export async function ensurePayableForHotel(hotelId: string): Promise<string | null> {
    const hotel = await prisma.hotelBooking.findUnique({ where: { id: hotelId } });
    if (!hotel) return null;
    if (hotel.payableId) return hotel.payableId;

    const payable = await prisma.payable.create({
        data: {
            periodId: hotel.periodId,
            supplierName: hotel.hotelName,
            category: "Hotel",
            description: hotel.clientName ? `Hotel for ${hotel.clientName}` : "Hotel booking",
            originalAmount: 0,
            amountPaid: 0,
            remaining: 0,
            relatedTrip: hotel.tripRef,
            status: "Open",
            notes: hotel.notes,
        },
    });

    await prisma.hotelBooking.update({
        where: { id: hotelId },
        data: { payableId: payable.id },
    });

    return payable.id;
}

/** Ensure a Payable exists for a TransportJob. Returns payable id. */
export async function ensurePayableForTransport(jobId: string): Promise<string | null> {
    const job = await prisma.transportJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (job.payableId) return job.payableId;
    if (!job.driverName) return null;

    const payable = await prisma.payable.create({
        data: {
            periodId: job.periodId,
            supplierName: job.driverName,
            category: "Transport",
            description: job.vehicle || "Transport job",
            originalAmount: 0,
            amountPaid: 0,
            remaining: 0,
            relatedTrip: job.tripRef,
            status: "Open",
            notes: job.notes,
        },
    });

    await prisma.transportJob.update({
        where: { id: jobId },
        data: { payableId: payable.id },
    });

    return payable.id;
}

/** Sync operational status word to match Payable financial status. */
export function deriveHotelStatus(remaining: number, paid: number): string {
    if (remaining <= 0 && paid > 0) return "Paid";
    if (paid > 0) return "Partial";
    return "Booked";
}

export function deriveTransportStatus(remaining: number, paid: number): string {
    if (remaining <= 0 && paid > 0) return "Settled";
    if (paid > 0) return "Partial";
    return "Pending";
}

export async function propagatePayableToOperational(payableId: string) {
    const p = await prisma.payable.findUnique({
        where: { id: payableId },
        include: { hotelBooking: true, transportJob: true },
    });
    if (!p) return;

    if (p.hotelBooking) {
        await prisma.hotelBooking.update({
            where: { id: p.hotelBooking.id },
            data: { status: deriveHotelStatus(p.remaining, p.amountPaid) },
        });
    }

    if (p.transportJob) {
        await prisma.transportJob.update({
            where: { id: p.transportJob.id },
            data: { status: deriveTransportStatus(p.remaining, p.amountPaid) },
        });
    }
}

/* ─────────────────────────────────────────────
 * PAYMENT APPLICATION
 * ───────────────────────────────────────────── */

export type AppliedLink = {
    entityType:
    | "payable"
    | "hotel"
    | "transport"
    | "receivable"
    | "payroll"
    | "commission"
    | "refund"
    | "advance";
    entityId: string;
    appliedAmount: number;
};

function nameMatch(a: string, b: string): boolean {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

async function applyToPayable(
  periodId: string,
  payableId: string,
  amount: number
): Promise<number> {
  const p = await prisma.payable.findUnique({ where: { id: payableId } });
  if (!p) return 0;

  // If payable has no billed amount yet, treat this payment as the amount owed
  const orig = p.originalAmount > 0 ? p.originalAmount : amount;
  const pay = Math.min(amount, Math.max(0, orig - p.amountPaid));
  const newPaid = p.amountPaid + pay;
  const newRem = Math.max(0, orig - newPaid);

  await prisma.payable.update({
    where: { id: p.id },
    data: {
      originalAmount: orig,
      amountPaid: newPaid,
      remaining: newRem,
      status: newRem <= 0 ? "Paid" : "Partial",
    },
  });

  await propagatePayableToOperational(p.id);
  return pay;
}
export async function applyPaymentToPayables(
    periodId: string,
    partyName: string,
    amount: number,
    categories?: string[]
): Promise<AppliedLink[]> {
    if (!partyName || amount <= 0) return [];

    const where: Record<string, unknown> = {
        periodId,
        remaining: { gt: 0 },
    };
    if (categories && categories.length > 0) {
        where.category = { in: categories };
    }

    const list = await prisma.payable.findMany({
        where,
        orderBy: { createdAt: "asc" },
    });

    const links: AppliedLink[] = [];
    let left = amount;

    for (const p of list) {
        if (left <= 0) break;
        if (!nameMatch(p.supplierName, partyName)) continue;
        const applied = await applyToPayable(periodId, p.id, left);
        if (applied > 0) {
            links.push({ entityType: "payable", entityId: p.id, appliedAmount: applied });
            left -= applied;
        }
    }
    return links;
}

export async function applyReceiptToReceivables(
    periodId: string,
    clientName: string,
    amount: number
): Promise<AppliedLink[]> {
    if (!clientName || amount <= 0) return [];

    const list = await prisma.receivable.findMany({
        where: { periodId, remainingAmount: { gt: 0 } },
        orderBy: { createdAt: "asc" },
    });

    const links: AppliedLink[] = [];
    let left = amount;

    for (const r of list) {
        if (left <= 0) break;
        if (!nameMatch(r.clientName, clientName)) continue;

        const recv = Math.min(left, r.remainingAmount);
        const newReceived = r.amountReceived + recv;
        const newRem = Math.max(0, r.totalPackage - newReceived);

        await prisma.receivable.update({
            where: { id: r.id },
            data: {
                amountReceived: newReceived,
                remainingAmount: newRem,
                status: newRem <= 0 ? "Settled" : "Partial",
            },
        });

        links.push({ entityType: "receivable", entityId: r.id, appliedAmount: recv });
        left -= recv;
    }

    return links;
}

/** Apply a partial (or full) payment to a payroll entry. */
/** Apply a partial (or full) payment to a payroll entry. */
export async function applyPayrollPayment(
    periodId: string,
    employeeName: string,
    amount: number
): Promise<AppliedLink[]> {
    if (!employeeName || amount <= 0) return [];

    const entry = await prisma.payrollEntry.findFirst({
        where: {
            periodId,
            employeeName: { contains: employeeName.split(" ")[0] || employeeName },
            status: { in: ["Pending", "Partial"] },
        },
        orderBy: { createdAt: "asc" },
    });
    if (!entry) return [];

    const outstanding = Math.max(0, entry.netPayable - (entry.amountPaid ?? 0));
    if (outstanding <= 0) return [];

    const applied = Math.min(amount, outstanding);
    const newPaid = (entry.amountPaid ?? 0) + applied;
    const newRemaining = Math.max(0, entry.netPayable - newPaid);
    const fullyPaid = newRemaining <= 0;

    // If we're about to flip from Partial/Pending to Paid for the first time,
    // decrement the loan by this month's installment.
    const wasFullyPaidBefore = entry.status === "Paid";

    await prisma.payrollEntry.update({
        where: { id: entry.id },
        data: {
            amountPaid: newPaid,
            remaining: newRemaining,
            status: fullyPaid ? "Paid" : "Partial",
            paidDate: fullyPaid ? new Date() : entry.paidDate,
        },
    });

    // Only decrement the loan ONCE — when the row first transitions to Paid
    if (fullyPaid && !wasFullyPaidBefore && entry.employeeId && entry.loanInstallment > 0) {
        const loan = await prisma.employeeLoan.findFirst({
            where: { employeeId: entry.employeeId, remainingAmount: { gt: 0 } },
        });
        if (loan) {
            await prisma.employeeLoan.update({
                where: { id: loan.id },
                data: {
                    remainingAmount: Math.max(0, loan.remainingAmount - entry.loanInstallment),
                },
            });
        }
    }

    return [{ entityType: "payroll", entityId: entry.id, appliedAmount: applied }];
}

export async function applyCommissionPayment(
    periodId: string,
    employeeName: string,
    amount: number
): Promise<AppliedLink[]> {
    const c = await prisma.commission.findFirst({
        where: {
            periodId,
            employeeName: { contains: employeeName.split(" ")[0] || employeeName },
            status: "Accrued",
        },
    });
    if (!c) return [];

    const applied = Math.min(amount, c.commissionAmt);
    await prisma.commission.update({
        where: { id: c.id },
        data: { status: "Paid" },
    });
    return [{ entityType: "commission", entityId: c.id, appliedAmount: applied }];
}

export async function applyRefundPayment(
    periodId: string,
    clientName: string,
    amount: number
): Promise<AppliedLink[]> {
    const r = await prisma.refund.findFirst({
        where: { periodId, clientName: { contains: clientName }, status: "Pending" },
    });
    if (!r) return [];

    const applied = Math.min(amount, r.amount);
    await prisma.refund.update({
        where: { id: r.id },
        data: { status: "Paid", paidDate: new Date() },
    });
    return [{ entityType: "refund", entityId: r.id, appliedAmount: applied }];
}
/**
 * Post or update a ClientLedger row for a refund.
 * Called whenever a Refund is created or updated.
 * - Pending  → creates an "Open" ledger credit row
 * - Paid     → creates/updates the ledger row to "Paid"
 * - Deleted  → ledger row is removed (handled by caller)
 */
export async function syncRefundToClientLedger(refundId: string) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return;

    // Find or create the Client master row
    let client = refund.clientId
        ? await prisma.client.findUnique({ where: { id: refund.clientId } })
        : null;
    if (!client) {
        client = await prisma.client.findFirst({ where: { name: refund.clientName } });
    }
    if (!client) {
        client = await prisma.client.create({ data: { name: refund.clientName } });
    }

    // One ledger row per refund — match by receiptRef marker
    const marker = `REFUND:${refund.id}`;
    const existing = await prisma.clientLedger.findFirst({
        where: { clientId: client.id, receiptRef: marker },
    });

    const ledgerData = {
        clientId: client.id,
        clientName: client.name,
        tourDate: refund.paidDate ?? new Date(),
        description: refund.reason
            ? `Refund — ${refund.reason}`
            : "Refund to client",
        category: "Refund",
        subCategory: refund.tripRef || null,
        hotel: "Refund",
        debit: 0,
        credit: refund.amount,     // credit = money out to client
        status: refund.status,     // "Pending" or "Paid"
        receiptRef: marker,
        enteredBy: null,
        notes: refund.notes,
    };

    if (existing) {
        await prisma.clientLedger.update({
            where: { id: existing.id },
            data: ledgerData,
        });
    } else {
        await prisma.clientLedger.create({ data: ledgerData });
    }
}
/**
 * Find or create a Payable + HotelBooking pair by hotel name.
 * Used when a transaction names a hotel that doesn't exist yet.
 */
export async function findOrCreateHotelPayable(
    periodId: string,
    hotelName: string,
    opts?: { description?: string; tripRef?: string }
): Promise<string> {
    // Look for an existing payable for this hotel in the period
    let payable = await prisma.payable.findFirst({
        where: {
            periodId,
            category: "Hotel",
            supplierName: { equals: hotelName },
        },
        orderBy: { createdAt: "asc" },
    });

    if (payable) {
        // Make sure a HotelBooking exists and is linked
        const existingBooking = await prisma.hotelBooking.findFirst({
            where: { payableId: payable.id },
        });
        if (!existingBooking) {
            await prisma.hotelBooking.create({
                data: {
                    periodId,
                    hotelName,
                    status: "Booked",
                    payableId: payable.id,
                },
            });
        }
        return payable.id;
    }

    // Create both
    payable = await prisma.payable.create({
        data: {
            periodId,
            supplierName: hotelName,
            category: "Hotel",
            description: opts?.description ?? "Hotel booking (auto-created)",
            originalAmount: 0,
            amountPaid: 0,
            remaining: 0,
            relatedTrip: opts?.tripRef ?? null,
            status: "Open",
            notes: "Auto-created from transaction",
        },
    });

    await prisma.hotelBooking.create({
        data: {
            periodId,
            hotelName,
            tripRef: opts?.tripRef ?? null,
            status: "Booked",
            notes: "Auto-created from transaction",
            payableId: payable.id,
        },
    });

    return payable.id;
}

export async function findOrCreateTransportPayable(
    periodId: string,
    driverName: string,
    opts?: { description?: string; tripRef?: string }
): Promise<string> {
    let payable = await prisma.payable.findFirst({
        where: {
            periodId,
            category: "Transport",
            supplierName: { equals: driverName },
        },
        orderBy: { createdAt: "asc" },
    });

    if (payable) {
        const existing = await prisma.transportJob.findFirst({
            where: { payableId: payable.id },
        });
        if (!existing) {
            await prisma.transportJob.create({
                data: {
                    periodId,
                    driverName,
                    status: "Pending",
                    payableId: payable.id,
                },
            });
        }
        return payable.id;
    }

    payable = await prisma.payable.create({
        data: {
            periodId,
            supplierName: driverName,
            category: "Transport",
            description: opts?.description ?? "Transport job (auto-created)",
            originalAmount: 0,
            amountPaid: 0,
            remaining: 0,
            relatedTrip: opts?.tripRef ?? null,
            status: "Open",
            notes: "Auto-created from transaction",
        },
    });

    await prisma.transportJob.create({
        data: {
            periodId,
            driverName,
            tripRef: opts?.tripRef ?? null,
            status: "Pending",
            notes: "Auto-created from transaction",
            payableId: payable.id,
        },
    });

    return payable.id;
}

/** Fallback: just create a bare Payable when nothing else applies. */
export async function findOrCreateGenericPayable(
    periodId: string,
    supplierName: string,
    category: string,
    opts?: { description?: string; tripRef?: string }
): Promise<string> {
    let payable = await prisma.payable.findFirst({
        where: {
            periodId,
            category,
            supplierName: { equals: supplierName },
        },
        orderBy: { createdAt: "asc" },
    });
    if (payable) return payable.id;

    payable = await prisma.payable.create({
        data: {
            periodId,
            supplierName,
            category,
            description: opts?.description ?? `${category} payment (auto-created)`,
            originalAmount: 0,
            amountPaid: 0,
            remaining: 0,
            relatedTrip: opts?.tripRef ?? null,
            status: "Open",
            notes: "Auto-created from transaction",
        },
    });
    return payable.id;
}

/**
 * Apply a hotel payment: find-or-create the payable,
 * then apply the payment to it.
 */
export async function applyHotelPayment(
    periodId: string,
    hotelName: string,
    amount: number,
    opts?: { description?: string; tripRef?: string }
): Promise<AppliedLink[]> {
    if (!hotelName || amount <= 0) return [];
    const payableId = await findOrCreateHotelPayable(periodId, hotelName, opts);
    const applied = await applyToPayable(periodId, payableId, amount);
    return applied > 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}

export async function applyTransportPayment(
    periodId: string,
    driverName: string,
    amount: number,
    opts?: { description?: string; tripRef?: string }
): Promise<AppliedLink[]> {
    if (!driverName || amount <= 0) return [];
    const payableId = await findOrCreateTransportPayable(periodId, driverName, opts);
    const applied = await applyToPayable(periodId, payableId, amount);
    return applied > 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}

export async function applyGenericPayablePayment(
    periodId: string,
    supplierName: string,
    category: string,
    amount: number,
    opts?: { description?: string; tripRef?: string }
): Promise<AppliedLink[]> {
    if (!supplierName || amount <= 0) return [];
    const payableId = await findOrCreateGenericPayable(
        periodId,
        supplierName,
        category,
        opts
    );
    const applied = await applyToPayable(periodId, payableId, amount);
    return applied > 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}
/** Remove the ledger row tied to a refund (used on refund delete). */
export async function removeRefundFromClientLedger(refundId: string) {
    const marker = `REFUND:${refundId}`;
    await prisma.clientLedger.deleteMany({ where: { receiptRef: marker } });
}
export async function applyToAdvances(
    periodId: string,
    supplierName: string,
    amount: number
): Promise<AppliedLink[]> {
    const list = await prisma.supplierAdvance.findMany({
        where: { periodId, remaining: { gt: 0 } },
        orderBy: { createdAt: "asc" },
    });

    const links: AppliedLink[] = [];
    let left = amount;

    for (const a of list) {
        if (left <= 0) break;
        if (!nameMatch(a.supplierName, supplierName)) continue;

        const adj = Math.min(left, a.remaining);
        const newAdj = a.adjustedAmount + adj;
        const newRem = Math.max(0, a.amount - newAdj);

        await prisma.supplierAdvance.update({
            where: { id: a.id },
            data: { adjustedAmount: newAdj, remaining: newRem },
        });

        links.push({ entityType: "advance", entityId: a.id, appliedAmount: adj });
        left -= adj;
    }

    return links;
}