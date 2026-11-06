import type { Prisma, Transaction } from "@prisma/client";
import { prisma } from "./prisma";
import {
  applyPaymentToPayables,
  applyPayrollPayment,
  applyCommissionPayment,
  applyHotelPayment,
  applyTransportPayment,
  applyGenericPayablePayment,
  syncRefundToClientLedger,
  removeRefundFromClientLedger,
  createAssetFromTransaction,
  deleteAssetFromTransaction,
  type AppliedLink,
} from "./links-service";


/** Dated audit line for EmployeeLoan.notes when balance changes. */
function appendLoanBalanceNote(
  existingNotes: string | null | undefined,
  from: number,
  to: number,
  source: string
): string {
  const delta = to - from;
  if (Math.abs(delta) < 0.001) return existingNotes || "";
  const today = new Date().toISOString().slice(0, 10);
  const sign = delta < 0 ? "−" : "+";
  const line = `[${today}] ${source}: balance ${sign}${Math.abs(delta).toLocaleString("en-PK")} (${from.toLocaleString("en-PK")} → ${to.toLocaleString("en-PK")})`;
  const prev = (existingNotes || "").trim();
  return prev ? `${prev}\n${line}` : line;
}

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
  transportAgreedCost?: number;
  clientPhone?: string | null;
  clientContact?: string | null;
  clientEmail?: string | null;
  clientNotes?: string | null;
  isNewClient?: boolean;
  salesperson?: string | null;
  assetCategory?: string | null;
};

/* ------ CATEGORY HELPERS ------ */

function isDrawingCategory(category?: string | null): boolean {
  const c = (category || "").toLowerCase().trim();
  return (
    c.includes("owner drawing") ||
    c.includes("personal expense") ||
    c === "drawing" ||
    c.includes("owner personal")
  );
}

function isAssetCategory(category?: string | null): boolean {
  return (category || "").toLowerCase().includes("asset");
}

/* ------ BANK ------ */

/** Only Completed (and synonyms) move real money. Pending / Cancelled do not. */
export function isCompletedStatus(status?: string | null): boolean {
  const s = (status || "Completed").toLowerCase().trim();
  return s === "completed" || s === "paid" || s === "settled";
}

function isBankTransferCategory(category?: string | null): boolean {
  return (category || "").toLowerCase().includes("bank transfer");
}

async function adjustBank(accountName: string | null | undefined, delta: number, db: Prisma.TransactionClient) {
  if (!accountName || delta === 0) return;
  const trimmed = accountName.trim();
  const normalized = trimmed.toLowerCase();
  const all = await db.bankBalance.findMany();

  const existing = all.find(
    (b) => b.accountName.trim().toLowerCase() === normalized
  );
  if (existing) {
    await db.bankBalance.update({
      where: { id: existing.id },
      data: { balance: { increment: delta } },
    });
  } else {
    await db.bankBalance.create({
      data: { accountName: trimmed, balance: delta },
    });
  }
}

const cashDelta = (debit: number, credit: number) => debit - credit;

/** History row for Bank page (BankTxn table). */
async function recordBankTxn(opts: {
  transactionId?: string;
  legacyCreatedAt?: Date;
  periodId: string;
  accountName: string;
  date: Date;
  description?: string | null;
  deposit?: number;
  withdrawal?: number;
  transferIn?: number;
  transferOut?: number;
  notes?: string | null;
}, db: Prisma.TransactionClient) {
  const name = opts.accountName.trim();
  if (!name) return;

  const movement = {
    periodId: opts.periodId,
    accountName: name,
    date: opts.date,
    description: opts.description ?? null,
    deposit: opts.deposit ?? 0,
    withdrawal: opts.withdrawal ?? 0,
    transferIn: opts.transferIn ?? 0,
    transferOut: opts.transferOut ?? 0,
    notes: opts.notes ?? null,
  };
  if (opts.legacyCreatedAt) {
    const candidates = await db.bankTxn.findMany({
      where: {
        ...movement,
        createdAt: { gte: opts.legacyCreatedAt, lte: new Date(opts.legacyCreatedAt.getTime() + 5_000) },
        reconciled: false, statementRef: null,
      },
      select: { id: true },
      take: 2,
    });
    if (candidates.length === 1) {
      await db.bankTxn.delete({ where: { id: candidates[0].id } });
    }
    return;
  }

  const bal = await db.bankBalance.findFirst({
    where: { accountName: { equals: name, mode: "insensitive" } },
  });
  const bankAccount = await db.bankAccount.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  const row = await db.bankTxn.create({
    data: {
      ...movement,
      accountId: bankAccount?.id ?? null,
      balance: bal?.balance ?? 0,
    },
  });
  if (opts.transactionId) {
    await trackGeneratedRow(db, { id: opts.transactionId, periodId: opts.periodId }, "bank_txn", row.id);
  }
}

/**
 * Apply bank effect for a transaction.
 */
async function applyBankEffect(input: {
  transactionId?: string;
  legacyCreatedAt?: Date;
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
}, db: Prisma.TransactionClient) {
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
    await adjustBank(from, sign * -amount, db);
    await adjustBank(to, sign * amount, db);
    if (sign === 1 || input.legacyCreatedAt) {
      await recordBankTxn({
        transactionId: input.transactionId,
        legacyCreatedAt: input.legacyCreatedAt,
        periodId: input.periodId,
        accountName: from,
        date,
        description: input.description || `Transfer to ${to}`,
        transferOut: amount,
        notes: input.notes,
      }, db);
      await recordBankTxn({
        transactionId: input.transactionId,
        legacyCreatedAt: input.legacyCreatedAt,
        periodId: input.periodId,
        accountName: to,
        date,
        description: input.description || `Transfer from ${from}`,
        transferIn: amount,
        notes: input.notes,
      }, db);
    }
    return;
  }

  const delta = sign * cashDelta(input.debit || 0, input.credit || 0);
  await adjustBank(input.bankAccount, delta, db);
  if ((sign === 1 || input.legacyCreatedAt) && input.bankAccount && delta !== 0) {
    const postedDelta = delta * sign;
    await recordBankTxn({
      transactionId: input.transactionId,
      legacyCreatedAt: input.legacyCreatedAt,
      periodId: input.periodId,
      accountName: input.bankAccount,
      date,
      description: input.description,
      deposit: Math.max(0, postedDelta),
      withdrawal: Math.max(0, -postedDelta),
      notes: input.notes,
    }, db);
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
}, db: Prisma.TransactionClient): Promise<AppliedLink[]> {
  const { periodId, clientName, amount } = opts;
  if (!clientName || amount <= 0) return [];

  const client = await db.client.findFirst({
    where: { name: clientName },
  });
  const recv = client
    ? await db.receivable.findFirst({
      where: {
        periodId,
        OR: [{ clientId: client.id }, { clientName: client.name }],
      },
      orderBy: { createdAt: "asc" },
    })
    : null;

  const paidBefore = recv ? Math.max(0, recv.amountReceived || 0) : 0;

  if (!client || !recv || amount > paidBefore) {
    throw new Error(`Overpayment blocked: ${clientName} has ${paidBefore} PKR available to refund.`);
  }

  const refund = await db.refund.create({
    data: {
      periodId,
      clientId: client.id,
      clientName: client.name,
      amount,
      reason: opts.description || "Refund issued",
      status: "Paid",
      paidDate: opts.date,
      tripRef: opts.tripRef || null,
      notes: opts.notes || "Auto-created from transaction",
    },
  });

  const newReceived = paidBefore - amount;
  const newRemaining = Math.max(0, recv.totalPackage - newReceived);
  await db.receivable.update({
    where: { id: recv.id },
    data: {
      amountReceived: newReceived,
      remainingAmount: newRemaining,
      status: newRemaining <= 0 ? "Settled" : newReceived > 0 ? "Partial" : "Open",
    },
  });

  await syncRefundToClientLedger(refund.id, db);

  return [
    { entityType: "refund", entityId: refund.id, appliedAmount: 0 },
    { entityType: "receivable", entityId: recv.id, appliedAmount: -amount },
  ];
}

/* ------ LINK RESOLUTION ------ */
async function resolveLinks(input: TxnInput, db: Prisma.TransactionClient): Promise<AppliedLink[]> {
  const cat = (input.category || "").toLowerCase();
  const party = input.party || input.subCategory || "";
  const periodId = input.periodId;

  // Pure cash-out categories â€” no operational linkage, no ceiling.
  if (isDrawingCategory(input.category) || isAssetCategory(input.category)) {
    return [];
  }

  if (input.relatedPayableId) {
    const signedPayAmount = (input.credit || 0) - (input.debit || 0);
    return applyPaymentToPayables(periodId, party, signedPayAmount, undefined, db).then((links) => {
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
    return [];
  }

  const signedPayAmount = (input.credit || 0) - (input.debit || 0);

  if (cat.includes("hotel")) {
    return applyHotelPayment(periodId, party, signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
      agreedCost: input.hotelAgreedCost,
    }, db);
  }

  if (cat.includes("transport") || cat.includes("driver")) {
    return applyTransportPayment(periodId, party, signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
      agreedCost: input.transportAgreedCost,
    }, db);
  }

  if (cat.includes("supplier") || cat.includes("payable")) {
    return applyGenericPayablePayment(periodId, party, "Other", signedPayAmount, {
      description: input.description,
      tripRef: input.tripRef ?? undefined,
    }, db);
  }

  if (cat.includes("salary") || cat.includes("payroll")) {
    return applyPayrollPayment(periodId, party, signedPayAmount, db);
  }

  if (cat.includes("commission")) {
    return applyCommissionPayment(periodId, party, signedPayAmount, db);
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
    }, db);
  }

  if (
    (cat.includes("employee loan") || cat.includes("staff advance")) &&
    party
  ) {
    const creditAmt = Math.abs(input.credit || 0);
    const debitAmt = Math.abs(input.debit || 0);

    const emp =
      (await db.employee.findFirst({
        where: { name: party, isActive: true },
      })) ||
      (await db.employee.findFirst({
        where: {
          isActive: true,
          name: { contains: party, mode: "insensitive" },
        },
      }));

    if (!emp) {
      return [];
    }

    let loan = await db.employeeLoan.findFirst({
      where: { employeeId: emp.id },
      orderBy: { createdAt: "desc" },
    });

    if (creditAmt > 0) {
      if (loan) {
        const newRem = loan.remainingAmount + creditAmt;
        await db.employeeLoan.update({
          where: { id: loan.id },
          data: {
            originalAmount: loan.originalAmount + creditAmt,
            remainingAmount: newRem,
            notes: appendLoanBalanceNote(
              loan.notes,
              loan.remainingAmount,
              newRem,
              "Loan advance (transaction)"
            ),
          },
        });
      } else {
        loan = await db.employeeLoan.create({
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
          appliedAmount: creditAmt,
        },
      ];
    }

    if (debitAmt > 0) {
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
      await db.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remainingAmount: newRemaining,
          notes: appendLoanBalanceNote(
            loan.notes,
            loan.remainingAmount,
            newRemaining,
            "Loan repayment (transaction)"
          ),
        },
      });
      return [
        {
          entityType: "employee_loan",
          entityId: loan.id,
          appliedAmount: -debitAmt,
        },
      ];
    }
  }

  return [];
}

/* ------ POST ------ */
export function runTransactionMutation<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: "Serializable", timeout: 30_000 });
}

export async function postTransaction(input: TxnInput, db?: Prisma.TransactionClient): Promise<Transaction> {
  if (!db) return runTransactionMutation((tx) => postTransaction(input, tx));
  const txn = await db.transaction.create({
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

  await applyTransactionEffects(txn, input, db);
  return txn;
}

async function trackGeneratedRow(
  db: Prisma.TransactionClient,
  txn: Pick<Transaction, "id" | "periodId">,
  entityType: string,
  entityId: string,
) {
  await db.transactionLink.create({
    data: { transactionId: txn.id, periodId: txn.periodId, entityType, entityId, appliedAmount: 0 },
  });
}

async function applyTransactionEffects(txn: Transaction, input: TxnInput, db: Prisma.TransactionClient) {
  if (!isCompletedStatus(txn.status)) return;
  await applyBankEffect({
    transactionId: txn.id,
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
  }, db);

  let links: AppliedLink[] = [];
  if (isBankTransferCategory(input.category)) {
    links = [];
  } else if (isAssetCategory(input.category)) {
    // Asset purchase: create an Asset row and link it for later reversal.
    const amount =
      Math.abs(input.credit || 0) || Math.abs(input.debit || 0);
    if (amount > 0) {
      const assetId = await createAssetFromTransaction({
        periodId: input.periodId,
        date: new Date(input.date),
        description: input.description,
        category: input.assetCategory || input.subCategory || "Other",
        cost: amount,
        notes: input.notes || null,
      }, db);
      if (assetId) {
        links = [
          {
            entityType: "asset",
            entityId: assetId,
            appliedAmount: amount,
          },
        ];
      }
    }
  } else if (isDrawingCategory(input.category)) {
    // Drawing / personal: cash moves, no other record anywhere.
    links = [];
  } else {
    links = await resolveLinks(input, db);
  }
  for (const link of links) {
    await db.transactionLink.create({
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
    const generated = await db.officeExpense.create({
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
    await trackGeneratedRow(db, txn, "office_expense", generated.id);
  }

  if (cat.includes("marketing") && amount > 0) {
    const generated = await db.marketingExpense.create({
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
    await trackGeneratedRow(db, txn, "marketing_expense", generated.id);
  }

  const isClientSide =
    cat.includes("receipt") ||
    cat.includes("client receipt") ||
    cat.includes("revenue");

  if (isClientSide && party) {
    let client = await db.client.findFirst({ where: { name: party } });
    const isNewClient = !client;
    if (!client) {
      client = await db.client.create({
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
        client = await db.client.update({
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

    let recv = await db.receivable.findFirst({
      where: {
        periodId: input.periodId,
        OR: [{ clientId: client.id }, { clientName: client.name }],
      },
      orderBy: { createdAt: "asc" },
    });

    const openRecv = await db.receivable.findFirst({
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

      let newReceived = recv.amountReceived;
      if (paidNow > 0) {
        const wouldBe = newReceived + paidNow;
        if (wouldBe > newTotal) {
          const over = wouldBe - newTotal;
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

      await db.receivable.update({
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
          ...(input.salesperson && !recv.salesperson
            ? { salesperson: input.salesperson }
            : {}),
        },
      });

      const appliedAmount = newReceived - recv.amountReceived;
      if (appliedAmount !== 0) {
        await db.transactionLink.create({
          data: {
            transactionId: txn.id,
            periodId: input.periodId,
            entityType: "receivable",
            entityId: recv.id,
            appliedAmount,
          },
        });
      }
    } else if (explicitPackage > 0 || (isNewClient && paidNow > 0)) {
      const packageVal = explicitPackage > 0 ? explicitPackage : paidNow;
      if (paidNow > packageVal) {
        throw new Error(`Overpayment blocked: ${party} owes ${packageVal} PKR.`);
      }
      const remaining = Math.max(0, packageVal - paidNow);
      recv = await db.receivable.create({
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
      if (recv.amountReceived > 0) {
        await db.transactionLink.create({
          data: {
            transactionId: txn.id, periodId: txn.periodId, entityType: "receivable",
            entityId: recv.id, appliedAmount: recv.amountReceived,
          },
        });
      }
    }

    if (input.salesperson && (explicitPackage > 0 || paidNow > 0)) {
      const attributeAmount = isNewReceivable
        ? explicitPackage > 0
          ? explicitPackage
          : paidNow
        : 0;
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
        }, db);
      }
    }

    if (paidNow > 0) {
      const generated = await db.clientLedger.create({
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
      await trackGeneratedRow(db, txn, "client_ledger", generated.id);
    }

    if (creditedNow > 0) {
      const generated = await db.clientLedger.create({
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
      await trackGeneratedRow(db, txn, "client_ledger", generated.id);
    }

    if (explicitPackage > 0 && isNewClient) {
      const stillOwed = Math.max(0, explicitPackage - paidNow);
      if (stillOwed > 0) {
        const generated = await db.clientLedger.create({
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
        await trackGeneratedRow(db, txn, "client_ledger", generated.id);
      }
    }
  }

}

/* ------ DELETE ------ */
export async function deleteTransaction(id: string, db?: Prisma.TransactionClient): Promise<Transaction | null> {
  if (!db) return runTransactionMutation((tx) => deleteTransaction(id, tx));
  const txn = await db.transaction.findUnique({ where: { id } });
  if (!txn) return null;

  await reverseTransactionEffects(txn, db);
  await db.transaction.delete({ where: { id } });
  return txn;
}

async function reverseLink(link: {
  entityType: string;
  entityId: string;
  appliedAmount: number;
}, db: Prisma.TransactionClient) {
  const amt = link.appliedAmount;
  if (link.entityType === "client_ledger") {
    await db.clientLedger.deleteMany({ where: { id: link.entityId } });
    return;
  }
  if (link.entityType === "office_expense") {
    await db.officeExpense.deleteMany({ where: { id: link.entityId } });
    return;
  }
  if (link.entityType === "marketing_expense") {
    await db.marketingExpense.deleteMany({ where: { id: link.entityId } });
    return;
  }
  if (link.entityType === "bank_txn") {
    await db.bankTxn.deleteMany({ where: { id: link.entityId } });
    return;
  }
  if (amt === 0 && link.entityType !== "refund") return;

  if (link.entityType === "payable") {
    const p = await db.payable.findUnique({ where: { id: link.entityId } });
    if (!p) return;
    const newPaid = Math.max(0, Math.min(p.originalAmount, p.amountPaid - amt));
    const newRem = Math.max(0, p.originalAmount - newPaid);
    await db.payable.update({
      where: { id: p.id },
      data: {
        amountPaid: newPaid,
        remaining: newRem,
        status: newRem <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Open",
      },
    });
    const { propagatePayableToOperational } = await import("./links-service");
    await propagatePayableToOperational(p.id, db);
  }

  if (link.entityType === "receivable") {
    const r = await db.receivable.findUnique({ where: { id: link.entityId } });
    if (!r) return;
    const newReceived = Math.max(0, Math.min(r.totalPackage, r.amountReceived - amt));
    const newRem = Math.max(0, r.totalPackage - newReceived);
    await db.receivable.update({
      where: { id: r.id },
      data: {
        amountReceived: newReceived,
        remainingAmount: newRem,
        status: newRem <= 0 ? "Settled" : newReceived > 0 ? "Partial" : "Open",
      },
    });
  }

  if (link.entityType === "payroll") {
    const p = await db.payrollEntry.findUnique({ where: { id: link.entityId } });
    if (!p) return;
    const wasFullyPaid = p.status === "Paid";
    const newPaid = Math.max(0, (p.amountPaid ?? 0) - amt);
    const newRemaining = Math.max(0, p.netPayable - newPaid);
    const nowFullyPaid = newRemaining <= 0 && newPaid > 0;
    await db.payrollEntry.update({
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
        const loan = await db.employeeLoan.findFirst({
          where: { employeeId: p.employeeId },
        });
        if (loan) {
          await db.employeeLoan.update({
            where: { id: loan.id },
            data: { remainingAmount: loan.remainingAmount + p.loanInstallment },
          });
        }
      } else if (!wasFullyPaid && nowFullyPaid) {
        const loan = await db.employeeLoan.findFirst({
          where: { employeeId: p.employeeId, remainingAmount: { gt: 0 } },
        });
        if (loan) {
          await db.employeeLoan.update({
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
    await db.commission.update({
      where: { id: link.entityId },
      data: { status: "Accrued" },
    });
  }

  if (link.entityType === "employee_loan") {
    const loan = await db.employeeLoan.findUnique({
      where: { id: link.entityId },
    });
    if (!loan) return;
    const delta = -link.appliedAmount;
    const newRemaining = Math.max(0, loan.remainingAmount + delta);
    const newOriginal =
      link.appliedAmount > 0
        ? Math.max(0, loan.originalAmount - link.appliedAmount)
        : loan.originalAmount;
    await db.employeeLoan.update({
      where: { id: loan.id },
      data: {
        remainingAmount: newRemaining,
        originalAmount: newOriginal,
      },
    });
  }

  if (link.entityType === "asset") {
    await deleteAssetFromTransaction(link.entityId, db);
  }

  if (link.entityType === "refund") {
    const refund = await db.refund.findUnique({
      where: { id: link.entityId },
    });
    if (!refund) return;

    const recv = amt === 0 ? null : await db.receivable.findFirst({
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
      await db.receivable.update({
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

    await removeRefundFromClientLedger(refund.id, db);
    await db.refund.delete({ where: { id: refund.id } });
  }
}

/* ------ UPDATE ------ */
async function reverseTransactionEffects(txn: Transaction, db: Prisma.TransactionClient) {
  const links = await db.transactionLink.findMany({
    where: { transactionId: txn.id },
  });
  if (!links.some((link) => link.entityType === "client_ledger") && txn.party &&
      /receipt|revenue/i.test(txn.category)) {
    // Older receipts lacked row IDs. Only remove a uniquely identifiable generated row.
    const candidates = await db.clientLedger.findMany({
      where: {
        clientName: txn.party, tourDate: txn.date, category: txn.category,
        description: txn.description, debit: txn.debit, credit: txn.credit,
        notes: { startsWith: "Auto-posted from transaction" },
      },
      select: { id: true },
      take: 2,
    });
    if (candidates.length === 1) {
      await db.clientLedger.delete({ where: { id: candidates[0].id } });
    }
  }
  for (const link of links) await reverseLink(link, db);

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
    legacyCreatedAt: links.some((link) => link.entityType === "bank_txn") ? undefined : txn.createdAt,
  }, db);
  await db.transactionLink.deleteMany({ where: { transactionId: txn.id } });
}

export async function updateTransaction(
  id: string,
  input: Partial<TxnInput>,
  options: {
    expectedUpdatedAt?: string;
    validate?: (next: TxnInput, db: Prisma.TransactionClient) => Promise<void>;
  } = {},
  db?: Prisma.TransactionClient,
): Promise<Transaction | null> {
  if (!db) return runTransactionMutation((tx) => updateTransaction(id, input, options, tx));
  const old = await db.transaction.findUnique({ where: { id } });
  if (!old) return null;
  if (options.expectedUpdatedAt && old.updatedAt.toISOString() !== options.expectedUpdatedAt) {
    throw new StaleTransactionError();
  }

  await reverseTransactionEffects(old, db);
  const updated = await db.transaction.update({
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

  const next = { ...input, ...updated, date: updated.date.toISOString() };
  await options.validate?.(next, db);
  await applyTransactionEffects(updated, next, db);
  return updated;
}

export class StaleTransactionError extends Error {}
