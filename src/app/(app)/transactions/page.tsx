import { NoAccountingMonth } from "@/components/NoAccountingMonth";
import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { TransactionManager } from "./TransactionForm";
import { clientReceiptGroups, withReceiptPaymentStatus } from "@/lib/client-receipts";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const { periods, current: currentPeriod } = await resolveActivePeriod(params.period);
  if (!currentPeriod) return <NoAccountingMonth />;
  const txns = await prisma.transaction.findMany({
    where: { periodId: currentPeriod.id },
    orderBy: { date: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily Transactions / General Ledger</h1>
          <p className="text-sm text-slate-500">
            Record EVERY transaction — Category auto-updates Receivables, Payables, Bank, Expenses & more
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={currentPeriod.id} />
      </div>

      <TransactionManager
        periodId={currentPeriod.id}
        txns={withReceiptPaymentStatus(txns, await clientReceiptGroups(currentPeriod.id)) as unknown as Parameters<typeof TransactionManager>[0]["txns"]}
      />
    </div>
  );
}
