/**
 * Links operational modules (HotelBooking, TransportJob) to the financial
 * master (Payable). Payable is the single source of truth for money owed.
 *
 * IMPORTANT: Apply functions CAP the applied amount at the outstanding balance.
 * Overpayments are blocked upstream (in TransactionForm + the API) before they
 * reach these functions. The caps here are a defensive backstop.
 */
import { prisma } from "./prisma";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PAYABLE â†” OPERATIONAL SYNC
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Recompute a payroll entry from scratch based on:
 *   basic + commission âˆ’ tax âˆ’ loan installment âˆ’ other deductions
 *
 * Commission is only applied to Sales-role employees.
 */
export async function syncPayrollForEmployee(
    periodId: string,
    employeeName: string
): Promise<void> {
    const emp = await prisma.employee.findFirst({ where: { name: employeeName } });
    if (!emp) return;

    const isSales = emp.role === "Sales";

    const isLead =
        isSales &&
        (employeeName.toLowerCase().includes("ahmad") ||
            employeeName.toLowerCase().includes("amad") ||
            employeeName.toLowerCase().includes("ammar"));

    let pay = await prisma.payrollEntry.findFirst({
        where: { periodId, employeeName },
    });

    let commissionAmt = 0;
    if (isSales) {
        const commission = await prisma.commission.findFirst({
            where: { periodId, employeeName },
        });
        commissionAmt = commission?.commissionAmt ?? 0;
    }

    const basic = isLead
        ? 0
        : emp.basicSalary || (isSales ? 40000 : 0);

    const tax = pay?.taxDeducted ?? 0;
    const other = pay?.otherDeductions ?? 0;

    const loan = await prisma.employeeLoan.findFirst({
        where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    // Cap installment at remaining loan so payroll never deducts more than owed
    let installment = loan?.monthlyInstallment ?? 0;
    if (loan && installment > loan.remainingAmount) {
        installment = loan.remainingAmount;
    }
    if (loan && installment <= 0) {
        // Fallback fixed schedules when monthlyInstallment was never set
        const n = employeeName.toLowerCase();
        if (n.includes("ahsaan")) installment = Math.min(30000, loan.remainingAmount);
        else if (n.includes("amjad") || n.includes("amad") || n.includes("ammar"))
            installment = Math.min(20000, loan.remainingAmount);
        else if (n.includes("awais")) installment = Math.min(20000, loan.remainingAmount);
    }

    const netPayable = Math.max(
        0,
        basic + commissionAmt - tax - installment - other
    );
    const amountPaid = pay?.amountPaid ?? 0;
    const remaining = Math.max(0, netPayable - amountPaid);
    const status =
        remaining <= 0 && amountPaid > 0
            ? "Paid"
            : amountPaid > 0
                ? "Partial"
                : "Pending";

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
                notes: isSales
                    ? isLead
                        ? "Team Lead â€” tiered override on team sales"
                        : "Sales â€” 40k + 2.5% of own sales"
                    : `${emp.role} â€” no commission`,
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * PAYMENT APPLICATION
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type AppliedLink = {
    entityType:
    | "payable"
    | "hotel"
    | "transport"
    | "receivable"
    | "payroll"
    | "commission"
    | "refund"
    | "advance"
    | "employee_loan";
    entityId: string;
    appliedAmount: number;
};

function nameMatch(a: string, b: string): boolean {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

/**
 * Apply a payment to a Payable.
 * CAP: applied = min(amount, orig âˆ’ amountPaid).
 */
async function applyToPayable(
    periodId: string,
    payableId: string,
    amount: number,
    agreedCost?: number
): Promise<number> {
    const p = await prisma.payable.findUnique({ where: { id: payableId } });
    if (!p) return 0;

    // Determine originalAmount:
    //   1. Use existing stored value if present
    //   2. Else use explicit agreedCost if supplied
    //   3. Else fall back to this payment amount (last resort â€” legacy behaviour)
    let orig = p.originalAmount;
    if (orig <= 0) {
        if (agreedCost && agreedCost > 0) {
            orig = agreedCost;
        } else {
            orig = amount;
        }
    } else if (agreedCost && agreedCost > 0 && agreedCost !== orig) {
        orig = agreedCost;
    }

    // CAP: never apply more than what's still owed.
    const pay = Math.min(amount, Math.max(0, orig - p.amountPaid));
    const newPaid = p.amountPaid + pay;
    const newRem = Math.max(0, orig - newPaid);

    await prisma.payable.update({
        where: { id: p.id },
        data: {
            originalAmount: orig,
            amountPaid: newPaid,
            remaining: newRem,
            status: newRem <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Open",
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

/**
 * Apply a receipt to a client's open Receivables.
 * CAP: applied = min(left, remainingAmount).
 */
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

        // CAP: never apply more than what's still owed on this row.
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

/** Resolve employee display name â†’ canonical Employee row (fuzzy). */
async function resolveEmployee(employeeName: string) {
    const all = await prisma.employee.findMany({ where: { isActive: true } });
    return (
        all.find((e) => nameMatch(e.name, employeeName)) ??
        all.find((e) => {
            const a = e.name.toLowerCase().trim().split(/\s+/);
            const b = employeeName.toLowerCase().trim().split(/\s+/);
            const lastA = a[a.length - 1];
            const lastB = b[b.length - 1];
            return !!lastA && lastA === lastB && lastA.length > 2;
        }) ??
        null
    );
}

/**
 * Apply a partial (or full) payment to a payroll entry.
 * CAP: applied = min(amount, outstanding).
 */
export async function applyPayrollPayment(
    periodId: string,
    employeeName: string,
    amount: number
): Promise<AppliedLink[]> {
    if (!employeeName || amount <= 0) return [];

    const matchEntry = (
        rows: {
            id: string;
            employeeName: string;
            netPayable: number;
            amountPaid: number | null;
            status: string;
            employeeId: string | null;
            loanInstallment: number;
            paidDate: Date | null;
        }[]
    ) =>
        rows.find((e) => nameMatch(e.employeeName, employeeName)) ??
        rows.find((e) => {
            const a = e.employeeName.toLowerCase().trim().split(/\s+/);
            const b = employeeName.toLowerCase().trim().split(/\s+/);
            const lastA = a[a.length - 1];
            const lastB = b[b.length - 1];
            return !!lastA && lastA === lastB && lastA.length > 2;
        });

    // Prefer open rows; also consider any row for this person
    let candidates = await prisma.payrollEntry.findMany({
        where: { periodId, status: { in: ["Pending", "Partial"] } },
        orderBy: { createdAt: "asc" },
    });
    let entry = matchEntry(candidates);

    // Auto-create payroll row when missing
    if (!entry) {
        const emp = await resolveEmployee(employeeName);
        const canonicalName = emp?.name ?? employeeName.trim();
        await syncPayrollForEmployee(periodId, canonicalName);

        candidates = await prisma.payrollEntry.findMany({
            where: { periodId },
            orderBy: { createdAt: "asc" },
        });
        entry = matchEntry(candidates);

        if (!entry) {
            const loan = emp
                ? await prisma.employeeLoan.findFirst({
                    where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
                })
                : null;
            const isLead =
                canonicalName.toLowerCase().includes("ahmad") ||
                canonicalName.toLowerCase().includes("amad") ||
                canonicalName.toLowerCase().includes("ammar");
            const basic = isLead ? 0 : emp?.basicSalary || 0;
            const installment = loan?.monthlyInstallment ?? 0;
            const net = Math.max(0, basic - installment);

            entry = await prisma.payrollEntry.create({
                data: {
                    periodId,
                    employeeId: emp?.id ?? null,
                    employeeName: canonicalName,
                    basicSalary: basic,
                    loanInstallment: installment,
                    netPayable: net,
                    amountPaid: 0,
                    remaining: net,
                    status: "Pending",
                    notes: "Auto-created from salary payment transaction",
                },
            });
        }
    }

    // â”€â”€ Compute applied amount â”€â”€
    const outstanding = Math.max(0, entry.netPayable - (entry.amountPaid ?? 0));

    if (amount > outstanding && outstanding > 0) {
        console.warn(
            `[applyPayrollPayment] OVERPAYMENT reached service layer: ${entry.employeeName} ` +
            `outstanding ${outstanding}, paying ${amount}, capping to ${outstanding}`
        );
    }

    let applied: number;
    let newPaid: number;
    let newRemaining: number;

    if (outstanding <= 0 && entry.netPayable <= 0) {
        // Nothing owed on paper â€” accept payment but do not exceed netPayable
        applied = amount;
        newPaid = (entry.amountPaid ?? 0) + applied;
        newRemaining = 0;
    } else if (outstanding <= 0) {
        // Fully paid already â€” nothing to apply
        return [];
    } else {
        applied = Math.min(amount, outstanding); // CAP
        newPaid = (entry.amountPaid ?? 0) + applied;
        newRemaining = Math.max(0, entry.netPayable - newPaid);
    }

    const fullyPaid = newRemaining <= 0 && newPaid > 0;
    const wasFullyPaidBefore = entry.status === "Paid";

    await prisma.payrollEntry.update({
        where: { id: entry.id },
        data: {
            amountPaid: newPaid,
            remaining: newRemaining,
            status: fullyPaid ? "Paid" : newPaid > 0 ? "Partial" : "Pending",
            paidDate: fullyPaid ? new Date() : entry.paidDate,
        },
    });

    // Decrement loan only once when row first becomes fully Paid
    if (
        fullyPaid &&
        !wasFullyPaidBefore &&
        entry.employeeId &&
        entry.loanInstallment > 0
    ) {
        const loan = await prisma.employeeLoan.findFirst({
            where: { employeeId: entry.employeeId, remainingAmount: { gt: 0 } },
        });
        if (loan) {
            await prisma.employeeLoan.update({
                where: { id: loan.id },
                data: {
                    remainingAmount: Math.max(
                        0,
                        loan.remainingAmount - entry.loanInstallment
                    ),
                },
            });
        }
    }

    return [
        { entityType: "payroll", entityId: entry.id, appliedAmount: applied },
    ];
}

/**
 * Apply a commission payment.
 * CAP: applied = min(amount, commissionAmt).
 */
export async function applyCommissionPayment(
    periodId: string,
    employeeName: string,
    amount: number
): Promise<AppliedLink[]> {
    if (!employeeName || amount <= 0) return [];

    const candidates = await prisma.commission.findMany({
        where: { periodId, status: "Accrued" },
    });
    const c =
        candidates.find((row) => nameMatch(row.employeeName, employeeName)) ??
        candidates.find((row) => {
            const a = row.employeeName.toLowerCase().trim().split(/\s+/);
            const b = employeeName.toLowerCase().trim().split(/\s+/);
            return a[a.length - 1] === b[b.length - 1] && a[a.length - 1].length > 2;
        });
    if (!c) return [];

    const applied = Math.min(amount, c.commissionAmt); // CAP

    await prisma.commission.update({
        where: { id: c.id },
        data: { status: "Paid" },
    });
    return [{ entityType: "commission", entityId: c.id, appliedAmount: applied }];
}

/**
 * Apply a refund payment.
 * CAP: applied = min(amount, refund amount).
 */
export async function applyRefundPayment(
    periodId: string,
    clientName: string,
    amount: number
): Promise<AppliedLink[]> {
    const r = await prisma.refund.findFirst({
        where: { periodId, clientName: { contains: clientName }, status: "Pending" },
    });
    if (!r) return [];

    const applied = Math.min(amount, r.amount); // CAP

    await prisma.refund.update({
        where: { id: r.id },
        data: { status: "Paid", paidDate: new Date() },
    });
    return [{ entityType: "refund", entityId: r.id, appliedAmount: applied }];
}

/**
 * Post or update a ClientLedger row for a refund.
 * Called whenever a Refund is created or updated.
 * - Pending  â†’ creates an "Open" ledger credit row
 * - Paid     â†’ creates/updates the ledger row to "Paid"
 * - Deleted  â†’ ledger row is removed (handled by caller)
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

    // One ledger row per refund - match by receiptRef marker
    const marker = `REFUND:${refund.id}`;
    const existing = await prisma.clientLedger.findFirst({
        where: { clientId: client.id, receiptRef: marker },
    });

    const ledgerData = {
        clientId: client.id,
        clientName: client.name,
        tourDate: refund.paidDate ?? new Date(),
        description: refund.reason
            ? `Refund - ${refund.reason}`
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
    opts?: { description?: string; tripRef?: string; agreedCost?: number }
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
        // Make sure a HotelBooking exists and is linked.
        // Do NOT touch originalAmount here — applyHotelPayment handles the
        // "new tranche" logic. This function only guarantees a payable exists.
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

    // Create both. If an agreed cost was supplied on the very first
    // transaction for this hotel, seed originalAmount with it.
    const initialOriginal =
        opts?.agreedCost && opts.agreedCost > 0 ? opts.agreedCost : 0;

    payable = await prisma.payable.create({
        data: {
            periodId,
            supplierName: hotelName,
            category: "Hotel",
            description: opts?.description ?? "Hotel booking (auto-created)",
            originalAmount: initialOriginal,
            amountPaid: 0,
            remaining: initialOriginal,
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
/**
 * Apply a hotel payment.
 *
 * A Hotel Payment transaction may represent a BRAND NEW booking (a fresh
 * tranche of debt) OR a payment against the existing outstanding balance.
 *
 *   agreedCost > 0  →  treat as a new tranche:
 *                        originalAmount += agreedCost
 *                        then apply `amount` as payment (capped at new remaining)
 *   agreedCost = 0  →  pure payment against existing outstanding:
 *                        apply `amount` (capped at existing remaining)
 *
 * This lets you have multiple bookings with the same hotel over time without
 * the "Limit is Rs 0" block on the second booking.
 */
export async function applyHotelPayment(
  periodId: string,
  hotelName: string,
  amount: number,
  opts?: { description?: string; tripRef?: string; agreedCost?: number }
): Promise<AppliedLink[]> {
  if (!hotelName) return [];

  const agreedCost = Number(opts?.agreedCost) || 0;
  const payment = Number(amount) || 0;
  if (payment <= 0 && agreedCost <= 0) return [];

  // Was there already a payable for this hotel? (before we create one)
  const existingBefore = await prisma.payable.findFirst({
    where: {
      periodId,
      category: "Hotel",
      supplierName: { equals: hotelName },
    },
    orderBy: { createdAt: "asc" },
  });

  const payableId = await findOrCreateHotelPayable(periodId, hotelName, opts);
  if (!payableId) return [];

  const p = await prisma.payable.findUnique({ where: { id: payableId } });
  if (!p) return [];

  // Raise the hotel's total bill only when:
  //   - agreed cost was supplied, AND
  //   - the payable already existed (new tranche on an existing account).
  //
  // If the payable is brand new, findOrCreateHotelPayable already seeded
  // originalAmount = agreedCost, so we must not add it again.
  let newOriginal = p.originalAmount;
  if (agreedCost > 0 && existingBefore) {
    newOriginal = p.originalAmount + agreedCost;
  }

  const outstanding = Math.max(0, newOriginal - p.amountPaid);
  const applied = Math.min(Math.max(0, payment), outstanding);
  const newPaid = p.amountPaid + applied;
  const newRemaining = Math.max(0, newOriginal - newPaid);

  await prisma.payable.update({
    where: { id: p.id },
    data: {
      originalAmount: newOriginal,
      amountPaid: newPaid,
      remaining: newRemaining,
      status:
        newRemaining <= 0 && newPaid > 0
          ? "Paid"
          : newPaid > 0
            ? "Partial"
            : "Open",
    },
  });

  await propagatePayableToOperational(p.id);

  return [
    {
      entityType: "payable",
      entityId: payableId,
      appliedAmount: applied,
    },
  ];
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

/**
 * Apply a payment against Supplier Advances.
 * CAP: applied = min(left, advance.remaining).
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

        // CAP: never apply more than the outstanding remaining.
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