import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { getDashboardData } from "@/lib/dashboard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";
import { ExportMonthButton } from "@/components/ExportMonthButton";
import Link from "next/link";

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
    const current = await getOrCreatePeriod(
      now.getFullYear(),
      now.getMonth() + 1
    );
    periodId = current.id;
    periods = await listPeriods();
  }

  const currentPeriod = periods.find((p) => p.id === periodId) ?? periods[0];
  const d = await getDashboardData(currentPeriod.id);

  const moneyInBanks = d.cash.totalAvailable;
  const clientsOweUs = d.receivables.clientOutstanding;
  const weOweOthers = d.payables.totalWeOwe;
  const profit = d.profitability.netProfit;
  const freeCash = d.cash.freeCash;
  const netPosition = d.ratios.netPosition;
  const margin = d.profitability.marginPct;

  let health: "good" | "ok" | "tight" = "good";
  let healthTitle = "Business looks healthy";
  let healthBlurb =
    "You have enough cash, clients still owe you money, and the month is in profit.";
  if (profit < 0 || netPosition < 0) {
    health = "tight";
    healthTitle = "Needs attention";
    healthBlurb =
      "Either this month is in loss, or what you owe is higher than cash plus what clients still owe you. Review payables and collections.";
  } else if (freeCash < 0 || weOweOthers > moneyInBanks) {
    health = "ok";
    healthTitle = "Manage carefully";
    healthBlurb =
      "You can operate, but free cash is tight or bills are high versus bank balances. Prioritise collections and big supplier payments.";
  }

  const healthStyles = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-900",
    ok: "bg-amber-50 border-amber-200 text-amber-900",
    tight: "bg-red-50 border-red-200 text-red-900",
  } as const;

  const healthDot = {
    good: "bg-emerald-500",
    ok: "bg-amber-500",
    tight: "bg-red-500",
  } as const;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pacific Trips · Lahore · All figures in PKR
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Dashboard
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            One-page picture of money in the bank, what clients still owe,
            what we still have to pay, and whether this month made a profit.
            Numbers update automatically from your entries.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <PeriodSelector
            periods={periods}
            currentId={currentPeriod.id}
            allowCreate
          />
          <ExportMonthButton
            periodId={currentPeriod.id}
            periodLabel={currentPeriod.label}
          />
        </div>
      </div>

      {/* Health banner */}
      <div className={`rounded-2xl border p-5 sm:p-6 ${healthStyles[health]}`}>
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 h-3 w-3 rounded-full shrink-0 ${healthDot[health]}`}
          />
          <div>
            <h2 className="text-lg font-bold">{healthTitle}</h2>
            <p className="text-sm mt-1 opacity-90">{healthBlurb}</p>
            <p className="text-xs mt-3 opacity-75">
              Viewing: <strong>{currentPeriod.label}</strong>
              {" · "}
              Change the month above to see another period.
            </p>
          </div>
        </div>
      </div>

      {/* Four big numbers */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          The big picture
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <BigStat
            title="Money in banks & cash"
            value={moneyInBanks}
            hint="All bank accounts right now"
            tone="emerald"
            href="/bank"
          />
          <BigStat
            title="Clients still owe us"
            value={clientsOweUs}
            hint="Unpaid trip packages (receivables)"
            tone="sky"
            href="/receivables"
          />
          <BigStat
            title="We still owe others"
            value={weOweOthers}
            hint="Hotels, transport, salaries, refunds, bills"
            tone="amber"
            href="/payables"
          />
          <BigStat
            title="Profit this month"
            value={profit}
            hint={
              margin != null
                ? `About ${margin.toFixed(0)}% of revenue`
                : "Revenue minus direct costs and expenses"
            }
            tone={profit >= 0 ? "emerald" : "red"}
            href="/monthly-closing"
          />
        </div>
      </div>

      {/* Free cash + net position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InsightCard
          title="Free cash (after commitments)"
          value={freeCash}
          good={freeCash >= 0}
          body="Bank money minus near-term commitments. Positive means you can cover short-term needs without stress."
        />
        <InsightCard
          title="Net position"
          value={netPosition}
          good={netPosition >= 0}
          body="Cash + what clients owe + staff loans still open, minus everything we still owe. A simple 'are we ahead?' number."
        />
      </div>

      {/* Detailed sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="Where is our money?"
          subtitle="Bank accounts"
          color="emerald"
          link={{ href: "/bank", label: "Open Bank" }}
        >
          <Row label="HBL / Main" value={d.cash.hbl} />
          <Row label="Faysal Bank" value={d.cash.faysal} />
          <Row label="Meezan Bank" value={d.cash.meezan} />
          <Row label="UBL" value={d.cash.ubl} />
          <Row label="Easypaisa" value={d.cash.easypaisa} />
          <Row label="JazzCash" value={d.cash.jazzcash} />
          <Divider />
          <Row label="Total in banks" value={d.cash.totalBank} bold />
          <Row
            label="Expected collections (7 days)"
            value={d.cash.expectedCollections7d}
          />
          <Row label="Committed (short term)" value={d.cash.committed} />
          <Row
            label="Free cash"
            value={d.cash.freeCash}
            bold
            tone={d.cash.freeCash >= 0 ? "good" : "bad"}
          />
          <Tip>
            Free cash is what is left after short-term commitments. Keep this
            positive so day-to-day payments stay easy.
          </Tip>
        </Panel>

        <Panel
          title="Money clients still owe us"
          subtitle="Unpaid packages and staff loans"
          color="sky"
          link={{ href: "/receivables", label: "Open Receivables" }}
        >
          <Row
            label="Clients still to pay"
            value={d.receivables.clientOutstanding}
            bold
          />
          <Row
            label="Of which overdue"
            value={d.receivables.overdue}
            tone={d.receivables.overdue > 0 ? "bad" : undefined}
          />
          <Row label="Open client files" value={d.receivables.openClients} isCount />
          <Row
            label="Total package value (month)"
            value={d.receivables.totalPackageValue}
          />
          <Row
            label="Already received from clients"
            value={d.receivables.totalReceived}
          />
          <Divider />
          <Row label="Staff loans still open" value={d.receivables.leftoverLoans} />
          <Row
            label="Total owed to the company"
            value={d.receivables.totalOwedToCompany}
            bold
          />
          <Tip>
            Overdue means the due date has passed. Follow up those clients first.
            Staff loans are money employees borrowed from the company.
          </Tip>
        </Panel>

        <Panel
          title="Money we still have to pay"
          subtitle="Suppliers, salaries, refunds"
          color="amber"
          link={{ href: "/payables", label: "Open Payables" }}
        >
          <Row label="Hotels still to pay" value={d.payables.hotelRemaining} />
          <Row label="All suppliers remaining" value={d.payables.supplierRemaining} />
          <Row
            label="Overdue supplier bills"
            value={d.payables.overdue}
            tone={d.payables.overdue > 0 ? "bad" : undefined}
          />
          <Row label="Salaries still payable" value={d.payables.salaryPayable} />
          <Row
            label="Commissions still to pay"
            value={d.payables.commissionsRemaining}
          />
          <Row label="Client refunds pending" value={d.payables.refundsPending} />
          <Row label="Other liabilities" value={d.payables.otherLiabilities} />
          <Divider />
          <Row
            label="Total we still owe"
            value={d.payables.totalWeOwe}
            bold
            tone="bad"
          />
          <Tip>
            Pay overdue hotel and transport bills first so trips stay smooth.
            Salaries and refunds affect trust with staff and clients.
          </Tip>
        </Panel>

        <Panel
          title="This month's profit"
          subtitle="Sales, direct costs, and expenses"
          color="violet"
          link={{ href: "/monthly-closing", label: "Monthly Closing" }}
        >
          <Row
            label="Total revenue (packages sold)"
            value={d.profitability.tripRevenue}
            bold
          />
          <Row label="Direct trip costs" value={d.profitability.directTripCosts} />
          <Row
            label="Gross trip profit"
            value={d.profitability.grossTripProfit}
          />
          <Divider />
          <Row label="Office expenses" value={d.monthlyExpenses.office} />
          <Row label="Marketing" value={d.monthlyExpenses.marketing} />
          <Row label="Salaries (this month)" value={d.monthlyExpenses.salaries} />
          <Row
            label="Loan installments"
            value={d.monthlyExpenses.loanInstallments}
          />
          <Row
            label="Commissions accrued"
            value={d.monthlyExpenses.commissionsAccrued}
          />
          <Row label="Total monthly expenses" value={d.monthlyExpenses.total} />
          <Divider />
          <Row
            label="Net profit / (loss)"
            value={d.profitability.netProfit}
            bold
            tone={d.profitability.netProfit >= 0 ? "good" : "bad"}
          />
          <Row
            label="Profit margin"
            value={`${d.profitability.marginPct.toFixed(1)}%`}
            isText
          />
          <Tip>
            Gross profit is revenue minus direct trip costs. Net profit is after
            office, marketing, salaries, and commissions. Margin is profit as a
            percent of revenue.
          </Tip>
        </Panel>
      </div>

      {/* Operations + extras */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Hotels & transport" subtitle="Operations this month" color="slate">
          <Row label="Hotel total cost" value={d.operations.hotelsTotalCost} />
          <Row label="Hotel still unpaid" value={d.operations.hotelsRemaining} />
          <Row label="Transport agreed" value={d.operations.transportAgreed} />
          <Row label="Transport settlement" value={d.operations.transportSettlement} />
          <Row label="Transport still unpaid" value={d.operations.transportRemaining} />
        </Panel>

        <Panel title="Monthly running costs" subtitle="Repeat every month" color="slate">
          <Row label="Office" value={d.monthlyExpenses.office} />
          <Row label="Marketing" value={d.monthlyExpenses.marketing} />
          <Row label="Salaries" value={d.monthlyExpenses.salaries} />
          <Row
            label="Loan installments"
            value={d.monthlyExpenses.loanInstallments}
          />
          <Row label="Commissions" value={d.monthlyExpenses.commissionsAccrued} />
          <Divider />
          <Row label="Total" value={d.monthlyExpenses.total} bold />
          <Row
            label="Share of revenue"
            value={`${d.monthlyExpenses.pctOfRevenue.toFixed(1)}%`}
            isText
          />
        </Panel>

        <Panel title="One-time & assets" subtitle="Not every month" color="slate">
          <Row label="Employee loans open" value={d.oneTime.employeeLoans} />
          <Row label="Company assets value" value={d.oneTime.assets} />
          <Tip>
            Company assets are recorded at purchase cost. Employee loans are
            money staff still owe the company.
          </Tip>
        </Panel>
      </div>

      {/* How to read */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900">How to read this page</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-700 list-decimal list-inside">
          <li>
            <strong>Green health banner</strong> means cash and profit look fine.
            Amber or red means follow up collections or big bills.
          </li>
          <li>
            <strong>Money in banks</strong> is what you can spend today.{" "}
            <strong>Clients still owe us</strong> is future cash if they pay.
          </li>
          <li>
            <strong>We still owe others</strong> must be paid to hotels, drivers,
            staff, and clients (refunds).
          </li>
          <li>
            <strong>Profit this month</strong> is after direct costs and running
            expenses. Negative means the month lost money.
          </li>
          <li>
            Use the <strong>month selector</strong> at the top to compare other
            months. Export downloads a spreadsheet for that month.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <QuickLink href="/transactions" label="Add payment / receipt" />
          <QuickLink href="/receivables" label="See who owes us" />
          <QuickLink href="/payables" label="See who we owe" />
          <QuickLink href="/sales-team" label="Sales team & target" />
          <QuickLink href="/bank" label="Bank balances" />
        </div>
      </div>
    </div>
  );
}

function BigStat({
  title,
  value,
  hint,
  tone,
  href,
}: {
  title: string;
  value: number;
  hint: string;
  tone: "emerald" | "sky" | "amber" | "red";
  href: string;
}) {
  const box = {
    emerald: "border-emerald-200 bg-emerald-50",
    sky: "border-sky-200 bg-sky-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
  }[tone];
  const num = {
    emerald: "text-emerald-800",
    sky: "text-sky-800",
    amber: "text-amber-800",
    red: "text-red-800",
  }[tone];

  return (
    <Link
      href={href}
      className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow block ${box}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </p>
      <p className={`text-2xl font-bold mt-2 tabular-nums ${num}`}>
        {formatPKR(value)}
      </p>
      <p className="text-xs text-slate-600 mt-2 leading-snug">{hint}</p>
    </Link>
  );
}

function InsightCard({
  title,
  value,
  body,
  good,
}: {
  title: string;
  value: number;
  body: string;
  good: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        good ? "border-emerald-200 bg-white" : "border-red-200 bg-red-50/40"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p
        className={`text-2xl font-bold mt-1 tabular-nums ${
          good ? "text-emerald-700" : "text-red-700"
        }`}
      >
        {formatPKR(value)}
      </p>
      <p className="text-sm text-slate-600 mt-2">{body}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  color,
  link,
  children,
}: {
  title: string;
  subtitle: string;
  color: "emerald" | "sky" | "amber" | "violet" | "slate";
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const bar = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    slate: "bg-slate-400",
  }[color];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${bar}`} />
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          {link && (
            <Link
              href={link.href}
              className="text-xs font-medium text-sky-700 hover:underline shrink-0"
            >
              {link.label} →
            </Link>
          )}
        </div>
      </div>
      <div className="px-5 py-4 space-y-2.5 text-sm">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  isCount,
  isText,
  tone,
}: {
  label: string;
  value: number | string;
  bold?: boolean;
  isCount?: boolean;
  isText?: boolean;
  tone?: "good" | "bad";
}) {
  const display = isText
    ? value
    : isCount
      ? String(value)
      : typeof value === "number"
        ? formatPKR(value)
        : value;

  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-red-700"
        : "text-slate-900";

  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-slate-600">{label}</span>
      <span
        className={`tabular-nums shrink-0 ${
          bold ? "font-bold" : "font-medium"
        } ${color}`}
      >
        {display}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 my-1" />;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mt-2 leading-relaxed">
      {children}
    </p>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-sky-300 hover:text-sky-800"
    >
      {label}
    </Link>
  );
}