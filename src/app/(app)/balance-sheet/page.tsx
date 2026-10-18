import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { BalanceSheetPanel, type BSLine } from "@/components/BalanceSheetPanel";
import { syncBalanceSheet } from "@/lib/balance-sheet-sync";

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

  let tableMissing = false;
  try {
    // ─── AUTO-SYNC ON PAGE LOAD ───
    await syncBalanceSheet(current.id);
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
            <code className="text-xs bg-white px-1 rounded">npx prisma db push</code>{" "}
            then{" "}
            <code className="text-xs bg-white px-1 rounded">npx prisma generate</code>{" "}
            and restart the server.
          </p>
        </div>
      </div>
    );
  }

  // Now fetch the freshly synced rows
  const rows = await prisma.balanceSheetLine.findMany({
    where: { periodId: current.id },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <p className="text-sm text-slate-500">
            Assets = Liabilities + Equity. Standard lines auto-sync with live data on page load.
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