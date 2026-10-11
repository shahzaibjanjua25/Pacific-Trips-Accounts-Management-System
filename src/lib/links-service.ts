/**
 * Links operational modules (HotelBooking, TransportJob) to the financial
 * master (Payable). Payable is the single source of truth for money owed.
 *
 * SIGN CONVENTION FOR PAYABLES (payer's perspective):
 *   positive amount = we paid the supplier     (amountPaid increases)
 *   negative amount = supplier refunded us     (amountPaid decreases)
 */
import { prisma } from "./prisma";

/* ─────────────────────────────────────────────
 * PAYABLE ← OPERATIONAL SYNC
 * ───────────────────────────────────────────── */
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

    const pay = await prisma.payrollEntry.findFirst({
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
    const installment = loan?.monthlyInstallment ?? 0;

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
                        ? "Team Lead — tiered override on team sales"
                        : "Sales — 40k + 2.5% of own sales"
                    : `${emp.role} — no commission`,
            },
        });
    }
}

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
 * PAYMENT APPLICATION (signed amounts)
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

/**
 * Apply a signed amount to a Payable.
 *   signedAmount > 0 → we paid the supplier (amountPaid increases)
 *   signedAmount < 0 → supplier refunded us (amountPaid decreases)
 *
 * originalAmount resolution order:
 *   1. Existing stored value if > 0
 *   2. Explicit agreedCost if supplied
 *   3. |signedAmount| — legacy last resort
 *
 * Returns the signed delta actually applied.
 */
async function applyToPayable(
    periodId: string,
    payableId: string,
    signedAmount: number,
    agreedCost?: number
): Promise<number> {
    const p = await prisma.payable.findUnique({ where: { id: payableId } });
    if (!p) return 0;
    if (signedAmount === 0) return 0;

    let orig = p.originalAmount;
    if (orig <= 0) {
        if (agreedCost && agreedCost > 0) {
            orig = agreedCost;
        } else {
            orig = Math.abs(signedAmount);
            console.warn(
                `[applyToPayable] No agreedCost for payable ${payableId} (${p.supplierName}). ` +
                `Falling back to |payment| (${Math.abs(signedAmount)}) as originalAmount.`
            );
        }
    } else if (agreedCost && agreedCost > 0 && agreedCost !== orig) {
        orig = agreedCost;
    }

    let newPaid = p.amountPaid + signedAmount;
    if (newPaid < 0) newPaid = 0;
    if (newPaid > orig) newPaid = orig;
    const newRem = Math.max(0, orig - newPaid);
    const delta = newPaid - p.amountPaid;

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
    return delta;
}

export async function applyPaymentToPayables(
    periodId: string,
    partyName: string,
    signedAmount: number,
    categories?: string[]
): Promise<AppliedLink[]> {
    if (!partyName || signedAmount === 0) return [];

    const where: Record<string, unknown> = { periodId };
    if (categories && categories.length > 0) where.category = { in: categories };

    const list = await prisma.payable.findMany({
        where,
        orderBy: { createdAt: "asc" },
    });

    const links: AppliedLink[] = [];
    let left = signedAmount;

    for (const p of list) {
        if (left === 0) break;
        if (!nameMatch(p.supplierName, partyName)) continue;
        const applied = await applyToPayable(periodId, p.id, left);
        if (applied !== 0) {
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

export async function applyPayrollPayment(
    periodId: string,
    employeeName: string,
    signedAmount: number
): Promise<AppliedLink[]> {
    if (!employeeName || signedAmount === 0) return [];

    const matchEntry = (
        rows: { id: string; employeeName: string; netPayable: number; amountPaid: number | null; status: string; employeeId: string | null; loanInstallment: number; paidDate: Date | null }[]
    ) =>
        rows.find((e) => nameMatch(e.employeeName, employeeName)) ??
        rows.find((e) => {
            const a = e.employeeName.toLowerCase().trim().split(/\s+/);
            const b = employeeName.toLowerCase().trim().split(/\s+/);
            const lastA = a[a.length - 1];
            const lastB = b[b.length - 1];
            return !!lastA && lastA === lastB && lastA.length > 2;
        });

    let candidates = await prisma.payrollEntry.findMany({
        where: { periodId, status: { in: ["Pending", "Partial"] } },
        orderBy: { createdAt: "asc" },
    });
    let entry = matchEntry(candidates);

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

    // Signed application
    const before = entry.amountPaid ?? 0;
    let newPaid = before + signedAmount;
    if (newPaid < 0) newPaid = 0;
    if (newPaid > entry.netPayable) newPaid = entry.netPayable;
    const applied = newPaid - before;
    const newRemaining = Math.max(0, entry.netPayable - newPaid);
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

    // Loan decrement on transition to fully Paid, or increment on reversal from Paid
    if (entry.employeeId && entry.loanInstallment > 0) {
        if (fullyPaid && !wasFullyPaidBefore) {
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
        } else if (!fullyPaid && wasFullyPaidBefore) {
            const loan = await prisma.employeeLoan.findFirst({
                where: { employeeId: entry.employeeId },
            });
            if (loan) {
                await prisma.employeeLoan.update({
                    where: { id: loan.id },
                    data: { remainingAmount: loan.remainingAmount + entry.loanInstallment },
                });
            }
        }
    }

    return applied !== 0
        ? [{ entityType: "payroll", entityId: entry.id, appliedAmount: applied }]
        : [];
}

export async function applyCommissionPayment(
    periodId: string,
    employeeName: string,
    signedAmount: number
): Promise<AppliedLink[]> {
    if (!employeeName || signedAmount === 0) return [];
    if (signedAmount < 0) return [];   // reversal of commission payment not supported here

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

    const applied = Math.min(signedAmount, c.commissionAmt);
    if (applied <= 0) return [];
    await prisma.commission.update({
        where: { id: c.id },
        data: { status: "Paid" },
    });
    return [{ entityType: "commission", entityId: c.id, appliedAmount: applied }];
}

export async function applyRefundPayment(
    periodId: string,
    clientName: string,
    signedAmount: number
): Promise<AppliedLink[]> {
    if (signedAmount <= 0) return [];
    const r = await prisma.refund.findFirst({
        where: { periodId, clientName: { contains: clientName }, status: "Pending" },
    });
    if (!r) return [];

    const applied = Math.min(signedAmount, r.amount);
    await prisma.refund.update({
        where: { id: r.id },
        data: { status: "Paid", paidDate: new Date() },
    });
    return [{ entityType: "refund", entityId: r.id, appliedAmount: applied }];
}

export async function syncRefundToClientLedger(refundId: string) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return;

    let client = refund.clientId
        ? await prisma.client.findUnique({ where: { id: refund.clientId } })
        : null;
    if (!client) {
        client = await prisma.client.findFirst({ where: { name: refund.clientName } });
    }
    if (!client) {
        client = await prisma.client.create({ data: { name: refund.clientName } });
    }

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
        credit: refund.amount,
        status: refund.status,
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

export async function findOrCreateHotelPayable(
    periodId: string,
    hotelName: string,
    opts?: { description?: string; tripRef?: string; agreedCost?: number }
): Promise<string> {
    let payable = await prisma.payable.findFirst({
        where: {
            periodId,
            category: "Hotel",
            supplierName: { equals: hotelName },
        },
        orderBy: { createdAt: "asc" },
    });

    if (payable) {
        if (
            opts?.agreedCost &&
            opts.agreedCost > 0 &&
            payable.originalAmount !== opts.agreedCost
        ) {
            await prisma.payable.update({
                where: { id: payable.id },
                data: { originalAmount: opts.agreedCost },
            });
        }

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

export async function applyHotelPayment(
    periodId: string,
    hotelName: string,
    signedAmount: number,
    opts?: { description?: string; tripRef?: string; agreedCost?: number }
): Promise<AppliedLink[]> {
    if (!hotelName || signedAmount === 0) return [];
    const payableId = await findOrCreateHotelPayable(periodId, hotelName, opts);
    const applied = await applyToPayable(periodId, payableId, signedAmount, opts?.agreedCost);
    return applied !== 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}

export async function applyTransportPayment(
    periodId: string,
    driverName: string,
    signedAmount: number,
    opts?: { description?: string; tripRef?: string }
): Promise<AppliedLink[]> {
    if (!driverName || signedAmount === 0) return [];
    const payableId = await findOrCreateTransportPayable(periodId, driverName, opts);
    const applied = await applyToPayable(periodId, payableId, signedAmount);
    return applied !== 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}

export async function applyGenericPayablePayment(
    periodId: string,
    supplierName: string,
    category: string,
    signedAmount: number,
    opts?: { description?: string; tripRef?: string }
): Promise<AppliedLink[]> {
    if (!supplierName || signedAmount === 0) return [];
    const payableId = await findOrCreateGenericPayable(
        periodId,
        supplierName,
        category,
        opts
    );
    const applied = await applyToPayable(periodId, payableId, signedAmount);
    return applied !== 0
        ? [{ entityType: "payable", entityId: payableId, appliedAmount: applied }]
        : [{ entityType: "payable", entityId: payableId, appliedAmount: 0 }];
}

export async function removeRefundFromClientLedger(refundId: string) {
    const marker = `REFUND:${refundId}`;
    await prisma.clientLedger.deleteMany({ where: { receiptRef: marker } });
}

export async function applyToAdvances(
    periodId: string,
    supplierName: string,
    signedAmount: number
): Promise<AppliedLink[]> {
    if (signedAmount <= 0) return [];
    const list = await prisma.supplierAdvance.findMany({
        where: { periodId, remaining: { gt: 0 } },
        orderBy: { createdAt: "asc" },
    });

    const links: AppliedLink[] = [];
    let left = signedAmount;

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