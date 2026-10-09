import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { TransactionManager } from "./TransactionForm";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  let periods = await listPeriods();
  let periodId = params.period;

  if (!periodId || periods.length === 0) {
    const now = new Date();
    const current = await getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
    periodId = current.id;
    periods = await listPeriods();
  }

  const currentPeriod = periods.find((p) => p.id === periodId) ?? periods[0];
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
        txns={txns as unknown as Parameters<typeof TransactionManager>[0]["txns"]}
      />
    </div>
  );
}