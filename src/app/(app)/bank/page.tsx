import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import {
  BankAccountsPanel,
  type BankRow,
} from "@/components/BankAccountsPanel";
import {
  BankMovementsPanel,
  type BankTxnRow,
} from "@/components/BankMovementsPanel";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  let periods = await listPeriods();
  let periodId = params.period;
  if (!periodId || periods.length === 0) {
    const now = new Date();
    const c = await getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
    periodId = c.id;
    periods = await listPeriods();
  }
  const current = periods.find((p) => p.id === periodId) ?? periods[0];

  const rows = await prisma.bankBalance.findMany({
    orderBy: { accountName: "asc" },
  });

  let bankTxns: BankTxnRow[] = [];
  try {
    const raw = await prisma.bankTxn.findMany({
      where: { periodId: current.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    bankTxns = raw as unknown as BankTxnRow[];
  } catch {
    bankTxns = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-sm text-slate-500">
            Manage account balances and bank movements (Add / Edit / Delete). Completed
            transactions update balances automatically; Pending does not.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <BankAccountsPanel
        periodId={current.id}
        initialRows={rows as unknown as BankRow[]}
      />

      <BankMovementsPanel
        periodId={current.id}
        periodLabel={current.label}
        initialRows={bankTxns}
        accounts={rows.map((r) => r.accountName)}
      />
    </div>
  );
}
