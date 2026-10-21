import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { ComputePayrollButton } from "@/components/ComputePayrollButton";
import { InitPayrollButton } from "@/components/InitPayrollButton";
import { SyncAllPayrollButton } from "@/components/SyncAllPayrollButton";
import { formatPKR } from "@/lib/utils";

const DESIGNATION: Record<string, string> = {
  "Mr Ahsaan": "Sales",
  "Ahmad Amjad": "Team Lead-Sales",
  "Maira": "Sales",
  "Zunaira": "Sales",
  "Awais": "Sales",
  "Malika": "Sales",
  "Talha": "Sales",
  "Naimal": "Sales",
  "Ashir": "Sales",
  "Izza": "Sales",
  "Ahmed": "Graphic Designer",
  "Faysal": "Meta Marketing",
  "Abdullah": "CEO",
  "Kamran": "Accountant",
  "WAseem Akram": "Legal Team",
  "Nadeem": "Office Boy",
};

/**
 * Normalize a role string.
 * Returns the canonical role, treating any case variant of "sales" or
 * "team lead-sales" as the correct bucket.
 */
function normalizeRole(role: string | null | undefined): string {
  if (!role) return "Staff";
  const r = role.trim();
  const lower = r.toLowerCase();
  if (lower === "sales") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return r;
}

function teamLabel(name: string, role?: string | null): string {
  if (DESIGNATION[name]) return DESIGNATION[name];
  const norm = normalizeRole(role);
  if (norm === "Sales" || norm === "Team Lead-Sales") return norm;
  return role || "Staff";
}

const fields: FieldDef[] = [
  { key: "employeeName", label: "Employee Name", required: true },
  {
    key: "team",
    label: "Team / Designation",
    type: "select" as const,
    options: [
      "Sales",
      "Team Lead-Sales",
      "Graphic Designer",
      "Meta Marketing",
      "CEO",
      "Accountant",
      "Legal Team",
      "Office Boy",
      "Staff",
    ],
  },
  { key: "bonus", label: "Bonus", type: "number" as const, money: true },
  { key: "basicSalary", label: "Basic Salary", type: "number" as const, money: true },
  { key: "commissionAmt", label: "Commission (2.5%)", type: "number" as const, money: true, readOnly: true },
  { key: "taxDeducted", label: "Tax Deducted", type: "number" as const, money: true },
  { key: "loanInstallment", label: "Loan Installment (This Month)", type: "number" as const, money: true },
  { key: "loanOriginal", label: "Loan Original", type: "number" as const, money: true, readOnly: true },
  { key: "loanBalance", label: "Loan Balance (Total Owed)", type: "number" as const, money: true, readOnly: true },
  { key: "otherDeductions", label: "Other Deductions", type: "number" as const, money: true },
  { key: "netPayable", label: "Net Payable", type: "number" as const, money: true },
  { key: "amountPaid", label: "Amount Paid", type: "number" as const, money: true },
  { key: "remaining", label: "Remaining", type: "number" as const, money: true, readOnly: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Pending", "Partial", "Paid"] },
  { key: "paidDate", label: "Paid Date", type: "date" as const },
  { key: "notes", label: "Notes", type: "textarea" as const },
];

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

  // Fetch ALL active employees — not just Sales. We partition below using
  // normalizeRole so any case variant lands in the right bucket.
  const [rows, commissions, allEmployees] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId: current.id },
      orderBy: { employeeName: "asc" },
    }),
    prisma.commission.findMany({ where: { periodId: current.id } }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { loans: true },
    }),
  ]);

  const roleByName: Record<string, string> = {};
  for (const e of allEmployees) {
    roleByName[e.name] = normalizeRole(e.role);
  }

  const loanByEmp: Record<string, { originalAmount: number; remainingAmount: number }> = {};
  for (const e of allEmployees) {
    const loan = e.loans?.[0];
    if (loan) {
      loanByEmp[e.name] = {
        originalAmount: loan.originalAmount,
        remainingAmount: loan.remainingAmount,
      };
    }
  }

  const commissionByEmp: Record<string, number> = {};
  for (const c of commissions) {
    const empRole = roleByName[c.employeeName];
    if (empRole === "Sales" || empRole === "Team Lead-Sales") {
      commissionByEmp[c.employeeName] =
        (commissionByEmp[c.employeeName] || 0) + c.commissionAmt;
    }
  }

  const enriched = rows.map((r) => ({
    ...r,
    team: teamLabel(r.employeeName, roleByName[r.employeeName]),
    commissionAmt: commissionByEmp[r.employeeName] ?? 0,
    loanOriginal: loanByEmp[r.employeeName]?.originalAmount ?? 0,
    loanBalance: loanByEmp[r.employeeName]?.remainingAmount ?? 0,
  }));

  // Partition: any employee whose normalized role is Sales OR Team Lead-Sales
  // belongs in the Sales Team payroll block. Everything else is Other Staff.
  const salesNames = new Set(
    allEmployees
      .filter((e) => {
        const r = normalizeRole(e.role);
        return r === "Sales" || r === "Team Lead-Sales";
      })
      .map((e) => e.name)
  );

  const salesPayroll = enriched.filter((r) => salesNames.has(r.employeeName));
  const otherPayroll = enriched.filter((r) => !salesNames.has(r.employeeName));

  const totalSalesNet = salesPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalOtherNet = otherPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalComm = commissions.reduce((s, c) => s + c.commissionAmt, 0);

  const totalOutstandingSalary =
    enriched.reduce((s, r) => s + Math.max(0, r.netPayable - (r.amountPaid ?? 0)), 0);

  // Roster chips at the top of the page
  const salesRoster = allEmployees.filter((e) => {
    const r = normalizeRole(e.role);
    return r === "Sales" || r === "Team Lead-Sales";
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll &amp; Commissions</h1>
          <p className="text-sm text-slate-500">
            Commission only for Sales / Team Lead-Sales. Team Lead: 55,000 flat under 70 lacs, 1% from 70 lacs to target, 2.5% at/above target (no basic).
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h2 className="font-semibold text-emerald-900 mb-2">
          Sales Team ({salesRoster.length}) - 2.5% commission (Team Lead tiered)
        </h2>
        <div className="flex flex-wrap gap-2">
          {salesRoster.map((e) => {
            const des = teamLabel(e.name, e.role);
            const isLead = normalizeRole(e.role) === "Team Lead-Sales";
            const loan = e.loans?.[0];
            const payRow = rows.find((r) => r.employeeName === e.name);
            const comm = commissions.find((c) => c.employeeName === e.name);
            return (
              <span
                key={e.id}
                className={`text-xs px-2.5 py-1 rounded-full border ${isLead
                  ? "bg-amber-100 border-amber-300 text-amber-900 font-semibold"
                  : "bg-white border-emerald-300 text-emerald-800"
                  }`}
              >
                {e.name}  ·  {des}
                {loan
                  ? `  ·  loan remaining ${formatPKR(loan.remainingAmount)} (${formatPKR(
                    loan.monthlyInstallment
                  )}/mo)`
                  : ""}
                {comm ? `  ·  comm ${formatPKR(comm.commissionAmt)}` : ""}
                {payRow ? `  ·  net ${formatPKR(payRow.netPayable)}` : ""}
              </span>
            );
          })}
          {salesRoster.length === 0 && (
            <span className="text-xs text-emerald-800">
              No Sales / Team Lead-Sales employees yet. Add one in Settings.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <InitPayrollButton periodId={current.id} />
        <ComputePayrollButton periodId={current.id} />
        <SyncAllPayrollButton periodId={current.id} />
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Sales Net: <strong>{formatPKR(totalSalesNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Other Net: <strong>{formatPKR(totalOtherNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Commissions: <strong>{formatPKR(totalComm)}</strong>
        </span>
        <span className="text-sm bg-amber-100 text-amber-900 px-3 py-1.5 rounded-md">
          Outstanding Salary: <strong>{formatPKR(totalOutstandingSalary)}</strong>
        </span>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2 text-emerald-800">
          Sales Team Payroll ({salesPayroll.length})
        </h2>
        {salesPayroll.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-slate-600">
            No Sales payroll rows yet. Add a Sales / Team Lead-Sales employee
            in Settings, then click <strong>Load team into payroll</strong> or{" "}
            <strong>Sync Payroll (all Sales)</strong>.
          </div>
        ) : (
          <CrudPanel
            title="Sales Team Payroll"
            apiPath="/api/payroll"
            periodId={current.id}
            fields={fields}
            rows={salesPayroll as unknown as (Record<string, unknown> & { id: string })[]}
          />
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2 text-slate-700">
          Other Staff - no commission ({otherPayroll.length})
        </h2>
        {otherPayroll.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-slate-500">
            No other-staff payroll rows in this period.
          </div>
        ) : (
          <CrudPanel
            title="Other Staff Payroll"
            apiPath="/api/payroll"
            periodId={current.id}
            fields={fields}
            rows={otherPayroll as unknown as (Record<string, unknown> & { id: string })[]}
          />
        )}
      </div>
    </div>
  );
}