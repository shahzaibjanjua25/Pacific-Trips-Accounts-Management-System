import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { DataTable } from "@/components/DataTable";
import { formatPKR } from "@/lib/utils";
import { TransactionForm } from "./TransactionForm";


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

  const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily Transactions / General Ledger</h1>
          <p className="text-sm text-slate-500">
            Record EVERY transaction daily — No amount too small · Debit / Credit · Supporting Docs Required
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={currentPeriod.id} />
      </div>

      <TransactionForm periodId={currentPeriod.id} />

      <div className="flex gap-4 text-sm">
        <span className="bg-slate-100 px-3 py-1.5 rounded-md">
          Total Debits: <strong>{formatPKR(totalDebit)}</strong>
        </span>
        <span className="bg-slate-100 px-3 py-1.5 rounded-md">
          Total Credits: <strong>{formatPKR(totalCredit)}</strong>
        </span>
        <span
          className={`px-3 py-1.5 rounded-md ${
            totalDebit - totalCredit === 0
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          Balance Check (D−C): <strong>{formatPKR(totalDebit - totalCredit)}</strong>
        </span>
      </div>

      <DataTable
        columns={[
          { key: "date", header: "Date", render: (r) => new Date(r.date as string).toLocaleDateString("en-GB") },
          { key: "txnId", header: "Txn ID" },
          { key: "description", header: "Description" },
          { key: "category", header: "Category" },
          { key: "subCategory", header: "Sub-Category" },
          { key: "party", header: "Client/Vendor" },
          { key: "tripRef", header: "Trip Ref" },
          { key: "debit", header: "Debit", money: true },
          { key: "credit", header: "Credit", money: true },
          { key: "paymentMethod", header: "Method" },
          { key: "bankAccount", header: "Account" },
          { key: "status", header: "Status" },
          { key: "enteredBy", header: "Entered By" },
        ]}
        data={txns as unknown as Record<string, unknown>[]}
        emptyMessage="No transactions for this period. Enter the first one above."
      />
    </div>
  );
}
