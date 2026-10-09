/**
 * Links operational modules (HotelBooking, TransportJob) to the financial
 * master (Payable). Payable is the single source of truth for money owed.
 */
import { prisma } from "./prisma";

/* ─────────────────────────────────────────────
 * PAYABLE ← OPERATIONAL SYNC
 * ───────────────────────────────────────────── */

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

/**
 * Propagate a Payable's financial numbers back to its linked
 * Hotel / Transport operational record so statuses stay aligned.
 */
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
    entityType: "payable" | "hotel" | "transport" | "receivable" | "payroll" | "commission" | "refund" | "advance";
    entityId: string;
    appliedAmount: number;
};

function nameMatch(a: string, b: string): boolean {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

/** Reduce a Payable's remaining. Returns how much was applied. */
async function applyToPayable(
    periodId: string,
    payableId: string,
    amount: number
): Promise<number> {
    const p = await prisma.payable.findUnique({ where: { id: payableId } });
    if (!p || p.remaining <= 0) return 0;
    const pay = Math.min(amount, p.remaining);
    const newPaid = p.amountPaid + pay;
    const newRem = Math.max(0, p.originalAmount - newPaid);

    await prisma.payable.update({
        where: { id: p.id },
        data: {
            amountPaid: newPaid,
            remaining: newRem,
            status: newRem <= 0 ? "Paid" : "Partial",
        },
    });

    await propagatePayableToOperational(p.id);
    return pay;
}

/**
 * Apply a payment to all open Payables matching a party name (FIFO).
 * Optionally restrict by category e.g. ["Hotel"] or ["Transport"].
 */
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

/** Apply to client Receivables (FIFO by client name). */
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

/** Mark payroll as paid + decrement linked employee loan. */
/** Apply a partial (or full) payment to a payroll entry. */
export async function applyPayrollPayment(
    periodId: string,
    employeeName: string,
    amount: number
): Promise<AppliedLink[]> {
    if (!employeeName || amount <= 0) return [];

    // Find the most-recent unpaid/partial payroll row for this employee
    const entry = await prisma.payrollEntry.findFirst({
        where: {
            periodId,
            employeeName: { contains: employeeName.split(" ")[0] || employeeName },
            status: { in: ["Pending", "Partial"] },
        },
        orderBy: { createdAt: "asc" },
    });
    if (!entry) return [];

    const outstanding = Math.max(0, entry.netPayable - entry.amountPaid);
    if (outstanding <= 0) return [];

    const applied = Math.min(amount, outstanding);
    const newPaid = entry.amountPaid + applied;
    const newRemaining = Math.max(0, entry.netPayable - newPaid);

    await prisma.payrollEntry.update({
        where: { id: entry.id },
        data: {
            amountPaid: newPaid,
            status: newRemaining <= 0 ? "Paid" : "Partial",
            paidDate: newRemaining <= 0 ? new Date() : entry.paidDate,
        },
    });

    // Only decrement the loan when the payroll is fully paid
    if (newRemaining <= 0 && entry.employeeId && entry.loanInstallment > 0) {
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
 * Apply a supplier payment to any existing advances for that supplier.
 * (Advances are money we already gave — a later invoice reverses them.)
 */
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