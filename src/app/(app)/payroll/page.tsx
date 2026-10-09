import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { ComputePayrollButton } from "@/components/ComputePayrollButton";
import { InitPayrollButton } from "@/components/InitPayrollButton";
import { formatPKR } from "@/lib/utils";

const fields: FieldDef[] = [
  { key: "employeeName", label: "Employee Name", required: true },
  { key: "basicSalary", label: "Basic Salary", type: "number" as const, money: true },
  { key: "taxDeducted", label: "Tax Deducted", type: "number" as const, money: true },
  { key: "loanInstallment", label: "Loan Installment", type: "number" as const, money: true },
  { key: "otherDeductions", label: "Other Deductions", type: "number" as const, money: true },
  { key: "netPayable", label: "Net Payable", type: "number" as const, money: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Pending", "Paid"] },
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

  const [rows, commissions, salesStaff, otherStaff] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId: current.id },
      orderBy: { employeeName: "asc" },
    }),
    prisma.commission.findMany({ where: { periodId: current.id } }),
    prisma.employee.findMany({
      where: { isActive: true, role: "Sales" },
      orderBy: { name: "asc" },
      include: { loans: true },
    }),
    prisma.employee.findMany({
      where: { isActive: true, role: { not: "Sales" } },
      orderBy: { name: "asc" },
    }),
  ]);

  const salesNames = new Set(salesStaff.map((e) => e.name));
  const salesPayroll = rows.filter((r) => salesNames.has(r.employeeName));
  const otherPayroll = rows.filter((r) => !salesNames.has(r.employeeName));

  const totalSalesNet = salesPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalOtherNet = otherPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalComm = commissions.reduce((s, c) => s + c.commissionAmt, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll & Commissions</h1>
          <p className="text-sm text-slate-500">
            Commission is <strong>only for Sales team</strong>. Lead Amad Amjad = 2.5% of ALL team sales (no basic).
            Other sales = 40k basic + 2.5% of own sales. Non-sales staff = fixed salary only.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      {/* Sales team roster */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h2 className="font-semibold text-emerald-900 mb-2">
          Sales Team ({salesStaff.length} members) — eligible for 2.5% commission
        </h2>
        <div className="flex flex-wrap gap-2">
          {salesStaff.map((e) => {
            const isLead =
              e.name.toLowerCase().includes("amad") ||
              e.name.toLowerCase().includes("ammar");
            const loan = e.loans?.[0];
            return (
              <span
                key={e.id}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  isLead
                    ? "bg-amber-100 border-amber-300 text-amber-900 font-semibold"
                    : "bg-white border-emerald-300 text-emerald-800"
                }`}
              >
                {e.name}
                {isLead ? " (Team Lead)" : ""}
                {loan ? ` · loan ${formatPKR(loan.remainingAmount)}` : ""}
              </span>
            );
          })}
          {salesStaff.length === 0 && (
            <span className="text-sm text-amber-700">
              No sales employees found. Run seed or add employees with Role = Sales in Settings.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <InitPayrollButton periodId={current.id} />
        <ComputePayrollButton periodId={current.id} />
        <span className="text-xs text-slate-500">
          Compute updates <strong>Sales only</strong>: commission from trips/receivables + loan installments
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Sales Net: <strong>{formatPKR(totalSalesNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Other Staff Net: <strong>{formatPKR(totalOtherNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Commissions: <strong>{formatPKR(totalComm)}</strong>
        </span>
      </div>

      {/* Sales payroll table */}
      <div>
        <h2 className="text-lg font-semibold mb-2 text-emerald-800">
          Sales Team Payroll ({salesPayroll.length})
        </h2>
        {salesPayroll.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-slate-600">
            No sales payroll rows for this month yet.
            {salesStaff.length > 0 ? (
              <>
                {" "}
                Click <strong>Compute Sales Payroll</strong> or re-run seed:
                <code className="ml-1 text-xs bg-slate-100 px-1 rounded">npx tsx scripts/seed.ts</code>
              </>
            ) : (
              <> Add Sales employees in Settings first.</>
            )}
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

      {/* Commissions */}
      {commissions.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold mb-2">Commissions (Sales only)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase border-b">
                <th className="py-1">Employee</th>
                <th className="py-1 text-right">Sale Base</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Commission</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1.5">{c.employeeName}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPKR(c.saleAmount)}</td>
                  <td className="py-1.5 text-right">{c.commissionRate}%</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {formatPKR(c.commissionAmt)}
                  </td>
                  <td className="py-1.5">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Other staff */}
      <div>
        <h2 className="text-lg font-semibold mb-2 text-slate-700">
          Other Staff — no commission ({otherPayroll.length})
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          CEO, Accountant, Marketing, Legal, Office Boy, Designer — fixed salary only.
          {otherStaff.length > 0 && (
            <> Roster: {otherStaff.map((e) => e.name).join(", ")}</>
          )}
        </p>
        {otherPayroll.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-sm text-slate-500">
            No non-sales payroll rows. Run seed or Add rows below for Abdullah, Kamran, etc.
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
