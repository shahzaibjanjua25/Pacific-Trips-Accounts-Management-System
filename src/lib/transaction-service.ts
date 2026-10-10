/**
 * Full cascade: transactions update related modules AND record
 * TransactionLink rows so payment history is permanently traceable.
 */
import { prisma } from "./prisma";
import {
  applyPaymentToPayables,
  applyReceiptToReceivables,
  applyPayrollPayment,
  applyCommissionPayment,
  applyRefundPayment,
  applyHotelPayment,
  applyTransportPayment,
  applyGenericPayablePayment,
  syncRefundToClientLedger,
  type AppliedLink,
} from "./links-service";

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
  relatedPayableId?: string | null;
  relatedReceivableId?: string | null;
  relatedHotelId?: string | null;
  relatedTransportId?: string | null;
  relatedPayrollId?: string | null;
  relatedCommissionId?: string | null;
  relatedRefundId?: string | null;
  relatedAdvanceId?: string | null;
  clientTotalPackage?: number;
  clientAmountPaid?: number;
};

/* ── BANK (normalized) ── */
async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) {
    console.log("[adjustBank] skipped", { accountName, delta });
    return;
  }
  const trimmed = accountName.trim();
  const normalized = trimmed.toLowerCase();
  const all = await prisma.bankBalance.findMany();
  console.log("[adjustBank] looking for", normalized, "in", all.map(b => b.accountName));

  const existing = all.find(
    (b) => b.accountName.trim().toLowerCase() === normalized
  );
  if (existing) {
    console.log("[adjustBank] updating", existing.accountName, existing.balance, "+", delta);
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    console.log("[adjustBank] creating new account", trimmed, delta);
    await prisma.bankBalance.create({
      data: { accountName: trimmed, balance: Math.max(0, delta) },
    });
  }
}
const cashDelta = (debit: number, credit: number) => debit - credit;

/* ── LINK RESOLUTION ── */
async function resolveLinks(input: TxnInput): Promise<AppliedLink[]> {
  const cat = (input.category || "").toLowerCase();
  const party = input.party || input.subCategory || "";
  const amount = Math.abs(input.credit || 0) || Math.abs(input.debit || 0);
  const periodId = input.periodId;

  if (input.relatedPayableId) {
    return applyPaymentToPayables(periodId, party, amount).then((links) => {
      if (!links.find((l) => l.entityId === input.relatedPayableId)) {
        links.unshift({
          entityType: "payable",
          entityId: input.relatedPayableId!,
          appliedAmount: 0,
        });
      }
      return links;
    });
  }

  if (
    cat.includes("receipt") ||
    cat.includes("client receipt") ||
    cat.includes("revenue")
  ) {
    return applyReceiptToReceivables(periodId, party, amount);
  }

  if (cat.includes("hotel")) {
    return applyHotelPayment(periodId, party, amount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("transport") || cat.includes("driver")) {
    return applyTransportPayment(periodId, party, amount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("ticketing")) {
    return applyGenericPayablePayment(periodId, party, "Ticketing", amount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("supplier") || cat.includes("payable")) {
    return applyGenericPayablePayment(periodId, party, "Other", amount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("salary") || cat.includes("payroll")) {
    return applyPayrollPayment(periodId, party, amount);
  }

  if (cat.includes("commission")) {
    return applyCommissionPayment(periodId, party, amount);
  }

  if (cat.includes("refund")) {
    const links = await applyRefundPayment(periodId, party, amount);
    if (links.length > 0) return links;

    if (input.credit > 0 && party) {
      const client = await prisma.client.findFirst({ where: { name: party } });
      const recv = await prisma.receivable.findFirst({
        where: { periodId, clientName: party, amountReceived: { gt: 0 } },
      });
      if (recv) {
        const refund = await prisma.refund.create({
          data: {
            periodId,
            clientId: client?.id ?? null,
            clientName: party,
            amount,
            reason: input.description || "Refund issued",
            status: "Paid",
            paidDate: new Date(input.date),
            tripRef: input.tripRef || null,
            notes: input.notes || "Auto-created from transaction",
          },
        });
        await syncRefundToClientLedger(refund.id);
        return [
          { entityType: "refund", entityId: refund.id, appliedAmount: amount },
        ];
      }
    }
    return links;
  }

  if (cat.includes("advance") && !cat.includes("employee")) {
    if (input.credit > 0 && party) {
      const adv = await prisma.supplierAdvance.create({
        data: {
          periodId,
          supplierName: party,
          amount,
          adjustedAmount: 0,
          remaining: amount,
          dateGiven: new Date(input.date),
          notes: input.description,
        },
      });
      return [{ entityType: "advance", entityId: adv.id, appliedAmount: amount }];
    }
  }

  return [];
}

/* ── POST ── */
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

  await adjustBank(input.bankAccount, cashDelta(input.debit || 0, input.credit || 0));

  const links = await resolveLinks(input);
  for (const link of links) {
    await prisma.transactionLink.create({
      data: {
        transactionId: txn.id,
        periodId: input.periodId,
        entityType: link.entityType,
        entityId: link.entityId,
        appliedAmount: link.appliedAmount,
      },
    });
  }

  const cat = (input.category || "").toLowerCase();
  const party = input.party || input.subCategory || "";
  const amount = Math.abs(input.credit || 0) || Math.abs(input.debit || 0);

  if (cat.includes("office") && amount > 0) {
    await prisma.officeExpense.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        category: input.subCategory || "Other",
        description: input.description,
        amount,
        vendor: party || null,
        paymentMethod: input.paymentMethod || null,
      },
    });
  }

  if (cat.includes("marketing") && amount > 0) {
    await prisma.marketingExpense.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        channel: input.subCategory || "Ads",
        description: input.description,
        amount,
        vendor: party || null,
        paymentMethod: input.paymentMethod || null,
      },
    });
  }

  if (cat.includes("owner")) {
    const isIn = (input.debit || 0) > 0;
    await prisma.ownerTxn.create({
      data: {
        periodId: input.periodId,
        date: new Date(input.date),
        type: isIn ? "Capital Introduced" : "Withdrawal",
        description: input.description,
        amountIn: isIn ? amount : 0,
        amountOut: isIn ? 0 : amount,
        mode: input.paymentMethod || null,
      },
    });
  }

  const isClientSide =
    cat.includes("receipt") ||
    cat.includes("client receipt") ||
    cat.includes("revenue");

  if (isClientSide && party) {
    let client = await prisma.client.findFirst({ where: { name: party } });
    if (!client) client = await prisma.client.create({ data: { name: party } });

    const paidNow =
      input.clientAmountPaid && input.clientAmountPaid > 0
        ? input.clientAmountPaid
        : input.debit > 0
          ? input.debit
          : 0;

    const totalPackage =
      input.clientTotalPackage && input.clientTotalPackage > 0
        ? input.clientTotalPackage
        : paidNow;

    if (totalPackage > 0) {
      let recv = await prisma.receivable.findFirst({
        where: {
          periodId: input.periodId,
          clientId: client.id,
          status: { in: ["Open", "Partial", "Overdue"] },
        },
        orderBy: { createdAt: "asc" },
      });

      if (recv) {
        const newTotal = Math.max(recv.totalPackage, totalPackage);
        const newRemaining = Math.max(0, newTotal - recv.amountReceived);
        await prisma.receivable.update({
          where: { id: recv.id },
          data: {
            totalPackage: newTotal,
            amountToReceive: newTotal,
            remainingAmount: newRemaining,
            status:
              newRemaining <= 0
                ? "Settled"
                : recv.amountReceived > 0
                  ? "Partial"
                  : "Open",
          },
        });
      } else {
        const remaining = Math.max(0, totalPackage - paidNow);
        recv = await prisma.receivable.create({
          data: {
            periodId: input.periodId,
            clientId: client.id,
            clientName: client.name,
            totalPackage,
            amountToReceive: totalPackage,
            amountReceived: paidNow,
            remainingAmount: remaining,
            status:
              remaining <= 0 ? "Settled" : paidNow > 0 ? "Partial" : "Open",
            notes: "Auto-created from transaction",
          },
        });
      }

      await prisma.clientLedger.create({
        data: {
          clientId: client.id,
          clientName: client.name,
          tourDate: new Date(input.date),
          description: input.description || "Client receipt",
          category: input.category,
          hotel: "Payment",
          debit: paidNow,
          credit: 0,
          status: "Received",
          receiptRef: input.notes || null,
          enteredBy: input.enteredBy || null,
          notes: "Auto-posted from transaction",
        },
      });

      const stillOwed = Math.max(0, totalPackage - paidNow);
      if (stillOwed > 0) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            tourDate: new Date(input.date),
            description: "Outstanding balance (advance owed by client)",
            category: "Receivables",
            hotel: "Receivables",
            debit: stillOwed,
            credit: 0,
            status: "Open",
            enteredBy: input.enteredBy || null,
            notes: "Auto-created outstanding",
          },
        });
      }
    }
  }

  return txn;
}

/* ── DELETE ── */
export async function deleteTransaction(id: string) {
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  const links = await prisma.transactionLink.findMany({
    where: { transactionId: id },
  });
  for (const link of links) await reverseLink(link);

  await adjustBank(txn.bankAccount, -cashDelta(txn.debit, txn.credit));
  await prisma.transaction.delete({ where: { id } });
  return txn;
}

async function reverseLink(link: {
  entityType: string;
  entityId: string;
  appliedAmount: number;
}) {
  const amt = link.appliedAmount;
  if (amt <= 0) return;

  if (link.entityType === "payable") {
    const p = await prisma.payable.findUnique({ where: { id: link.entityId } });
    if (!p) return;
    const newPaid = Math.max(0, p.amountPaid - amt);
    const newRem = Math.max(0, p.originalAmount - newPaid);
    await prisma.payable.update({
      where: { id: p.id },
      data: {
        amountPaid: newPaid,
        remaining: newRem,
        status: newRem <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Open",
      },
    });
  }

  if (link.entityType === "receivable") {
    const r = await prisma.receivable.findUnique({ where: { id: link.entityId } });
    if (!r) return;
    const newReceived = Math.max(0, r.amountReceived - amt);
    const newRem = Math.max(0, r.totalPackage - newReceived);
    await prisma.receivable.update({
      where: { id: r.id },
      data: {
        amountReceived: newReceived,
        remainingAmount: newRem,
        status: newRem <= 0 ? "Settled" : newReceived > 0 ? "Partial" : "Open",
      },
    });
  }

  if (link.entityType === "payroll") {
    const p = await prisma.payrollEntry.findUnique({ where: { id: link.entityId } });
    if (!p) return;
    const newPaid = Math.max(0, (p.amountPaid ?? 0) - amt);
    const newRemaining = Math.max(0, p.netPayable - newPaid);
    await prisma.payrollEntry.update({
      where: { id: p.id },
      data: {
        amountPaid: newPaid,
        remaining: newRemaining,
        status: newRemaining <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Pending",
        paidDate: newRemaining <= 0 ? p.paidDate : null,
      },
    });
  }

  if (link.entityType === "commission") {
    await prisma.commission.update({
      where: { id: link.entityId },
      data: { status: "Accrued" },
    });
  }

  if (link.entityType === "refund") {
    await prisma.refund.update({
      where: { id: link.entityId },
      data: { status: "Pending", paidDate: null },
    });
  }
}

/* ── UPDATE ── */
export async function updateTransaction(id: string, input: Partial<TxnInput>) {
  const old = await prisma.transaction.findUnique({ where: { id } });
  if (!old) return null;

  await adjustBank(old.bankAccount, -cashDelta(old.debit, old.credit));
  const links = await prisma.transactionLink.findMany({
    where: { transactionId: id },
  });
  for (const link of links) await reverseLink(link);
  await prisma.transactionLink.deleteMany({ where: { transactionId: id } });

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

  await adjustBank(updated.bankAccount, cashDelta(updated.debit, updated.credit));

  const newLinks = await resolveLinks({
    periodId: updated.periodId,
    date: updated.date.toISOString(),
    description: updated.description,
    category: updated.category,
    subCategory: updated.subCategory,
    party: updated.party,
    tripRef: updated.tripRef,
    debit: updated.debit,
    credit: updated.credit,
  });

  for (const link of newLinks) {
    await prisma.transactionLink.create({
      data: {
        transactionId: updated.id,
        periodId: updated.periodId,
        entityType: link.entityType,
        entityId: link.entityId,
        appliedAmount: link.appliedAmount,
      },
    });
  }

  return updated;
}