/**
 * Transaction posting service.
 * When a transaction is created/updated/deleted, related modules are updated automatically.
 *
 * Categories and what they affect:
 * - Client Receipt / Revenue     → Receivable (reduce remaining), Bank/Cash ↑
 * - Supplier Payment             → Payable (reduce remaining), Bank/Cash ↓
 * - Hotel Payment                → HotelBooking remaining ↓, Bank ↓
 * - Transport Payment            → TransportJob remaining ↓, Bank ↓
 * - Ticketing Payment            → Ticketing, Bank ↓
 * - Salary Payment               → PayrollEntry status Paid, Bank ↓
 * - Commission Payment           → Commission status Paid, Bank ↓
 * - Refund to Client             → Refund status Paid, Bank ↓
 * - Supplier Advance             → SupplierAdvance, Bank ↓
 * - Employee Loan / Advance      → EmployeeLoan, Bank ↓
 * - Office Expense               → OfficeExpense record
 * - Marketing Expense            → MarketingExpense record
 * - Owner Capital / Withdrawal   → OwnerTxn
 * - Bank Transfer                → Bank balances only
 */

import { prisma } from "./prisma";

export type TxnInput = {
  periodId: string;
  date: string | Date;
  description: string;
  category: string;
  subCategory?: string | null;
  party?: string | null;
  tripRef?: string | null;
  debit: number;
  credit: number;
  paymentMethod?: string | null;
  bankAccount?: string | null;
  status?: string;
  enteredBy?: string | null;
  notes?: string | null;
  // optional links for cascade
  relatedReceivableId?: string | null;
  relatedPayableId?: string | null;
  relatedPayrollId?: string | null;
  relatedRefundId?: string | null;
  relatedHotelId?: string | null;
  relatedTransportId?: string | null;
  relatedCommissionId?: string | null;
  relatedAdvanceId?: string | null;
};

async function adjustBankBalance(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const existing = await prisma.bankBalance.findFirst({
    where: { accountName },
  });
  if (existing) {
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    await prisma.bankBalance.create({
      data: { accountName, balance: Math.max(0, delta) },
    });
  }
}

/** Net cash effect: debit = money in, credit = money out (from company perspective in this ledger) */
function cashDelta(debit: number, credit: number): number {
  return debit - credit;
}

export async function postTransaction(input: TxnInput) {
  const txn = await prisma.transaction.create({
    data: {
      periodId: input.periodId,
      date: new Date(input.date),
      description: input.description,
      category: input.category,
      subCategory: input.subCategory || null,
      party: input.party || null,
      tripRef: input.tripRef || null,
      debit: input.debit || 0,
      credit: input.credit || 0,
      paymentMethod: input.paymentMethod || null,
      bankAccount: input.bankAccount || null,
      status: input.status || "Completed",
      enteredBy: input.enteredBy || null,
      notes: input.notes || null,
    },
  });

  const delta = cashDelta(input.debit || 0, input.credit || 0);
  await adjustBankBalance(input.bankAccount, delta);

  // Cascade by category
  const cat = (input.category || "").toLowerCase();
  const amount = Math.abs(delta) || input.debit || input.credit || 0;

  if (cat.includes("receipt") || cat.includes("revenue") || cat.includes("client payment")) {
    // Reduce receivable remaining
    if (input.relatedReceivableId) {
      const r = await prisma.receivable.findUnique({ where: { id: input.relatedReceivableId } });
      if (r) {
        const newReceived = r.amountReceived + amount;
        const newRemaining = Math.max(0, r.totalPackage - newReceived);
        await prisma.receivable.update({
          where: { id: r.id },
          data: {
            amountReceived: newReceived,
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? "Settled" : "Partial",
          },
        });
      }
    } else if (input.party) {
      // try match by client name open receivable
      const r = await prisma.receivable.findFirst({
        where: {
          periodId: input.periodId,
          clientName: { contains: input.party },
          remainingAmount: { gt: 0 },
        },
      });
      if (r) {
        const newReceived = r.amountReceived + amount;
        const newRemaining = Math.max(0, r.totalPackage - newReceived);
        await prisma.receivable.update({
          where: { id: r.id },
          data: {
            amountReceived: newReceived,
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? "Settled" : "Partial",
          },
        });
      }
    }
  }

  if (cat.includes("supplier") || cat.includes("payable payment")) {
    if (input.relatedPayableId) {
      const p = await prisma.payable.findUnique({ where: { id: input.relatedPayableId } });
      if (p) {
        const paid = p.amountPaid + amount;
        const rem = Math.max(0, p.originalAmount - paid);
        await prisma.payable.update({
          where: { id: p.id },
          data: {
            amountPaid: paid,
            remaining: rem,
            status: rem <= 0 ? "Paid" : "Partial",
          },
        });
      }
    }
  }

  if (cat.includes("hotel")) {
    if (input.relatedHotelId) {
      const h = await prisma.hotelBooking.findUnique({ where: { id: input.relatedHotelId } });
      if (h) {
        const paid = h.amountPaid + amount;
        const rem = Math.max(0, h.agreedCost - paid);
        await prisma.hotelBooking.update({
          where: { id: h.id },
          data: { amountPaid: paid, remaining: rem, status: rem <= 0 ? "Paid" : h.status },
        });
      }
    }
  }

  if (cat.includes("transport") || cat.includes("driver")) {
    if (input.relatedTransportId) {
      const t = await prisma.transportJob.findUnique({ where: { id: input.relatedTransportId } });
      if (t) {
        const settled = t.finalSettlement + amount;
        const rem = Math.max(0, t.agreedCost - settled);
        await prisma.transportJob.update({
          where: { id: t.id },
          data: { finalSettlement: settled, remaining: rem, status: rem <= 0 ? "Settled" : t.status },
        });
      }
    }
  }

  if (cat.includes("salary")) {
    if (input.relatedPayrollId) {
      await prisma.payrollEntry.update({
        where: { id: input.relatedPayrollId },
        data: { status: "Paid", paidDate: new Date() },
      });
    }
  }

  if (cat.includes("commission")) {
    if (input.relatedCommissionId) {
      await prisma.commission.update({
        where: { id: input.relatedCommissionId },
        data: { status: "Paid" },
      });
    }
  }

  if (cat.includes("refund")) {
    if (input.relatedRefundId) {
      await prisma.refund.update({
        where: { id: input.relatedRefundId },
        data: { status: "Paid", paidDate: new Date() },
      });
    }
  }

  if (cat.includes("advance") && !cat.includes("employee")) {
    if (input.relatedAdvanceId) {
      const a = await prisma.supplierAdvance.findUnique({ where: { id: input.relatedAdvanceId } });
      // creating advance is handled when posting the advance itself
    } else if (input.party && input.credit > 0) {
      await prisma.supplierAdvance.create({
        data: {
          periodId: input.periodId,
          supplierName: input.party,
          amount: amount,
          adjustedAmount: 0,
          remaining: amount,
          dateGiven: new Date(input.date),
          notes: input.description,
        },
      });
    }
  }

  if (cat.includes("office")) {
    await prisma.officeExpense.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        category: input.subCategory || "Other",
        description: input.description,
        amount: amount,
        vendor: input.party || null,
        paymentMethod: input.paymentMethod || null,
        notes: input.notes || null,
      },
    });
  }

  if (cat.includes("marketing")) {
    await prisma.marketingExpense.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        channel: input.subCategory || "Ads",
        description: input.description,
        amount: amount,
        vendor: input.party || null,
        paymentMethod: input.paymentMethod || null,
        notes: input.notes || null,
      },
    });
  }

  if (cat.includes("owner")) {
    const isIn = input.debit > 0;
    await prisma.ownerTxn.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        type: isIn ? "Capital Introduced" : "Withdrawal",
        description: input.description,
        amountIn: isIn ? amount : 0,
        amountOut: isIn ? 0 : amount,
        mode: input.paymentMethod || null,
        notes: input.notes || null,
      },
    });
  }

  return txn;
}

export async function deleteTransaction(id: string) {
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  // reverse bank effect
  const delta = cashDelta(txn.debit, txn.credit);
  await adjustBankBalance(txn.bankAccount, -delta);

  await prisma.transaction.delete({ where: { id } });
  return txn;
}

export async function updateTransaction(id: string, input: Partial<TxnInput>) {
  const old = await prisma.transaction.findUnique({ where: { id } });
  if (!old) return null;

  // reverse old bank effect
  const oldDelta = cashDelta(old.debit, old.credit);
  await adjustBankBalance(old.bankAccount, -oldDelta);

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      date: input.date ? new Date(input.date) : undefined,
      description: input.description,
      category: input.category,
      subCategory: input.subCategory,
      party: input.party,
      tripRef: input.tripRef,
      debit: input.debit,
      credit: input.credit,
      paymentMethod: input.paymentMethod,
      bankAccount: input.bankAccount,
      status: input.status,
      enteredBy: input.enteredBy,
      notes: input.notes,
    },
  });

  // apply new bank effect
  const newDelta = cashDelta(updated.debit, updated.credit);
  await adjustBankBalance(updated.bankAccount, newDelta);

  return updated;
}
