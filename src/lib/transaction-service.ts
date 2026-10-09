/**
 * Full cascade: transactions update related modules by category + party name match.
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
};

async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const existing = await prisma.bankBalance.findFirst({ where: { accountName } });
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

function cashDelta(debit: number, credit: number) {
  return debit - credit;
}

function partyMatch(a: string, b: string) {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

/** Apply payment amount to reduce remaining on payables / hotels / transport by party name */
async function reducePayableLike(
  periodId: string,
  party: string,
  amount: number,
  kinds: ("payable" | "hotel" | "transport")[]
) {
  if (!party || amount <= 0) return;

  if (kinds.includes("payable")) {
    const list = await prisma.payable.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    let left = amount;
    for (const p of list) {
      if (left <= 0) break;
      if (!partyMatch(p.supplierName, party)) continue;
      const pay = Math.min(left, p.remaining);
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
      left -= pay;
    }
  }

  if (kinds.includes("hotel")) {
    const list = await prisma.hotelBooking.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    let left = amount;
    for (const h of list) {
      if (left <= 0) break;
      if (!partyMatch(h.hotelName, party)) continue;
      const pay = Math.min(left, h.remaining);
      const newPaid = h.amountPaid + pay;
      const newRem = Math.max(0, h.agreedCost - newPaid);
      await prisma.hotelBooking.update({
        where: { id: h.id },
        data: {
          amountPaid: newPaid,
          remaining: newRem,
          status: newRem <= 0 ? "Paid" : "Partial",
        },
      });
      left -= pay;
    }
  }

  if (kinds.includes("transport")) {
    const list = await prisma.transportJob.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    let left = amount;
    for (const t of list) {
      if (left <= 0) break;
      const name = t.driverName || "";
      if (!partyMatch(name, party) && !(t.vehicle && partyMatch(t.vehicle, party))) continue;
      const pay = Math.min(left, t.remaining);
      const settled = t.finalSettlement + pay;
      const newRem = Math.max(0, t.agreedCost - settled);
      await prisma.transportJob.update({
        where: { id: t.id },
        data: {
          finalSettlement: settled,
          remaining: newRem,
          status: newRem <= 0 ? "Settled" : "Partial",
        },
      });
      left -= pay;
    }
  }
}

async function reduceReceivable(periodId: string, party: string, amount: number) {
  if (!party || amount <= 0) return;
  const list = await prisma.receivable.findMany({
    where: { periodId, remainingAmount: { gt: 0 } },
  });
  let left = amount;
  for (const r of list) {
    if (left <= 0) break;
    if (!partyMatch(r.clientName, party)) continue;
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
    left -= recv;
  }
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
  await adjustBank(input.bankAccount, delta);

  const cat = (input.category || "").toLowerCase();
  const party = input.party || input.subCategory || "";
  const amount = Math.abs(input.credit || 0) || Math.abs(input.debit || 0);

  if (cat.includes("receipt") || cat.includes("revenue") || cat.includes("client payment")) {
    await reduceReceivable(input.periodId, party, amount || input.debit || 0);
  }

  if (cat.includes("hotel")) {
    await reducePayableLike(input.periodId, party, amount, ["hotel", "payable"]);
  } else if (cat.includes("transport") || cat.includes("driver")) {
    await reducePayableLike(input.periodId, party, amount, ["transport", "payable"]);
  } else if (cat.includes("supplier") || cat.includes("payable")) {
    await reducePayableLike(input.periodId, party, amount, ["payable", "hotel", "transport"]);
  }

  if (cat.includes("salary")) {
    const entry = await prisma.payrollEntry.findFirst({
      where: { periodId: input.periodId, employeeName: { contains: party.split(" ")[0] || party } },
    });
    if (entry) {
      await prisma.payrollEntry.update({
        where: { id: entry.id },
        data: { status: "Paid", paidDate: new Date() },
      });
    }
  }

  if (cat.includes("commission")) {
    const c = await prisma.commission.findFirst({
      where: { periodId: input.periodId, employeeName: { contains: party.split(" ")[0] || party } },
    });
    if (c) {
      await prisma.commission.update({ where: { id: c.id }, data: { status: "Paid" } });
    }
  }

  if (cat.includes("refund")) {
    const r = await prisma.refund.findFirst({
      where: { periodId: input.periodId, clientName: { contains: party }, status: "Pending" },
    });
    if (r) {
      await prisma.refund.update({
        where: { id: r.id },
        data: { status: "Paid", paidDate: new Date() },
      });
    }
  }

  if (cat.includes("advance") && !cat.includes("employee") && party && input.credit > 0) {
    await prisma.supplierAdvance.create({
      data: {
        periodId: input.periodId,
        supplierName: party,
        amount,
        adjustedAmount: 0,
        remaining: amount,
        dateGiven: new Date(input.date),
        notes: input.description,
      },
    });
  }

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

  return txn;
}

export async function deleteTransaction(id: string) {
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;
  await adjustBank(txn.bankAccount, -cashDelta(txn.debit, txn.credit));
  await prisma.transaction.delete({ where: { id } });
  return txn;
}

export async function updateTransaction(id: string, input: Partial<TxnInput>) {
  const old = await prisma.transaction.findUnique({ where: { id } });
  if (!old) return null;
  await adjustBank(old.bankAccount, -cashDelta(old.debit, old.credit));
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
  return updated;
}
