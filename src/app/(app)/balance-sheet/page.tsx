import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { BalanceSheetPanel, type BSLine } from "@/components/BalanceSheetPanel";

export default async function BalanceSheetPage({
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

  let rows: Awaited<ReturnType<typeof prisma.balanceSheetLine.findMany>> = [];
  let tableMissing = false;
  try {
    rows = await prisma.balanceSheetLine.findMany({
      where: { periodId: current.id },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  } catch {
    tableMissing = true;
  }

  if (tableMissing) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            The BalanceSheetLine table is not in the database yet. From the project
            root run:
            <br />
            <code className="text-xs bg-white px-1 rounded">
              npx prisma db push
            </code>{" "}
            then{" "}
            <code className="text-xs bg-white px-1 rounded">
              npx prisma generate
            </code>{" "}
            and restart the server.
          </p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    const [banks, receivables, payables, assets, liabilities, loans] =
      await Promise.all([
        prisma.bankBalance.findMany(),
        prisma.receivable.findMany({ where: { periodId: current.id } }),
        prisma.payable.findMany({ where: { periodId: current.id } }),
        prisma.asset.findMany(),
        prisma.liability.findMany({ where: { periodId: current.id } }),
        prisma.employeeLoan.findMany({ where: { remainingAmount: { gt: 0 } } }),
      ]);

    const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
    const recvTotal = receivables.reduce((s, r) => s + r.remainingAmount, 0);
    const payTotal = payables.reduce((s, p) => s + p.remaining, 0);
    const assetTotal = assets.reduce((s, a) => s + a.purchaseCost, 0);
    const liabTotal = liabilities.reduce((s, l) => s + l.outstanding, 0);
    const loanTotal = loans.reduce((s, l) => s + l.remainingAmount, 0);

    const defaults = [
      { section: "Asset", label: "Bank & Cash", amount: bankTotal, sortOrder: 10 },
      {
        section: "Asset",
        label: "Accounts Receivable",
        amount: recvTotal,
        sortOrder: 20,
      },
      {
        section: "Asset",
        label: "Employee Loans Receivable",
        amount: loanTotal,
        sortOrder: 30,
      },
      {
        section: "Asset",
        label: "Fixed Assets (at cost)",
        amount: assetTotal,
        sortOrder: 40,
      },
      {
        section: "Liability",
        label: "Accounts Payable",
        amount: payTotal,
        sortOrder: 10,
      },
      {
        section: "Liability",
        label: "Other Liabilities",
        amount: liabTotal,
        sortOrder: 20,
      },
      {
        section: "Equity",
        label: "Owner Equity / Capital",
        amount: Math.max(
          0,
          bankTotal + recvTotal + loanTotal + assetTotal - payTotal - liabTotal
        ),
        sortOrder: 10,
      },
    ];

    await prisma.balanceSheetLine.createMany({
      data: defaults.map((d) => ({ periodId: current.id, ...d })),
    });
    rows = await prisma.balanceSheetLine.findMany({
      where: { periodId: current.id },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <p className="text-sm text-slate-500">
            Assets = Liabilities + Equity. Every line can be edited, added, or
            deleted.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <BalanceSheetPanel
        periodId={current.id}
        periodLabel={current.label}
        initialRows={rows as unknown as BSLine[]}
      />
    </div>
  );
}