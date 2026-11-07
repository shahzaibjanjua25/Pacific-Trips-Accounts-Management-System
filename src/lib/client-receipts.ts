import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isClientReceiptCategory } from "./transaction-categories";

type ClientReceiptGroup = {
  name: string;
  id: string;
  entityType: "client" | "receivable";
  totalPackage: number;
  amountPaid: number;
  amountDue: number;
  fullyPaid: boolean;
  completed: boolean;
  reopened: boolean;
  signature: string;
};

export async function clientReceiptGroups(periodId: string, db: Prisma.TransactionClient = prisma) {
  const selectedPeriod = await db.period.findUnique({ where: { id: periodId } });
  if (!selectedPeriod) return new Map<string, ClientReceiptGroup>();
  const [clients, receivables, ledgers, reopenings] = await Promise.all([
    db.client.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db.receivable.findMany({
      where: { period: { OR: [
        { year: { lt: selectedPeriod.year } },
        { year: selectedPeriod.year, month: { lte: selectedPeriod.month } },
      ] } },
      include: { period: { select: { year: true, month: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.clientLedger.findMany({ orderBy: { id: "asc" } }),
    db.clientReceiptReopening.findMany({ where: { periodId } }),
  ]);
  const names = new Set([...clients.map((client) => client.name), ...receivables.map((row) => row.clientName)]);
  const groups = new Map<string, ClientReceiptGroup>();
  for (const name of names) {
    const matchingClients = clients.filter((client) => client.name === name);
    const clientIds = new Set(matchingClients.map((client) => client.id));
    const history = receivables.filter((row) => row.clientName === name || (row.clientId && clientIds.has(row.clientId)));
    const currentInvoices = history.filter((row) => row.periodId === periodId);
    const latestMonth = Math.max(...history.map((row) => row.period.year * 12 + row.period.month));
    const invoices = currentInvoices.length ? currentInvoices :
      history.filter((row) => row.period.year * 12 + row.period.month === latestMonth);
    let totalPackage = invoices.reduce((sum, row) => sum + row.totalPackage, 0);
    let amountPaid = invoices.reduce((sum, row) => sum + row.amountReceived, 0);
    let amountDue = invoices.reduce((sum, row) => sum + Math.max(0, row.remainingAmount), 0);
    const ledger = ledgers.filter((row) => clientIds.has(row.clientId));
    if (invoices.length === 0) {
      amountPaid = ledger.filter((row) => row.hotel === "Payment" || /receipt|revenue/i.test(row.category ?? ""))
        .reduce((sum, row) => sum + (row.debit || 0), 0);
      amountDue = ledger.filter((row) => row.hotel === "Receivables" || /receivable/i.test(row.category ?? ""))
        .reduce((sum, row) => sum + (row.debit || 0), 0);
      totalPackage = amountPaid + amountDue;
    }
    const signature = createHash("sha256").update(JSON.stringify(
      invoices.length ? invoices.map((row) => [row.id, row.totalPackage, row.amountReceived, row.remainingAmount])
        : ledger.map((row) => [row.id, row.debit, row.credit, row.hotel, row.category])
    )).digest("hex");
    const fullyPaid = amountPaid > 0 && amountDue <= 0;
    const reopened = fullyPaid && reopenings.some((row) => row.clientName === name && row.balanceSignature === signature);
    groups.set(name, {
      name, id: invoices[0]?.id ?? matchingClients[0].id,
      entityType: invoices.length ? "receivable" : "client",
      totalPackage, amountPaid, amountDue, fullyPaid, reopened,
      completed: fullyPaid && !reopened, signature,
    });
  }
  return groups;
}

export function withReceiptPaymentStatus<T extends {
  category: string; party?: string | null; subCategory?: string | null; status: string;
}>(transactions: T[], groups: Awaited<ReturnType<typeof clientReceiptGroups>>) {
  return transactions.map((transaction) => {
    if (!isClientReceiptCategory(transaction.category) ||
        !["completed", "paid", "settled"].includes(transaction.status.toLowerCase())) {
      return { ...transaction, receiptPaymentStatus: undefined };
    }
    const client = groups.get(transaction.party || transaction.subCategory || "");
    return {
      ...transaction,
      receiptPaymentStatus: client?.completed ? "Completed" : "Pending",
    };
  });
}
