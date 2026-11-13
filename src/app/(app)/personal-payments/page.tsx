import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
import { isPersonalPaymentCategory } from "@/lib/transaction-categories";
import { isCompletedStatus } from "@/lib/transaction-service";
import { formatPKR } from "@/lib/utils";
import { NoAccountingMonth } from "@/components/NoAccountingMonth";
import { PeriodSelector } from "@/components/PeriodSelector";
import { TransactionManager } from "../transactions/TransactionForm";

export default async function PersonalPaymentsPage({ searchParams }: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const { periods, current } = await resolveActivePeriod(period);
  if (!current) return <NoAccountingMonth />;
  const transactions = await prisma.transaction.findMany({
    where: { periodId: current.id }, orderBy: { date: "desc" },
  });
  const payments = transactions.filter((row) => isPersonalPaymentCategory(row.category));
  const completed = payments.filter((row) => isCompletedStatus(row.status));
  const spent = completed.reduce((sum, row) => sum + row.credit, 0);
  const returned = completed.reduce((sum, row) => sum + row.debit, 0);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">Personal/Family Payments</h1>
        <p className="mt-1 text-sm text-slate-500">Your personal and family spending for {current.label}.</p>
      </div>
      <PeriodSelector periods={periods} currentId={current.id} />
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        ["Total spent", formatPKR(spent)],
        ["Net spending", formatPKR(spent - returned)],
        ["Completed payments", String(completed.length)],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      </div>)}
    </div>
    <p className="text-sm text-slate-500">Totals include completed transactions. Previous Personal Expense entries are included.</p>
    <TransactionManager periodId={current.id} initialCategory="Personal/Family Payments"
      txns={payments as unknown as Parameters<typeof TransactionManager>[0]["txns"]} />
  </div>;
}
