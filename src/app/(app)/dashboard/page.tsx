import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { getDashboardData } from "@/lib/dashboard";
import { PeriodSelector } from "@/components/PeriodSelector";
import { KpiCard } from "@/components/KpiCard";
import { formatPKR } from "@/lib/utils";
import { ExportMonthButton } from "@/components/ExportMonthButton";


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
  const data = await getDashboardData(currentPeriod.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Master Financial Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pacific Trips · Lahore, Pakistan · PKR · All values auto-calculated from source sheets
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <PeriodSelector periods={periods} currentId={currentPeriod.id} />
          <ExportMonthButton periodId={currentPeriod.id} periodLabel={currentPeriod.label} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="1. Cash & Bank" color="bg-emerald-500">
          <Row label="HBL / Main" value={data.cash.hbl} />
          <Row label="Faisal Bank" value={data.cash.faisal} />
          <Row label="Meezan Bank" value={data.cash.meezan} />
          <Row label="UBL" value={data.cash.ubl} />
          <Row label="Easypaisa" value={data.cash.easypaisa} />
          <Row label="Jazzcash" value={data.cash.jazzcash} />
          <div className="border-t pt-2 mt-2">
            <Row label="TOTAL BANK BALANCE" value={data.cash.totalBank} bold />
          </div>
          <Row label="Petty Cash Balance" value={data.cash.pettyCash} />
          <div className="border-t pt-2 mt-2">
            <Row label="TOTAL AVAILABLE CASH" value={data.cash.totalAvailable} bold green />
          </div>
          <Row label="Expected Collections (7d)" value={data.cash.expectedCollections7d} />
          <Row label="Committed Payments" value={data.cash.committed} />
          <div className="border-t pt-2 mt-2">
            <Row label="FREE CASH" value={data.cash.freeCash} bold green />
          </div>
        </Section>

        <Section title="2. Money Owed To Us" color="bg-sky-500">
          <Row label="Client Outstanding" value={data.receivables.clientOutstanding} />
          <Row label="Overdue Client Receivables" value={data.receivables.overdue} danger={data.receivables.overdue > 0} />
          <Row label="Open Client Accounts" value={data.receivables.openClients} isCount />
          <Row label="Total Package Value" value={data.receivables.totalPackageValue} />
          <Row label="Total Amount Received" value={data.receivables.totalReceived} />
          <Row label="Employee Loans (staff took)" value={data.receivables.employeeLoans} />
          <Row label="Leftover Employee Loans" value={data.receivables.leftoverLoans} />
          <div className="border-t pt-2 mt-2">
            <Row label="TOTAL OWED TO COMPANY" value={data.receivables.totalOwedToCompany} bold />
          </div>
        </Section>

        <Section title="3. Money We Owe" color="bg-red-500">
          <Row label="Supplier Payables Remaining" value={data.payables.supplierRemaining} />
          <Row label="Overdue Supplier Payables" value={data.payables.overdue} danger={data.payables.overdue > 0} />
          <Row label="Salary Payable (Net)" value={data.payables.salaryPayable} />
          <Row label="Hotel Remaining Payable" value={data.payables.hotelRemaining} />
          <Row label="Commissions Remaining" value={data.payables.commissionsRemaining} />
          <Row label="Refunds Pending to Clients" value={data.payables.refundsPending} />
          <div className="border-t pt-2 mt-2">
            <Row label="TOTAL WE OWE" value={data.payables.totalWeOwe} bold danger />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="4. Monthly Recurring Expenses">
          <Row label="Office Expenses" value={data.monthlyExpenses.office} />
          <Row label="Marketing Spend" value={data.monthlyExpenses.marketing} />
          <Row label="Salaries (Net Payable)" value={data.monthlyExpenses.salaries} />
          <Row label="Loan Installments collected" value={data.monthlyExpenses.loanInstallments} />
          <Row label="Commissions Accrued" value={data.monthlyExpenses.commissionsAccrued} />
          <div className="border-t pt-2 mt-2">
            <Row label="TOTAL MONTHLY EXPENSES" value={data.monthlyExpenses.total} bold />
          </div>
        </Section>

        <Section title="5. One-Time / Non-Monthly">
          <Row label="Supplier Advances" value={data.oneTime.supplierAdvances} />
          <Row label="Employee Loans Outstanding" value={data.oneTime.employeeLoans} />
          <Row label="Company Assets (at cost)" value={data.oneTime.assets} />
          <Row label="Vadets Tracker Total" value={data.oneTime.vadets} />
          <Row label="Owner Capital Introduced" value={data.oneTime.ownerCapital} />
          <Row label="Owner Withdrawals" value={data.oneTime.ownerWithdrawals} />
        </Section>

        <Section title="6. Profitability (MTD)">
          <Row label="Trip Revenue (MTD)" value={data.profitability.tripRevenue} />
          <Row label="Direct Trip Costs" value={data.profitability.directTripCosts} />
          <Row label="Gross Trip Profit" value={data.profitability.grossTripProfit} />
          <Row label="Net Trip Profit" value={data.profitability.netTripProfit} />
          <Row label="Operating Expenses" value={data.profitability.operatingExpenses} />
          <div className="border-t pt-2 mt-2">
            <Row
              label="NET PROFIT / (LOSS)"
              value={data.profitability.netProfit}
              bold
              danger={data.profitability.netProfit < 0}
              green={data.profitability.netProfit >= 0}
            />
          </div>
          <Row label="Profit Margin %" value={`${data.profitability.marginPct.toFixed(1)}%`} isText />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="7. Operations (Hotels / Transport / Tickets)">
          <Row label="Hotels Total Booking Cost" value={data.operations.hotelsTotalCost} />
          <Row label="Hotels Remaining Payable" value={data.operations.hotelsRemaining} />
          <Row label="Transport Agreed Cost" value={data.operations.transportAgreed} />
          <Row label="Transport Final Settlement" value={data.operations.transportSettlement} />
          <Row label="Ticketing Cost (paid)" value={data.operations.ticketingPaid} />
          <Row label="Ticketing Charged to Clients" value={data.operations.ticketingCharged} />
          <Row label="Ticketing Profit" value={data.operations.ticketingProfit} green />
        </Section>

        <Section title="8. Transactions & Activity">
          <Row label="Total Debits" value={data.activity.totalDebits} />
          <Row label="Total Credits" value={data.activity.totalCredits} />
          <Row label="Balance Check (D−C)" value={data.activity.balanceCheck} />
          <Row label="Basic Salaries Total" value={data.activity.basicSalaries} />
          <Row label="Tax Deducted Total" value={data.activity.taxDeducted} />
          <Row label="Commissions Eligible" value={data.activity.commissionsEligible} />
        </Section>

        <Section title="9. Summary Ratios">
          <Row label="Cash + Client Receivables" value={data.ratios.cashPlusReceivables} />
          <Row label="Cash + All Owed to Us" value={data.ratios.cashPlusAllOwed} />
          <Row label="Total We Owe" value={data.ratios.totalWeOwe} />
          <Row
            label="Net Position"
            value={data.ratios.netPosition}
            danger={data.ratios.netPosition < 0}
            green={data.ratios.netPosition >= 0}
          />
          <Row label="Assets + Cash" value={data.ratios.assetsPlusCash} />
          <Row label="Salary % of Trip Revenue" value={`${data.ratios.salaryPctOfRevenue.toFixed(1)}%`} isText />
          <Row label="Monthly Exp % of Revenue" value={`${data.ratios.monthlyExpPctOfRevenue.toFixed(1)}%`} isText />
        </Section>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Free Cash" value={data.cash.freeCash} variant="success" />
        <KpiCard title="Total We Owe" value={data.payables.totalWeOwe} variant="danger" />
        <KpiCard
          title="Net Profit / (Loss)"
          value={data.profitability.netProfit}
          variant={data.profitability.netProfit >= 0 ? "success" : "danger"}
        />
        <KpiCard
          title="Net Position"
          value={data.ratios.netPosition}
          variant={data.ratios.netPosition >= 0 ? "success" : "warning"}
        />
      </div>

      <p className="text-xs text-slate-400 border-t pt-4">
        HOW TO READ • Monthly Recurring (Section 4) repeat every month. One-Time (Section 5) are advances, loans, assets, owner capital.
        Employee loans = money staff borrowed FROM the company. Salary Payable = Net after installment deduction.
        Switch period above to view any historical month. All calculated values update automatically.
      </p>
    </div>
  );
}

function Section({
  title,
  color,
  children,
}: {
  title: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        {color && <span className={`w-2 h-2 rounded-full ${color}`} />}
        {title}
      </h2>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  green,
  danger,
  isCount,
  isText,
}: {
  label: string;
  value: number | string;
  bold?: boolean;
  green?: boolean;
  danger?: boolean;
  isCount?: boolean;
  isText?: boolean;
}) {
  const display = isText
    ? value
    : isCount
      ? String(value)
      : typeof value === "number"
        ? formatPKR(value)
        : value;

  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-slate-600 truncate">{label}</span>
      <span
        className={`tabular-nums shrink-0 ${bold ? "font-bold" : "font-medium"} ${green ? "text-emerald-600" : danger ? "text-red-600" : "text-slate-900"
          }`}
      >
        {display}
      </span>
    </div>
  );
}
