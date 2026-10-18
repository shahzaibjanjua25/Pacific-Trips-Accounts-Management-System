import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { getDashboardData } from "@/lib/dashboard";
import { formatPKR } from "@/lib/utils";
import Link from "next/link";

export default async function MonthlyClosingPage({
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
  const data = await getDashboardData(current.id);

  let bsAssets = 0;
  let bsLiab = 0;
  let bsEquity = 0;
  let bsReady = false;
  try {
    const bsLines = await prisma.balanceSheetLine.findMany({
      where: { periodId: current.id },
    });
    bsReady = true;
    bsAssets = bsLines
      .filter((r) => r.section === "Asset")
      .reduce((s, r) => s + r.amount, 0);
    bsLiab = bsLines
      .filter((r) => r.section === "Liability")
      .reduce((s, r) => s + r.amount, 0);
    bsEquity = bsLines
      .filter((r) => r.section === "Equity")
      .reduce((s, r) => s + r.amount, 0);
  } catch {
    bsReady = false;
  }

  const netPosition = data.ratios?.netPosition ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Monthly Closing — {current.label}</h1>
          <p className="text-sm text-slate-500">
            Revenue, Direct Costs, Operating Expenses, Profitability, Position
            &amp; Balance Sheet
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5 space-y-2 text-sm">
          <h2 className="font-semibold">Revenue</h2>
          <Row label="Trip Revenue (packages sold)" value={data.profitability.tripRevenue} />
          <Row label="Total Revenue" value={data.profitability.tripRevenue} bold />
          <h2 className="font-semibold pt-3">Direct Trip Costs</h2>
          <Row label="Direct Trip Costs" value={data.profitability.directTripCosts} />
          <Row label="Gross Profit" value={data.profitability.grossTripProfit} bold />
          <h2 className="font-semibold pt-3">Operating Expenses</h2>
          <Row label="Salaries" value={data.monthlyExpenses.salaries} />
          <Row label="Commissions" value={data.monthlyExpenses.commissionsAccrued} />
          <Row label="Marketing" value={data.monthlyExpenses.marketing} />
          <Row label="Office Expenses" value={data.monthlyExpenses.office} />
          <Row label="Total Operating" value={data.monthlyExpenses.total} bold />
          <div className="border-t pt-2">
            <Row
              label="NET PROFIT / (LOSS)"
              value={data.profitability.netProfit}
              bold
              danger={data.profitability.netProfit < 0}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5 space-y-2 text-sm">
          <h2 className="font-semibold">Financial Position</h2>
          <Row label="Bank Balance" value={data.cash.totalBank} />
          <Row label="Receivables" value={data.receivables.clientOutstanding} />
          <Row label="Payables" value={data.payables.supplierRemaining} />
          <Row label="Assets (at cost)" value={data.oneTime.assets} />
          <Row label="Net Position" value={netPosition} bold danger={netPosition < 0} />
          <h2 className="font-semibold pt-3">Summary</h2>
          <Row
            label="Gross Trip Profit"
            value={data.profitability.grossTripProfit}
          />
          <Row
            label="Net Trip Profit"
            value={data.profitability.netTripProfit}
          />
          <p className="text-xs text-slate-500 pt-4">
            Margin: {data.profitability.marginPct.toFixed(1)}% · Free Cash:{" "}
            {formatPKR(data.cash.freeCash)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-800">Balance Sheet</h2>
            <p className="text-xs text-slate-500">
              Editable statement for this month (add / edit / delete lines on the
              full page).
            </p>
          </div>
          <Link
            href={`/balance-sheet?period=${current.id}`}
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Open Balance Sheet →
          </Link>
        </div>
        {!bsReady ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Balance Sheet table is not set up yet. Run{" "}
            <code className="text-xs bg-white px-1 rounded">npx prisma db push</code>{" "}
            then open the Balance Sheet page.
          </p>
        ) : bsAssets === 0 && bsLiab === 0 && bsEquity === 0 ? (
          <p className="text-sm text-slate-500">
            No balance sheet lines yet. Open the Balance Sheet page to auto-seed
            from bank, receivables, payables and assets.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <Row label="Total Assets" value={bsAssets} bold />
            <Row label="Total Liabilities" value={bsLiab} bold />
            <Row label="Total Equity" value={bsEquity} bold />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  danger,
}: {
  label: string;
  value: number;
  bold?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-bold" : ""} ${
          danger ? "text-red-600" : ""
        }`}
      >
        {formatPKR(value)}
      </span>
    </div>
  );
}