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
  removeRefundFromClientLedger,
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
  hotelAgreedCost?: number;
  clientPhone?: string | null;
  clientContact?: string | null;
  clientEmail?: string | null;
  clientNotes?: string | null;
  isNewClient?: boolean;
  salesperson?: string | null;
};

/* ------ BANK ------ */

/** Only Completed (and synonyms) move real money. Pending / Cancelled do not. */
function isCompletedStatus(status?: string | null): boolean {
  const s = (status || "Completed").toLowerCase().trim();
  return s === "completed" || s === "paid" || s === "settled";
}

function isBankTransferCategory(category?: string | null): boolean {
  return (category || "").toLowerCase().includes("bank transfer");
}

async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const trimmed = accountName.trim();
  const normalized = trimmed.toLowerCase();
  const all = await prisma.bankBalance.findMany();

  const existing = all.find(
    (b) => b.accountName.trim().toLowerCase() === normalized
  );
  if (existing) {
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    await prisma.bankBalance.create({
      data: { accountName: trimmed, balance: Math.max(0, delta) },
    });
  }
}

const cashDelta = (debit: number, credit: number) => debit - credit;

/** History row for Bank page (BankTxn table). */
async function recordBankTxn(opts: {
  periodId: string;
  accountName: string;
  date: Date;
  description?: string | null;
  deposit?: number;
  withdrawal?: number;
  transferIn?: number;
  transferOut?: number;
  notes?: string | null;
}) {
  const name = opts.accountName.trim();
  if (!name) return;
  const bal = await prisma.bankBalance.findFirst({
    where: { accountName: { equals: name, mode: "insensitive" } },
  });
  await prisma.bankTxn.create({
    data: {
      periodId: opts.periodId,
      accountName: name,
      accountId: bal?.id ?? null,
      date: opts.date,
      description: opts.description ?? null,
      deposit: opts.deposit ?? 0,
      withdrawal: opts.withdrawal ?? 0,
      transferIn: opts.transferIn ?? 0,
      transferOut: opts.transferOut ?? 0,
      balance: bal?.balance ?? 0,
      notes: opts.notes ?? null,
    },
  });
}

/**
 * Apply bank effect for a transaction.
 * - Bank Transfer: bankAccount = FROM, party = TO; amount = credit or debit
 * - Normal: debit increases balance, credit decreases (cashDelta)
 * No-op when status is Pending / Cancelled.
 */
async function applyBankEffect(input: {
  periodId: string;
  date: string | Date;
  description?: string | null;
  category?: string | null;
  party?: string | null;
  subCategory?: string | null;
  bankAccount?: string | null;
  debit: number;
  credit: number;
  status?: string | null;
  notes?: string | null;
  sign?: 1 | -1;
}) {
  if (!isCompletedStatus(input.status)) return;

  const sign = input.sign ?? 1;
  const date = new Date(input.date);

  if (isBankTransferCategory(input.category)) {
    const from = (input.bankAccount || "").trim();
    const to = (input.party || input.subCategory || "").trim();
    const amount =
      Math.abs(input.credit || 0) || Math.abs(input.debit || 0);
    if (!from || !to || amount <= 0) {
      if (sign === 1) {
        throw new Error(
          "Bank Transfer requires From account (Account), To account (Party), and amount > 0."
        );
      }
      return;
    }
    await adjustBank(from, sign * -amount);
    await adjustBank(to, sign * amount);
    if (sign === 1) {
      await recordBankTxn({
        periodId: input.periodId,
        accountName: from,
        date,
        description: input.description || `Transfer to ${to}`,
        transferOut: amount,
        notes: input.notes,
      });
      await recordBankTxn({
        periodId: input.periodId,
        accountName: to,
        date,
        description: input.description || `Transfer from ${from}`,
        transferIn: amount,
        notes: input.notes,
      });
    }
    return;
  }

  const delta = sign * cashDelta(input.debit || 0, input.credit || 0);
  await adjustBank(input.bankAccount, delta);
  if (sign === 1 && input.bankAccount && delta !== 0) {
    await recordBankTxn({
      periodId: input.periodId,
      accountName: input.bankAccount,
      date,
      description: input.description,
      deposit: delta > 0 ? delta : 0,
      withdrawal: delta < 0 ? -delta : 0,
      notes: input.notes,
    });
  }
}

/* ------ REFUND HELPERS ------ */

async function createRefundFromTransaction(opts: {
  periodId: string;
  clientName: string;
  amount: number;
  date: Date;
  description?: string | null;
  tripRef?: string | null;
  notes?: string | null;
}): Promise<AppliedLink[]> {
  const { periodId, clientName, amount } = opts;
  if (!clientName || amount <= 0) return [];

  // 1. Find or create the client master
  let client = await prisma.client.findFirst({
    where: { name: clientName },
  });
  if (!client) {
    client = await prisma.client.create({ data: { name: clientName } });
  }

  // 2. Find the receivable for this client (open OR settled) in this period
  const recv =
    (await prisma.receivable.findFirst({
      where: {
        periodId,
        OR: [{ clientId: client.id }, { clientName: client.name }],
      },
      orderBy: { createdAt: "asc" },
    })) ?? null;

  const paidBefore = recv ? Math.max(0, recv.amountReceived || 0) : 0;

  // Cap the refund at what the client actually paid us.
  const cappedRefund = Math.min(amount, paidBefore);
  if (cappedRefund <= 0) {
    return [];
  }

  // 3. Create the Refund row
  const refund = await prisma.refund.create({
    data: {
      periodId,
      clientId: client.id,
      clientName: client.name,
      amount: cappedRefund,
      reason: opts.description || "Refund issued",
      status: "Paid",
      paidDate: opts.date,
      tripRef: opts.tripRef || null,
      notes: opts.notes || "Auto-created from transaction",
    },
  });

  // 4. Reduce the receivable
  if (recv) {
    const newReceived = Math.max(0, paidBefore - cappedRefund);
    const newRemaining = Math.max(0, recv.totalPackage - newReceived);
    await prisma.receivable.update({
      where: { id: recv.id },
      data: {
        amountReceived: newReceived,
        remainingAmount: newRemaining,
        status:
          newRemaining <= 0 && newReceived > 0
            ? "Settled"
            : newReceived > 0
              ? "Partial"
              : "Open",
      },
    });
  }

  // 5. ClientLedger row (credit - money out to client)
  await syncRefundToClientLedger(refund.id);

  return [
    { entityType: "refund", entityId: refund.id, appliedAmount: cappedRefund },
  ];
}

/* ------ LINK RESOLUTION ------ */
async function resolveLinks(input: TxnInput): Promise<AppliedLink[]> {
  const cat = (input.category || "").toLowerCase();
  const party = input.party || input.subCategory || "";
  const periodId = input.periodId;

  if (input.relatedPayableId) {
    const signedPayAmount = (input.credit || 0) - (input.debit || 0);
    return applyPaymentToPayables(periodId, party, signedPayAmount).then((links) => {
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
    const debitAmount = Math.abs(input.debit || 0);
    if (debitAmount <= 0) return [];
    return applyReceiptToReceivables(periodId, party, debitAmount);
  }

  const signedPayAmount = (input.credit || 0) - (input.debit || 0);

  if (cat.includes("hotel")) {
    return applyHotelPayment(periodId, party, signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
      agreedCost: input.hotelAgreedCost,
    });
  }

  if (cat.includes("transport") || cat.includes("driver")) {
    return applyTransportPayment(periodId, party, signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("ticketing")) {
    return applyGenericPayablePayment(periodId, party, "Ticketing", signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("supplier") || cat.includes("payable")) {
    return applyGenericPayablePayment(periodId, party, "Other", signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    });
  }

  if (cat.includes("salary") || cat.includes("payroll")) {
    return applyPayrollPayment(periodId, party, signedPayAmount);
  }

  if (cat.includes("commission")) {
    return applyCommissionPayment(periodId, party, signedPayAmount);
  }

  if (cat.includes("refund")) {
    if (signedPayAmount <= 0 || !party) return [];
    return createRefundFromTransaction({
      periodId,
      clientName: party,
      amount: signedPayAmount,
      date: new Date(input.date),
      description: input.description,
      tripRef: input.tripRef ?? null,
      notes: input.notes ?? null,
    });
  }

  if (
    cat.includes("advance") &&
    !cat.includes("employee") &&
    !cat.includes("staff")
  ) {
    if (signedPayAmount > 0 && party) {
      const adv = await prisma.supplierAdvance.create({
        data: {
          periodId,
          supplierName: party,
          amount: signedPayAmount,
          adjustedAmount: 0,
          remaining: signedPayAmount,
          dateGiven: new Date(input.date),
          notes: input.description,
        },
      });
      return [{ entityType: "advance", entityId: adv.id, appliedAmount: signedPayAmount }];
    }
  }

  // Employee Loan / Staff Advance:
  //   Credit = company gives money to employee -> increase loan remaining
  //   Debit  = employee repays -> decrease loan remaining (capped at remaining)
  if (
    (cat.includes("employee loan") || cat.includes("staff advance")) &&
    party
  ) {
    const creditAmt = Math.abs(input.credit || 0);
    const debitAmt = Math.abs(input.debit || 0);

    const emp =
      (await prisma.employee.findFirst({
        where: { name: party, isActive: true },
      })) ||
      (await prisma.employee.findFirst({
        where: {
          isActive: true,
          name: { contains: party, mode: "insensitive" },
        },
      }));

    if (!emp) {
      return [];
    }

    let loan = await prisma.employeeLoan.findFirst({
      where: { employeeId: emp.id },
      orderBy: { createdAt: "desc" },
    });

    if (creditAmt > 0) {
      // Giving / increasing loan
      if (loan) {
        await prisma.employeeLoan.update({
          where: { id: loan.id },
          data: {
            originalAmount: loan.originalAmount + creditAmt,
            remainingAmount: loan.remainingAmount + creditAmt,
          },
        });
      } else {
        loan = await prisma.employeeLoan.create({
          data: {
            employeeId: emp.id,
            originalAmount: creditAmt,
            remainingAmount: creditAmt,
            monthlyInstallment: 0,
            startDate: new Date(input.date),
            notes: input.description || "Loan from transaction",
          },
        });
      }
      return [
        {
          entityType: "employee_loan",
          entityId: loan.id,
          appliedAmount: creditAmt, // positive = increased loan
        },
      ];
    }

    if (debitAmt > 0) {
      // Repayment
      if (!loan || loan.remainingAmount <= 0) {
        throw new Error(
          `No open loan for ${emp.name}. Cannot record repayment of ${debitAmt}.`
        );
      }
      if (debitAmt > loan.remainingAmount + 0.001) {
        throw new Error(
          `Repayment ${debitAmt} exceeds ${emp.name}'s remaining loan ${loan.remainingAmount}.`
        );
      }
      const newRemaining = Math.max(0, loan.remainingAmount - debitAmt);
      await prisma.employeeLoan.update({
        where: { id: loan.id },
        data: { remainingAmount: newRemaining },
      });
      return [
        {
          entityType: "employee_loan",
          entityId: loan.id,
          appliedAmount: -debitAmt, // negative = decreased loan
        },
      ];
    }
  }

  return [];
}

/* ------ POST ------ */
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

  // Pending / Cancelled do not move bank balances
  try {
    await applyBankEffect({
      periodId: input.periodId,
      date: input.date,
      description: input.description,
      category: input.category,
      party: input.party,
      subCategory: input.subCategory,
      bankAccount: input.bankAccount,
      debit: input.debit || 0,
      credit: input.credit || 0,
      status: input.status || "Completed",
      notes: input.notes,
      sign: 1,
    });
  } catch (err) {
    await prisma.transaction.delete({ where: { id: txn.id } }).catch(() => {});
    throw err;
  }

  let links;
  try {
    // Bank Transfer has no operational links
    if (isBankTransferCategory(input.category)) {
      links = [];
    } else {
      links = await resolveLinks(input);
    }
  } catch (err) {
    // Roll back txn + bank so a failed loan/payable link does not leave orphans
    await applyBankEffect({
      periodId: input.periodId,
      date: input.date,
      description: input.description,
      category: input.category,
      party: input.party,
      subCategory: input.subCategory,
      bankAccount: input.bankAccount,
      debit: input.debit || 0,
      credit: input.credit || 0,
      status: input.status || "Completed",
      notes: input.notes,
      sign: -1,
    }).catch(() => {});
    await prisma.transaction.delete({ where: { id: txn.id } }).catch(() => {});
    throw err;
  }
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
    const isNewClient = !client;
    if (!client) {
      client = await prisma.client.create({
        data: {
          name: party,
          phone: input.clientPhone || null,
          contact: input.clientContact || null,
          email: input.clientEmail || null,
          notes: input.clientNotes || null,
        },
      });
    } else if (input.isNewClient) {
      const updates: Record<string, string> = {};
      if (!client.phone && input.clientPhone) updates.phone = input.clientPhone;
      if (!client.contact && input.clientContact) updates.contact = input.clientContact;
      if (!client.email && input.clientEmail) updates.email = input.clientEmail;
      if (!client.notes && input.clientNotes) updates.notes = input.clientNotes;
      if (Object.keys(updates).length > 0) {
        client = await prisma.client.update({
          where: { id: client.id },
          data: updates,
        });
      }
    }

    const paidNow =
      input.clientAmountPaid && input.clientAmountPaid > 0
        ? input.clientAmountPaid
        : input.debit > 0
          ? input.debit
          : 0;

    const creditedNow = (input.credit || 0) > 0 ? Math.abs(input.credit) : 0;

    const explicitPackage =
      input.clientTotalPackage && input.clientTotalPackage > 0
        ? input.clientTotalPackage
        : 0;

    let recv = await prisma.receivable.findFirst({
      where: {
        periodId: input.periodId,
        OR: [{ clientId: client.id }, { clientName: client.name }],
      },
      orderBy: { createdAt: "asc" },
    });

    const openRecv = await prisma.receivable.findFirst({
      where: {
        periodId: input.periodId,
        OR: [{ clientId: client.id }, { clientName: client.name }],
        status: { in: ["Open", "Partial", "Overdue"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (openRecv) recv = openRecv;

    let isNewReceivable = false;

    if (recv) {
      const newTotal =
        explicitPackage > 0
          ? Math.max(recv.totalPackage, explicitPackage)
          : recv.totalPackage;

      const linked = await prisma.transactionLink.aggregate({
        where: {
          transactionId: txn.id,
          entityType: "receivable",
          entityId: recv.id,
        },
        _sum: { appliedAmount: true },
      });
      const alreadyLinked = (linked._sum.appliedAmount ?? 0) > 0;

      let newReceived = recv.amountReceived;
      if (paidNow > 0 && !alreadyLinked) {
        const wouldBe = newReceived + paidNow;
        if (wouldBe > newTotal && !input.isNewClient) {
          const over = wouldBe - newTotal;
          await prisma.transaction.delete({ where: { id: txn.id } }).catch(() => {});
          await applyBankEffect({
            periodId: input.periodId,
            date: input.date,
            description: input.description,
            category: input.category,
            party: input.party,
            subCategory: input.subCategory,
            bankAccount: input.bankAccount,
            debit: input.debit || 0,
            credit: input.credit || 0,
            status: input.status || "Completed",
            notes: input.notes,
            sign: -1,
          }).catch(() => {});
          throw new Error(
            `Overpayment blocked: ${party} owes ${newTotal - newReceived} ` +
              `but ${paidNow} was entered (excess ${over}).`
          );
        }
        newReceived = wouldBe;
      }
      newReceived = Math.min(newTotal, newReceived);
      if (creditedNow > 0) newReceived -= creditedNow;

      newReceived = Math.max(0, Math.min(newTotal, newReceived));
      const newRemaining = Math.max(0, newTotal - newReceived);

      await prisma.receivable.update({
        where: { id: recv.id },
        data: {
          totalPackage: newTotal,
          amountToReceive: newTotal,
          amountReceived: newReceived,
          remainingAmount: newRemaining,
          status:
            newRemaining <= 0 && newReceived > 0
              ? "Settled"
              : newReceived > 0
                ? "Partial"
                : "Open",
          clientId: client.id,
          clientName: client.name,
          // Tag the salesperson if we got one and it isn't already set
          ...(input.salesperson && !recv.salesperson
            ? { salesperson: input.salesperson }
            : {}),
        },
      });

      if (creditedNow > 0) {
        await prisma.transactionLink.create({
          data: {
            transactionId: txn.id,
            periodId: input.periodId,
            entityType: "receivable",
            entityId: recv.id,
            appliedAmount: -creditedNow,
          },
        });
      }
    } else if (explicitPackage > 0 || (isNewClient && paidNow > 0)) {
      const packageVal = explicitPackage > 0 ? explicitPackage : paidNow;
      const remaining = Math.max(0, packageVal - paidNow);
      recv = await prisma.receivable.create({
        data: {
          periodId: input.periodId,
          clientId: client.id,
          clientName: client.name,
          salesperson: input.salesperson || null,
          totalPackage: packageVal,
          amountToReceive: packageVal,
          amountReceived: paidNow,
          remainingAmount: remaining,
          tripDates: input.description || null,
          status: remaining <= 0 ? "Settled" : paidNow > 0 ? "Partial" : "Open",
          notes: "Auto-created from transaction",
        },
      });
      isNewReceivable = true;
    }

    // -- Sales attribution --
    // Attribute to the salesperson when:
    //   (a) a new Receivable was just created with a total package, OR
    //   (b) the package was raised on an existing receivable (delta > 0)
    if (input.salesperson && (explicitPackage > 0 || paidNow > 0)) {
      const attributeAmount = isNewReceivable
        ? explicitPackage > 0
          ? explicitPackage
          : paidNow
        : 0; // For existing receivables we attribute the delta elsewhere
      if (attributeAmount > 0) {
        const { attributeSaleToSalesperson } = await import("./sales-attribution");
        await attributeSaleToSalesperson({
          periodId: input.periodId,
          salesperson: input.salesperson,
          clientName: client.name,
          amount: attributeAmount,
          tourDate: input.date,
          description: input.description || `Sale to ${client.name}`,
          tripRef: input.tripRef || null,
          notes: input.notes || null,
        });
      }
    }

    if (paidNow > 0) {
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
    }

    if (creditedNow > 0) {
      await prisma.clientLedger.create({
        data: {
          clientId: client.id,
          clientName: client.name,
          tourDate: new Date(input.date),
          description: input.description || "Credit / amount returned to client",
          category: input.category,
          hotel: "Credit",
          debit: 0,
          credit: creditedNow,
          status: "Credited",
          receiptRef: input.notes || null,
          enteredBy: input.enteredBy || null,
          notes:
            "Auto-posted from transaction (money returned to client - reduces amount received)",
        },
      });
    }

    if (explicitPackage > 0 && isNewClient) {
      const stillOwed = Math.max(0, explicitPackage - paidNow);
      if (stillOwed > 0) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            tourDate: new Date(input.date),
            description: "Outstanding balance",
            category: "Receivables",
            hotel: "Receivables",
            debit: stillOwed,
            credit: 0,
            status: "Open",
            enteredBy: input.enteredBy || null,
            notes: "Auto-created outstanding from total package",
          },
        });
      }
    }
  }

  return txn;
}

/* ------ DELETE ------ */
export async function deleteTransaction(id: string) {
  const txn = await prisma.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  const links = await prisma.transactionLink.findMany({
    where: { transactionId: id },
  });
  for (const link of links) await reverseLink(link);

  await applyBankEffect({
    periodId: txn.periodId,
    date: txn.date,
    description: txn.description,
    category: txn.category,
    party: txn.party,
    subCategory: txn.subCategory,
    bankAccount: txn.bankAccount,
    debit: txn.debit,
    credit: txn.credit,
    status: txn.status,
    notes: txn.notes,
    sign: -1,
  });
  await prisma.transaction.delete({ where: { id } });
  return txn;
}

async function reverseLink(link: {
  entityType: string;
  entityId: string;
  appliedAmount: number;
}) {
  const amt = link.appliedAmount;
  if (amt === 0) return;

  if (link.entityType === "payable") {
    const p = await prisma.payable.findUnique({ where: { id: link.entityId } });
    if (!p) return;
    const newPaid = Math.max(0, Math.min(p.originalAmount, p.amountPaid - amt));
    const newRem = Math.max(0, p.originalAmount - newPaid);
    await prisma.payable.update({
      where: { id: p.id },
      data: {
        amountPaid: newPaid,
        remaining: newRem,
        status: newRem <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Open",
      },
    });
    const { propagatePayableToOperational } = await import("./links-service");
    await propagatePayableToOperational(p.id);
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
    const wasFullyPaid = p.status === "Paid";
    const newPaid = Math.max(0, (p.amountPaid ?? 0) - amt);
    const newRemaining = Math.max(0, p.netPayable - newPaid);
    const nowFullyPaid = newRemaining <= 0 && newPaid > 0;
    await prisma.payrollEntry.update({
      where: { id: p.id },
      data: {
        amountPaid: newPaid,
        remaining: newRemaining,
        status: nowFullyPaid ? "Paid" : newPaid > 0 ? "Partial" : "Pending",
        paidDate: nowFullyPaid ? p.paidDate : null,
      },
    });
    if (p.employeeId && p.loanInstallment > 0) {
      if (wasFullyPaid && !nowFullyPaid) {
        const loan = await prisma.employeeLoan.findFirst({
          where: { employeeId: p.employeeId },
        });
        if (loan) {
          await prisma.employeeLoan.update({
            where: { id: loan.id },
            data: { remainingAmount: loan.remainingAmount + p.loanInstallment },
          });
        }
      } else if (!wasFullyPaid && nowFullyPaid) {
        const loan = await prisma.employeeLoan.findFirst({
          where: { employeeId: p.employeeId, remainingAmount: { gt: 0 } },
        });
        if (loan) {
          await prisma.employeeLoan.update({
            where: { id: loan.id },
            data: {
              remainingAmount: Math.max(0, loan.remainingAmount - p.loanInstallment),
            },
          });
        }
      }
    }
  }

  if (link.entityType === "commission") {
    await prisma.commission.update({
      where: { id: link.entityId },
      data: { status: "Accrued" },
    });
  }

  if (link.entityType === "employee_loan") {
    const loan = await prisma.employeeLoan.findUnique({
      where: { id: link.entityId },
    });
    if (!loan) return;
    // appliedAmount > 0 was a credit (loan increase); reverse by decreasing
    // appliedAmount < 0 was a debit repayment; reverse by increasing remaining
    const delta = -link.appliedAmount;
    const newRemaining = Math.max(0, loan.remainingAmount + delta);
    const newOriginal =
      link.appliedAmount > 0
        ? Math.max(0, loan.originalAmount - link.appliedAmount)
        : loan.originalAmount;
    await prisma.employeeLoan.update({
      where: { id: loan.id },
      data: {
        remainingAmount: newRemaining,
        originalAmount: newOriginal,
      },
    });
  }

  if (link.entityType === "refund") {
    const refund = await prisma.refund.findUnique({
      where: { id: link.entityId },
    });
    if (!refund) return;

    const recv = await prisma.receivable.findFirst({
      where: {
        periodId: refund.periodId,
        OR: [
          { clientId: refund.clientId ?? undefined },
          { clientName: refund.clientName },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (recv) {
      const newReceived = Math.min(
        recv.totalPackage,
        recv.amountReceived + refund.amount
      );
      const newRemaining = Math.max(0, recv.totalPackage - newReceived);
      await prisma.receivable.update({
        where: { id: recv.id },
        data: {
          amountReceived: newReceived,
          remainingAmount: newRemaining,
          status:
            newRemaining <= 0 && newReceived > 0
              ? "Settled"
              : newReceived > 0
                ? "Partial"
                : "Open",
        },
      });
    }

    await removeRefundFromClientLedger(refund.id);
    await prisma.refund.delete({ where: { id: refund.id } }).catch(() => {});
  }
}

/* ------ UPDATE ------ */
export async function updateTransaction(id: string, input: Partial<TxnInput>) {
  const old = await prisma.transaction.findUnique({ where: { id } });
  if (!old) return null;

  await applyBankEffect({
    periodId: old.periodId,
    date: old.date,
    description: old.description,
    category: old.category,
    party: old.party,
    subCategory: old.subCategory,
    bankAccount: old.bankAccount,
    debit: old.debit,
    credit: old.credit,
    status: old.status,
    notes: old.notes,
    sign: -1,
  });
  const links = await prisma.transactionLink.findMany({
    where: { transactionId: id },
  });
  for (const link of links) await reverseLink(link);
  await prisma.transactionLink.deleteMany({ where: { transactionId: id } });

  await prisma.clientLedger.deleteMany({
    where: {
      clientName: old.party || undefined,
      notes: { startsWith: "Auto-posted from transaction" },
      tourDate: old.date,
    },
  });

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

  await applyBankEffect({
    periodId: updated.periodId,
    date: updated.date,
    description: updated.description,
    category: updated.category,
    party: updated.party,
    subCategory: updated.subCategory,
    bankAccount: updated.bankAccount,
    debit: updated.debit,
    credit: updated.credit,
    status: updated.status,
    notes: updated.notes,
    sign: 1,
  });

  const newLinks = isBankTransferCategory(updated.category)
    ? []
    : await resolveLinks({
        periodId: updated.periodId,
        date: updated.date.toISOString(),
        description: updated.description,
        category: updated.category,
        subCategory: updated.subCategory,
        party: updated.party,
        tripRef: updated.tripRef,
        debit: updated.debit,
        credit: updated.credit,
        hotelAgreedCost: input.hotelAgreedCost,
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

  const cat = (updated.category || "").toLowerCase();
  const isClientSide =
    cat.includes("receipt") ||
    cat.includes("client receipt") ||
    cat.includes("revenue");

  if (isClientSide && updated.party) {
    const client = await prisma.client.findFirst({
      where: { name: updated.party },
    });
    if (client) {
      const paidNow = updated.debit > 0 ? updated.debit : 0;
      const creditedNow = updated.credit > 0 ? Math.abs(updated.credit) : 0;

      const recv = await prisma.receivable.findFirst({
        where: {
          periodId: updated.periodId,
          OR: [{ clientId: client.id }, { clientName: client.name }],
          status: { in: ["Open", "Partial", "Overdue"] },
        },
        orderBy: { createdAt: "asc" },
      });

      if (recv) {
        let newReceived = recv.amountReceived;
        if (paidNow > 0) newReceived += paidNow;
        if (creditedNow > 0) newReceived -= creditedNow;
        newReceived = Math.max(0, Math.min(recv.totalPackage, newReceived));
        const newRemaining = Math.max(0, recv.totalPackage - newReceived);

        await prisma.receivable.update({
          where: { id: recv.id },
          data: {
            amountReceived: newReceived,
            remainingAmount: newRemaining,
            status:
              newRemaining <= 0 && newReceived > 0
                ? "Settled"
                : newReceived > 0
                  ? "Partial"
                  : "Open",
          },
        });

        await prisma.transactionLink.create({
          data: {
            transactionId: updated.id,
            periodId: updated.periodId,
            entityType: "receivable",
            entityId: recv.id,
            appliedAmount: paidNow - creditedNow,
          },
        });
      }

      if (paidNow > 0) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            tourDate: new Date(updated.date),
            description: updated.description || "Client receipt",
            category: updated.category,
            hotel: "Payment",
            debit: paidNow,
            credit: 0,
            status: "Received",
            enteredBy: updated.enteredBy || null,
            notes: "Auto-posted from transaction",
          },
        });
      }

      if (creditedNow > 0) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            clientName: client.name,
            tourDate: new Date(updated.date),
            description:
              updated.description || "Credit / amount returned to client",
            category: updated.category,
            hotel: "Credit",
            debit: 0,
            credit: creditedNow,
            status: "Credited",
            enteredBy: updated.enteredBy || null,
            notes:
              "Auto-posted from transaction (money returned to client - reduces amount received)",
          },
        });
      }
    }
  }

  return updated;
}
