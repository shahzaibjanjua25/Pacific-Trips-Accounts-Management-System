import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getAuthSecret } from "./auth-edge";

export async function readMonthBackup(db: Prisma.TransactionClient, periodId: string) {
  const period = await db.period.findUnique({
    where: { id: periodId },
    include: {
      transactions: true, transactionLinks: true, receivables: true, trips: true,
      payables: true, hotelBookings: true, transportJobs: true, ticketing: true,
      supplierAdvances: true, refunds: true, payrollEntries: true, commissions: true,
      officeExpenses: true, marketingExpenses: true, pettyCashTxns: true, bankTxns: true,
      cashFlowSnapshots: true, assets: true, liabilities: true, ownerTxns: true, vadets: true,
      monthlyClosings: true, salesPerformance: true, salesTarget: true, balanceSheetLines: true,
      clientReceiptReopenings: true,
    },
  });
  if (!period) return null;
  const ledgerIds = period.transactionLinks
    .filter((link) => link.entityType === "client_ledger")
    .map((link) => link.entityId);
  const refundRefs = period.refunds.map((refund) => "REFUND:" + refund.id);
  const clientLedger = await db.clientLedger.findMany({
    where: { OR: [{ id: { in: ledgerIds } }, { receiptRef: { in: refundRefs } }] },
    orderBy: { id: "asc" },
  });
  return { period, clientLedger };
}

type MonthBackup = NonNullable<Awaited<ReturnType<typeof readMonthBackup>>>;

function signBackup(snapshot: MonthBackup, userId: string, expiresAt: number) {
  const sortedPeriod = Object.fromEntries(Object.entries(snapshot.period).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value].sort((a, b) => a.id.localeCompare(b.id)) : value,
  ]));
  return createHmac("sha256", getAuthSecret())
    .update(JSON.stringify({ userId, expiresAt, period: sortedPeriod, clientLedger: snapshot.clientLedger }))
    .digest();
}

export function issueMonthBackupProof(snapshot: MonthBackup, userId: string) {
  const expiresAt = Date.now() + 30 * 60_000;
  return expiresAt + "." + signBackup(snapshot, userId, expiresAt).toString("hex");
}

export function matchesMonthBackup(snapshot: MonthBackup, userId: string, proof: string) {
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(proof);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt < Date.now()) return false;
  return timingSafeEqual(Buffer.from(match[2], "hex"), signBackup(snapshot, userId, expiresAt));
}

export async function deleteBackedUpMonth(db: Prisma.TransactionClient, backup: MonthBackup) {
  const periodId = backup.period.id;
  const where = { periodId };
  await db.clientLedger.deleteMany({ where: { id: { in: backup.clientLedger.map((row) => row.id) } } });
  await db.transactionLink.deleteMany({ where });
  await db.transaction.deleteMany({ where });
  await db.receivable.deleteMany({ where });
  await db.trip.deleteMany({ where });
  await db.hotelBooking.deleteMany({ where });
  await db.transportJob.deleteMany({ where });
  await db.payable.deleteMany({ where });
  await db.ticketing.deleteMany({ where });
  await db.supplierAdvance.deleteMany({ where });
  await db.refund.deleteMany({ where });
  await db.payrollEntry.deleteMany({ where });
  await db.commission.deleteMany({ where });
  await db.officeExpense.deleteMany({ where });
  await db.marketingExpense.deleteMany({ where });
  await db.pettyCashTxn.deleteMany({ where });
  await db.bankTxn.deleteMany({ where });
  await db.cashFlowSnapshot.deleteMany({ where });
  await db.asset.deleteMany({ where });
  await db.liability.deleteMany({ where });
  await db.ownerTxn.deleteMany({ where });
  await db.vadet.deleteMany({ where });
  await db.monthlyClosing.deleteMany({ where });
  await db.salesPerformance.deleteMany({ where });
  await db.salesTarget.deleteMany({ where });
  await db.balanceSheetLine.deleteMany({ where });
  await db.period.delete({ where: { id: periodId } });
}
