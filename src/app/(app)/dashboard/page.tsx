import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { getDashboardData, trendSeries } from "@/lib/dashboard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";
import { ExportMonthButton } from "@/components/ExportMonthButton";
import Link from "next/link";
import {
  Wallet,
  Users,
  CreditCard,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Banknote,
  Plane,
  Building2,
  Briefcase,
  Receipt,
  Sparkles,
} from "lucide-react";

export default async function DashboardPage({
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
  const dash = await getDashboardData(currentPeriod.id);
  const d = dash.current;
  const trends = dash.trends;

  // ── Derived KPIs ──────────────────────────────────────────────────────
  const moneyInBanks = d.cash.totalAvailable;
  const clientsOweUs = d.receivables.clientOutstanding;
  const weOweOthers = d.payables.totalWeOwe;
  const profit = d.profitability.netProfit;
  const freeCash = d.cash.freeCash;
  const netPosition = d.ratios.netPosition;
  const margin = d.profitability.marginPct;
  const grossMargin = d.profitability.grossMarginPct;

  // ── Trend series ──────────────────────────────────────────────────────
  const cashSeries = trendSeries(moneyInBanks, trends, (t) => t.cash.totalAvailable);
  const profitSeries = trendSeries(profit, trends, (t) => t.profitability.netProfit);
  const owedSeries = trendSeries(clientsOweUs, trends, (t) => t.receivables.clientOutstanding);
  const oweSeries = trendSeries(weOweOthers, trends, (t) => t.payables.totalWeOwe);

  // ── Health score (0-100) ──────────────────────────────────────────────
  let healthScore = 50;
  if (profit > 0) healthScore += 20;
  else if (profit < 0) healthScore -= 25;
  if (freeCash > 0) healthScore += 15;
  else healthScore -= 20;
  if (netPosition > 0) healthScore += 15;
  else healthScore -= 15;
  const health = Math.max(0, Math.min(100, healthScore));

  const healthRing =
    health >= 75
      ? { stroke: "#10b981", text: "Healthy", tone: "text-emerald-600" }
      : health >= 50
        ? { stroke: "#f59e0b", text: "Watch", tone: "text-amber-600" }
        : { stroke: "#ef4444", text: "At Risk", tone: "text-red-600" };

  // ── Attention alerts ──────────────────────────────────────────────────
  type Alert = {
    severity: "red" | "amber" | "info";
    icon: React.ReactNode;
    title: string;
    body: string;
    href: string;
    cta: string;
  };
  const alerts: Alert[] = [];

  if (d.receivables.overdue > 0) {
    alerts.push({
      severity: "red",
      icon: <AlertTriangle size={18} />,
      title: `${formatPKR(d.receivables.overdue)} is overdue from clients`,
      body: "Follow up on overdue receivables to keep cash flowing.",
      href: "/receivables",
      cta: "View receivables",
    });
  }
  if (d.payables.overdue > 0) {
    alerts.push({
      severity: "red",
      icon: <AlertTriangle size={18} />,
      title: `${formatPKR(d.payables.overdue)} of supplier bills are overdue`,
      body: "Settle overdue hotels and transport to avoid disruption.",
      href: "/payables",
      cta: "View payables",
    });
  }
  if (d.payables.refundsPending > 0) {
    alerts.push({
      severity: "amber",
      icon: <Receipt size={18} />,
      title: `${formatPKR(d.payables.refundsPending)} in refunds pending`,
      body: "Clients are waiting on refunds. Keep them satisfied.",
      href: "/refunds",
      cta: "View refunds",
    });
  }
  if (d.payables.salaryPayable > 0) {
    alerts.push({
      severity: "amber",
      icon: <Users size={18} />,
      title: `${formatPKR(d.payables.salaryPayable)} in salaries unpaid`,
      body: "Mark payroll as paid once disbursed to keep reports clean.",
      href: "/payroll",
      cta: "View payroll",
    });
  }
  if (profit < 0) {
    alerts.push({
      severity: "red",
      icon: <TrendingDown size={18} />,
      title: `This month is in loss (${formatPKR(profit)})`,
      body: "Revenue is below direct + operating costs. Review pricing and expenses.",
      href: "/monthly-closing",
      cta: "See month review",
    });
  }

  const topClients = d._raw.receivables.slice(0, 5);
  const topPayables = d._raw.payables.slice(0, 5);

  // ── Sales by salesperson ──────────────────────────────────────────────
  const salesByRep = new Map<string, number>();
  for (const r of d._raw.receivables) {
    if (!r.salesperson) continue;
    salesByRep.set(
      r.salesperson,
      (salesByRep.get(r.salesperson) ?? 0) + r.totalPackage
    );
  }
  const topReps = [...salesByRep.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Money Map values (bank → +receivables → −payables → free) ─────────
  const mapIn = moneyInBanks + clientsOweUs;
  const mapOut = weOweOthers;

  // ── Trend arrow helper ────────────────────────────────────────────────
  function trendArrow(series: number[]) {
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const delta = last - prev;
    if (Math.abs(delta) < 1) return null;
    const up = delta > 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${
          up ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {formatPKR(Math.abs(delta))}
      </span>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pacific Trips · {currentPeriod.label} · All figures in PKR
          </p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">
            Command Center
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            The single page you check every morning. Live snapshot of cash,
            profit, obligations, and what needs your attention right now.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <PeriodSelector periods={periods} currentId={currentPeriod.id} allowCreate />
          <ExportMonthButton periodId={currentPeriod.id} periodLabel={currentPeriod.label} />
        </div>
      </div>

      {/* ═══ HERO BAND ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Health ring */}
        <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white flex items-center gap-4 shadow-lg">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={healthRing.stroke}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(health / 100) * 264} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold leading-none">{health}</span>
              <span className="text-[9px] uppercase tracking-wider opacity-70 mt-1">/ 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider opacity-70">Financial Health</p>
            <p className="text-xl font-bold mt-0.5">{healthRing.text}</p>
            <p className="text-[11px] opacity-70 mt-1 leading-snug">
              Cash · Profit · Net Position
            </p>
          </div>
        </div>

        {/* Big 3 numbers */}
        <HeroStat
          label="Free Cash"
          value={freeCash}
          tone={freeCash >= 0 ? "emerald" : "red"}
          icon={<Banknote size={20} />}
          trend={trendArrow(cashSeries)}
          subtitle="After near-term commitments"
          href="/bank"
        />
        <HeroStat
          label="Net Profit"
          value={profit}
          tone={profit >= 0 ? "emerald" : "red"}
          icon={<TrendingUp size={20} />}
          trend={trendArrow(profitSeries)}
          subtitle={`${margin.toFixed(1)}% margin`}
          href="/monthly-closing"
        />
        <HeroStat
          label="Net Position"
          value={netPosition}
          tone={netPosition >= 0 ? "violet" : "red"}
          icon={<Sparkles size={20} />}
          trend={trendArrow(
            trendSeries(netPosition, trends, (t) => t.ratios.netPosition)
          )}
          subtitle="Cash + owed − we owe"
          href="/balance-sheet"
        />
      </div>

      {/* ═══ MONEY MAP ═══ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Money Map
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            How cash flows from what you have to what's truly free
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
            <FlowNode
              icon={<Wallet size={16} />}
              label="Bank"
              value={moneyInBanks}
              tone="emerald"
            />
            <FlowArrow symbol="+" />
            <FlowNode
              icon={<Users size={16} />}
              label="Clients Owe"
              value={clientsOweUs}
              tone="sky"
            />
            <FlowArrow symbol="−" />
            <FlowNode
              icon={<CreditCard size={16} />}
              label="We Owe"
              value={weOweOthers}
              tone="amber"
            />
          </div>
          <div className="mt-4 border-t border-dashed border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Cash available <strong className="text-slate-800">{formatPKR(mapIn)}</strong>{" "}
              − obligations <strong className="text-slate-800">{formatPKR(mapOut)}</strong>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                Free Cash =
              </span>
              <span
                className={`text-2xl font-bold tabular-nums ${
                  freeCash >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatPKR(freeCash)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 4 PILLARS ═══ */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              The Four Pillars
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Drill into any area that needs a decision
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PillarCard
            title="Cash & Banks"
            icon={<Wallet size={18} />}
            color="emerald"
            href="/bank"
            stats={[
              { label: "In banks", value: moneyInBanks },
              { label: "Expected 7d", value: d.cash.expectedCollections7d },
              { label: "Committed", value: d.cash.committed },
              { label: "Free cash", value: freeCash, bold: true },
            ]}
            series={cashSeries}
            seriesColor="#10b981"
          />
          <PillarCard
            title="Receivables"
            icon={<Users size={18} />}
            color="sky"
            href="/receivables"
            stats={[
              { label: "Open clients", value: d.receivables.openClients, count: true },
              { label: "Outstanding", value: clientsOweUs },
              { label: "Overdue", value: d.receivables.overdue, danger: d.receivables.overdue > 0 },
              { label: "Staff loans", value: d.receivables.leftoverLoans },
            ]}
            series={owedSeries}
            seriesColor="#0ea5e9"
          />
          <PillarCard
            title="Payables"
            icon={<CreditCard size={18} />}
            color="amber"
            href="/payables"
            stats={[
              { label: "Suppliers", value: d.payables.supplierRemaining },
              { label: "Salaries", value: d.payables.salaryPayable },
              { label: "Commissions", value: d.payables.commissionsRemaining },
              { label: "Total owed", value: weOweOthers, bold: true, danger: true },
            ]}
            series={oweSeries}
            seriesColor="#f59e0b"
          />
          <PillarCard
            title="Profit & Margin"
            icon={<TrendingUp size={18} />}
            color="violet"
            href="/monthly-closing"
            stats={[
              { label: "Revenue", value: d.profitability.revenue },
              { label: "Direct costs", value: d.profitability.directCosts },
              { label: "Gross margin", value: grossMargin, pct: true },
              { label: "Net profit", value: profit, bold: true, good: profit >= 0 },
            ]}
            series={profitSeries}
            seriesColor="#8b5cf6"
          />
        </div>
      </section>

      {/* ═══ ATTENTION ═══ */}
      {alerts.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Needs Your Attention
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {alerts.length} item{alerts.length === 1 ? "" : "s"} across cash,
                collectables and obligations
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((a, i) => (
              <AlertCard key={i} {...a} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ THREE COMPACT TABLES ═══ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CompactTable
          title="Top clients owing us"
          icon={<Users size={16} />}
          href="/receivables"
          headers={["Client", "Owed", "Overdue"]}
          rows={topClients.map((c) => ({
            key: c.id,
            cells: [
              c.clientName,
              formatPKR(c.remainingAmount),
              c.daysOverdue > 0 ? (
                <span className="text-red-600 font-medium">{c.daysOverdue}d</span>
              ) : (
                <span className="text-slate-400">—</span>
              ),
            ],
          }))}
          emptyText="No outstanding client balances"
        />
        <CompactTable
          title="Top suppliers we owe"
          icon={<CreditCard size={16} />}
          href="/payables"
          headers={["Supplier", "Owed", "Overdue"]}
          rows={topPayables.map((p) => ({
            key: p.id,
            cells: [
              p.supplierName,
              formatPKR(p.remaining),
              p.daysOverdue > 0 ? (
                <span className="text-red-600 font-medium">{p.daysOverdue}d</span>
              ) : (
                <span className="text-slate-400">—</span>
              ),
            ],
          }))}
          emptyText="No outstanding supplier bills"
        />
        <CompactTable
          title="Top sales reps"
          icon={<Briefcase size={16} />}
          href="/sales-team"
          headers={["Salesperson", "Revenue"]}
          rows={topReps.map(([name, amt]) => ({
            key: name,
            cells: [name, formatPKR(amt)],
          }))}
          emptyText="No sales attributed yet"
        />
      </section>

      {/* ═══ OPERATIONS SUMMARY ═══ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniPanel
          title="Hotels"
          icon={<Building2 size={16} />}
          color="emerald"
          href="/hotels"
          rows={[
            ["Total cost", d.operations.hotelsTotalCost],
            ["Still unpaid", d.operations.hotelsRemaining],
          ]}
        />
        <MiniPanel
          title="Transport"
          icon={<Plane size={16} />}
          color="sky"
          href="/transport"
          rows={[
            ["Agreed", d.operations.transportAgreed],
            ["Paid", d.operations.transportSettlement],
            ["Still unpaid", d.operations.transportRemaining],
          ]}
        />
        <MiniPanel
          title="Running costs"
          icon={<Receipt size={16} />}
          color="slate"
          href="/expenses"
          rows={[
            ["Office", d.monthlyExpenses.office],
            ["Marketing", d.monthlyExpenses.marketing],
            ["Salaries", d.monthlyExpenses.salaries],
            ["Total", d.monthlyExpenses.total],
          ]}
        />
      </section>

      {/* ═══ FOOTER STRIP ═══ */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">
          Assets at cost <strong className="text-slate-800">{formatPKR(d.oneTime.assets)}</strong>{" "}
          · Staff loans <strong className="text-slate-800">{formatPKR(d.oneTime.employeeLoans)}</strong>{" "}
          · Balance check <strong className="text-slate-800">{formatPKR(d.activity.balanceCheck)}</strong>
        </span>
        <div className="flex flex-wrap gap-2">
          <FooterLink href="/transactions" label="Add transaction" />
          <FooterLink href="/balance-sheet" label="Balance Sheet" />
          <FooterLink href="/monthly-closing" label="Month Review" />
        </div>
      </section>
    </div>
  );
}

/* ─── Components ─────────────────────────────────────────────────────── */

function HeroStat({
  label,
  value,
  tone,
  icon,
  trend,
  subtitle,
  href,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "violet";
  icon: React.ReactNode;
  trend: React.ReactNode;
  subtitle: string;
  href: string;
}) {
  const colors = {
    emerald: {
      box: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
      chip: "bg-emerald-100 text-emerald-700",
      num: "text-emerald-800",
    },
    red: {
      box: "border-red-200 bg-gradient-to-br from-red-50 to-white",
      chip: "bg-red-100 text-red-700",
      num: "text-red-800",
    },
    violet: {
      box: "border-violet-200 bg-gradient-to-br from-violet-50 to-white",
      chip: "bg-violet-100 text-violet-700",
      num: "text-violet-800",
    },
  }[tone];

  return (
    <Link
      href={href}
      className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all block ${colors.box}`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-md ${colors.chip}`}>
          {icon}
          {label}
        </span>
        {trend}
      </div>
      <p className={`text-3xl font-bold mt-3 tabular-nums ${colors.num}`}>
        {formatPKR(value)}
      </p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </Link>
  );
}

function FlowNode({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber";
}) {
  const c = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${c}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{formatPKR(value)}</div>
    </div>
  );
}

function FlowArrow({ symbol }: { symbol: string }) {
  return (
    <div className="hidden md:flex items-center justify-center">
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
        {symbol}
      </div>
    </div>
  );
}

function PillarCard({
  title,
  icon,
  color,
  href,
  stats,
  series,
  seriesColor,
}: {
  title: string;
  icon: React.ReactNode;
  color: "emerald" | "sky" | "amber" | "violet";
  href: string;
  stats: {
    label: string;
    value: number;
    count?: boolean;
    bold?: boolean;
    danger?: boolean;
    good?: boolean;
    pct?: boolean;
  }[];
  series: number[];
  seriesColor: string;
}) {
  const bar = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  }[color];

  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-5 block group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${bar}`} />
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
        </div>
        <div className="text-slate-400 group-hover:text-slate-700 transition-colors">
          {icon}
        </div>
      </div>
      <div className="space-y-1.5 mb-3">
        {stats.map((s, i) => (
          <div key={i} className="flex justify-between items-baseline text-sm">
            <span className="text-slate-500">{s.label}</span>
            <span
              className={`tabular-nums ${
                s.bold ? "font-bold text-slate-900" : "font-medium text-slate-700"
              } ${s.danger ? "text-red-600" : ""} ${
                s.good ? "text-emerald-600" : ""
              }`}
            >
              {s.count
                ? s.value
                : s.pct
                  ? `${s.value.toFixed(1)}%`
                  : formatPKR(s.value)}
            </span>
          </div>
        ))}
      </div>
      <Sparkline data={series} color={seriesColor} />
    </Link>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-2" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertCard({
  severity,
  icon,
  title,
  body,
  href,
  cta,
}: {
  severity: "red" | "amber" | "info";
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  const c = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  }[severity];

  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs mt-1 opacity-80">{body}</p>
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold mt-2 hover:underline"
          >
            {cta} <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function CompactTable({
  title,
  icon,
  href,
  headers,
  rows,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  headers: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  emptyText: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{icon}</span>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        </div>
        <Link href={href} className="text-xs text-sky-700 hover:underline">
          View all
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 font-semibold uppercase tracking-wide ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className={`px-3 py-2 ${
                      i === 0 ? "text-slate-800 font-medium" : "text-right tabular-nums text-slate-700"
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MiniPanel({
  title,
  icon,
  color,
  href,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  color: "emerald" | "sky" | "slate";
  href: string;
  rows: [string, number][];
}) {
  const c = {
    emerald: "border-emerald-200 bg-emerald-50/40",
    sky: "border-sky-200 bg-sky-50/40",
    slate: "border-slate-200 bg-slate-50/40",
  }[color];
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 hover:shadow-md transition-shadow block ${c}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-600">{icon}</span>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <div className="space-y-1">
        {rows.map(([label, value], i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium tabular-nums text-slate-800">
              {formatPKR(value)}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-sky-300 hover:text-sky-800"
    >
      {label} <ArrowRight size={12} />
    </Link>
  );
}