import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { getDashboardData } from "@/lib/dashboard";
import { formatPKR } from "@/lib/utils";
import Link from "next/link";
import {
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Download,
  Lock,
  Unlock,
} from "lucide-react";

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
  const dash = await getDashboardData(current.id);
  const d = dash.current;
  const trends = dash.trends;

  // Balance sheet summary
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

  const balanced = Math.abs(bsAssets - (bsLiab + bsEquity)) < 0.5;

  // Month-close checklist
  const checks = [
    {
      label: "All payroll marked paid",
      ok: d.payables.salaryPayable <= 0,
      detail: d.payables.salaryPayable > 0 ? `${formatPKR(d.payables.salaryPayable)} outstanding` : "All clear",
      href: "/payroll",
    },
    {
      label: "No overdue supplier bills",
      ok: d.payables.overdue <= 0,
      detail: d.payables.overdue > 0 ? `${formatPKR(d.payables.overdue)} overdue` : "All clear",
      href: "/payables",
    },
    {
      label: "No overdue client receivables",
      ok: d.receivables.overdue <= 0,
      detail: d.receivables.overdue > 0 ? `${formatPKR(d.receivables.overdue)} overdue` : "All clear",
      href: "/receivables",
    },
    {
      label: "No pending refunds",
      ok: d.payables.refundsPending <= 0,
      detail: d.payables.refundsPending > 0 ? `${formatPKR(d.payables.refundsPending)} pending` : "All clear",
      href: "/refunds",
    },
    {
      label: "Balance sheet is balanced",
      ok: balanced,
      detail: bsReady ? (balanced ? "Assets = Liab + Equity" : "Out of balance") : "Not set up yet",
      href: "/balance-sheet",
    },
  ];
  const checksPassed = checks.filter((c) => c.ok).length;

  // P&L waterfall bars
  const revenue = d.profitability.revenue;
  const directCosts = d.profitability.directCosts;
  const grossProfit = d.profitability.grossProfit;
  const operating = d.profitability.operatingExpenses;
  const netProfit = d.profitability.netProfit;
  const maxBar = Math.max(revenue, 1);

  // Cash movement
  const bankNow = d.cash.totalBank;
  const expectedIn = d.cash.expectedCollections7d;
  const committed = d.cash.committed;
  const freeCash = d.cash.freeCash;

  // Comparison to prior months
  const lastMonth = trends[0];
  function delta(current: number, prev: number | undefined) {
    if (prev === undefined) return null;
    const diff = current - prev;
    return {
      diff,
      pct: prev !== 0 ? (diff / prev) * 100 : null,
    };
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Monthly Closing · Pacific Trips
          </p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1 flex items-center gap-3">
            <CalendarCheck className="text-emerald-600" size={32} />
            {current.label}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Revenue, Direct Costs, Operating Expenses, Profitability, Position
            &amp; Balance Sheet — all in one review.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <PeriodSelector periods={periods} currentId={current.id} />
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${current.isClosed
                ? "bg-slate-800 text-white"
                : "bg-emerald-100 text-emerald-800"
              }`}
          >
            {current.isClosed ? <Lock size={14} /> : <Unlock size={14} />}
            {current.isClosed ? "Closed" : "Open"}
          </div>
        </div>
      </div>

      {/* ═══ SIGN-OFF CHECKLIST ═══ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Month-close checklist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {checksPassed} of {checks.length} ready for close
            </p>
          </div>
          <span
            className={`text-2xl font-bold tabular-nums ${checksPassed === checks.length ? "text-emerald-600" : "text-amber-600"
              }`}
          >
            {checksPassed}/{checks.length}
          </span>
        </div>
        <div className="divide-y">
          {checks.map((c, i) => (
            <Link
              key={i}
              href={c.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
            >
              {c.ok ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <XCircle size={18} className="text-red-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{c.label}</p>
                <p className="text-xs text-slate-500">{c.detail}</p>
              </div>
              <ArrowRight size={14} className="text-slate-400 shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ P&L WATERFALL ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              P&amp;L Waterfall
            </h2>
            <span className="text-xs text-slate-500">This month</span>
          </div>
          <div className="space-y-3">
            <WaterfallBar
              label="Revenue"
              value={revenue}
              max={maxBar}
              color="bg-emerald-500"
              sign="+"
            />
            <WaterfallBar
              label="Direct Costs"
              value={directCosts}
              max={maxBar}
              color="bg-rose-500"
              sign="−"
            />
            <WaterfallBar
              label="Gross Profit"
              value={grossProfit}
              max={maxBar}
              color="bg-sky-500"
              sign="="
            />
            <WaterfallBar
              label="Operating Expenses"
              value={operating}
              max={maxBar}
              color="bg-amber-500"
              sign="−"
            />
            <div className="pt-3 border-t-2 border-slate-200">
              <WaterfallBar
                label="Net Profit / (Loss)"
                value={netProfit}
                max={maxBar}
                color={netProfit >= 0 ? "bg-emerald-600" : "bg-red-600"}
                sign="="
                bold
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <MicroStat label="Gross margin" value={`${d.profitability.grossMarginPct.toFixed(1)}%`} />
            <MicroStat label="Net margin" value={`${d.profitability.marginPct.toFixed(1)}%`} />
            <MicroStat
              label="Expense ratio"
              value={`${revenue > 0 ? ((operating / revenue) * 100).toFixed(1) : "0.0"}%`}
            />
          </div>
        </div>

        {/* ═══ CASH MOVEMENT ═══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Cash Movement
            </h2>
            <Link href="/bank" className="text-xs text-sky-700 hover:underline">
              Open Bank →
            </Link>
          </div>
          <div className="space-y-2 text-sm">
            <CashRow label="In banks now" value={bankNow} tone="emerald" />
            <CashRow label="Expected in (7 days)" value={expectedIn} tone="sky" />
            <div className="border-t border-dashed border-slate-200 my-2" />
            <CashRow label="Committed out" value={committed} tone="rose" negative />
            <div className="border-t-2 border-slate-200 pt-3 mt-3">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-slate-900">Free cash</span>
                <span
                  className={`text-2xl font-bold tabular-nums ${freeCash >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                >
                  {formatPKR(freeCash)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            Bank balance is the foundation of free cash. Expected collections
            add to it; committed payables subtract from it.
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON TABLE ═══ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Month-over-month comparison
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              This month vs. last month vs. prior trend
            </p>
          </div>
          {lastMonth && (
            <span className="text-xs text-slate-500">
              Last month: <strong>{dash.trendPeriods[0]?.label ?? "—"}</strong>            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                <th className="px-4 py-2 text-left font-semibold">Line</th>
                <th className="px-4 py-2 text-right font-semibold">This Month</th>
                <th className="px-4 py-2 text-right font-semibold">Last Month</th>
                <th className="px-4 py-2 text-right font-semibold">Change</th>
                <th className="px-4 py-2 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="Revenue"
                current={revenue}
                prev={lastMonth?.profitability.revenue}
                delta={delta(revenue, lastMonth?.profitability.revenue)}
                positiveIsGood
              />
              <ComparisonRow
                label="Direct trip costs"
                current={directCosts}
                prev={lastMonth?.profitability.directCosts}
                delta={delta(directCosts, lastMonth?.profitability.directCosts)}
                positiveIsGood={false}
              />
              <ComparisonRow
                label="Gross profit"
                current={grossProfit}
                prev={lastMonth?.profitability.grossProfit}
                delta={delta(grossProfit, lastMonth?.profitability.grossProfit)}
                positiveIsGood
                bold
              />
              <ComparisonRow
                label="Operating expenses"
                current={operating}
                prev={lastMonth?.profitability.operatingExpenses}
                delta={delta(operating, lastMonth?.profitability.operatingExpenses)}
                positiveIsGood={false}
              />
              <ComparisonRow
                label="Net profit / (loss)"
                current={netProfit}
                prev={lastMonth?.profitability.netProfit}
                delta={delta(netProfit, lastMonth?.profitability.netProfit)}
                positiveIsGood
                bold
              />
              <ComparisonRow
                label="Cash in banks"
                current={bankNow}
                prev={lastMonth?.cash.totalBank}
                delta={delta(bankNow, lastMonth?.cash.totalBank)}
                positiveIsGood
              />
              <ComparisonRow
                label="Clients owe us"
                current={d.receivables.clientOutstanding}
                prev={lastMonth?.receivables.clientOutstanding}
                delta={delta(
                  d.receivables.clientOutstanding,
                  lastMonth?.receivables.clientOutstanding
                )}
                positiveIsGood={false}
              />
              <ComparisonRow
                label="We owe suppliers"
                current={d.payables.supplierRemaining}
                prev={lastMonth?.payables.supplierRemaining}
                delta={delta(
                  d.payables.supplierRemaining,
                  lastMonth?.payables.supplierRemaining
                )}
                positiveIsGood={false}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══ BALANCE SHEET SUMMARY ═══ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Balance Sheet Summary
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Full editable statement on the Balance Sheet page
            </p>
          </div>
          <Link
            href={`/balance-sheet?period=${current.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Open Balance Sheet <ArrowRight size={14} />
          </Link>
        </div>
        {!bsReady ? (
          <div className="p-5 text-sm text-amber-800 bg-amber-50 m-4 rounded-lg border border-amber-200">
            Balance Sheet table not set up yet. Open the Balance Sheet page to
            auto-seed.
          </div>
        ) : bsAssets === 0 && bsLiab === 0 && bsEquity === 0 ? (
          <div className="p-5 text-sm text-slate-500">
            No balance sheet lines yet. Open the Balance Sheet page to sync from
            live data.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
            <SummaryCard
              label="Total Assets"
              value={bsAssets}
              tone="sky"
            />
            <SummaryCard
              label="Total Liabilities"
              value={bsLiab}
              tone="rose"
            />
            <SummaryCard
              label="Total Equity"
              value={bsEquity}
              tone="violet"
            />
          </div>
        )}
        {bsReady && (
          <div className="px-5 pb-5">
            <div
              className={`text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${balanced
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-900 border border-amber-200"
                }`}
            >
              {balanced ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {balanced
                ? "Balanced: Assets = Liabilities + Equity"
                : `Out of balance by ${formatPKR(bsAssets - bsLiab - bsEquity)}`}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── Components ─────────────────────────────────────────────────── */

function WaterfallBar({
  label,
  value,
  max,
  color,
  sign,
  bold,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sign: string;
  bold?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className={`${bold ? "font-bold text-slate-900" : "text-slate-600"}`}>
          <span className="inline-block w-4 text-center text-slate-400">{sign}</span>
          {label}
        </span>
        <span
          className={`tabular-nums ${bold ? "font-bold text-base text-slate-900" : "font-medium text-slate-800"
            }`}
        >
          {formatPKR(value)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CashRow({
  label,
  value,
  tone,
  negative,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "rose";
  negative?: boolean;
}) {
  const color = {
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    rose: "text-rose-700",
  }[tone];
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums font-medium ${color}`}>
        {negative ? "−" : ""}
        {formatPKR(value)}
      </span>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-slate-50 rounded-lg">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
}

function ComparisonRow({
  label,
  current,
  prev,
  delta,
  positiveIsGood,
  bold,
}: {
  label: string;
  current: number;
  prev?: number;
  delta: { diff: number; pct: number | null } | null;
  positiveIsGood: boolean;
  bold?: boolean;
}) {
  const isGood = delta
    ? positiveIsGood
      ? delta.diff >= 0
      : delta.diff <= 0
    : null;
  const trendColor =
    isGood === null
      ? "text-slate-400"
      : isGood
        ? "text-emerald-600"
        : "text-red-600";
  return (
    <tr className={`border-b border-slate-100 ${bold ? "bg-slate-50/50" : ""}`}>
      <td className={`px-4 py-2 ${bold ? "font-bold text-slate-900" : "text-slate-700"}`}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${bold ? "font-bold" : "font-medium"}`}>
        {formatPKR(current)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
        {prev !== undefined ? formatPKR(prev) : "—"}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums font-medium ${trendColor}`}>
        {delta ? (
          <span className="inline-flex items-center gap-0.5 justify-end">
            {delta.diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {formatPKR(Math.abs(delta.diff))}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${trendColor}`}>
        {delta?.pct != null ? `${delta.pct.toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "rose" | "violet";
}) {
  const map = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${map}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums mt-1">{formatPKR(value)}</p>
    </div>
  );
}