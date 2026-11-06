import { NoAccountingMonth } from "@/components/NoAccountingMonth";
import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
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
  const { periods, current } = await resolveActivePeriod(params.period);
  if (!current) return <NoAccountingMonth />;

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
